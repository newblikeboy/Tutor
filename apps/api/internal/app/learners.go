package app

import (
	"context"
	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"net/http"
	"strings"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
)

type LearnerInput struct {
	Name      string `json:"name" bson:"name"`
	Class     int    `json:"class" bson:"class"`
	Board     string `json:"board" bson:"board"`
	Language  string `json:"language" bson:"language"`
	Kind      string `json:"kind" bson:"kind"`
	ConsentID string `json:"consentId" bson:"consentId"`
}

func validLearner(in LearnerInput, draft bool) bool {
	minName, minClass := 1, 1
	if draft {
		minName, minClass = 0, 0
	}
	return validText(in.Name, minName, 80) && in.Class >= minClass && in.Class <= 12 &&
		(enum(in.Board, "CBSE", "BSEB", "ICSE") || draft && in.Board == "") &&
		(enum(in.Language, "Hindi", "English") || draft && in.Language == "") && enum(in.Kind, "minor", "adult_self")
}

func (a *App) checkLearnerConsent(ctx context.Context, owner string, in LearnerInput) error {
	if in.Kind != "minor" {
		return nil
	}
	if a.Config.Env == "production" {
		return domain.Fail(503, "guardian_unconfigured", "Guardian verification is not enabled.")
	}
	_, err := storage.One[domain.Consent](ctx, a.Store, "consents", bson.M{"_id": in.ConsentID, "ownerId": owner, "version": "guardian-draft-v1"})
	if err == mongo.ErrNoDocuments {
		return domain.Fail(403, "guardian_required", "Guardian consent is required before collecting learner details.")
	}
	return err
}

func (a *App) updateLearner(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "parent") {
		return
	}
	var in struct {
		Name            string `json:"name"`
		Class           int    `json:"class"`
		Board           string `json:"board"`
		Language        string `json:"language"`
		ExpectedVersion int    `json:"expectedVersion"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	var result domain.Learner
	err := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		var err error
		result, err = storage.One[domain.Learner](ctx, a.Store, "learners", bson.M{"_id": chi.URLParam(r, "id"), "ownerId": user(r).ID})
		if err != nil {
			return err
		}
		if result.Version != in.ExpectedVersion {
			return domain.Fail(409, "learner_stale", "The learner profile has changed. Reload before editing.")
		}
		fields := LearnerInput{Name: in.Name, Class: in.Class, Board: in.Board, Language: in.Language, Kind: result.Kind, ConsentID: result.ConsentID}
		if !validLearner(fields, false) {
			return domain.Fail(422, "validation", "Check learner name, class, board and language.")
		}
		if err = a.checkLearnerConsent(ctx, user(r).ID, fields); err != nil {
			return err
		}
		result.Name, result.Class, result.Board, result.Language = in.Name, in.Class, in.Board, in.Language
		result.Version++
		if _, err = a.Store.C("learners").ReplaceOne(ctx, bson.M{"_id": result.ID, "ownerId": user(r).ID}, result); err != nil {
			return err
		}
		// Trials, agreements and learning records retain their original snapshots.
		return a.audit(ctx, user(r).ID, "learner.updated", result.ID)
	})
	if err != nil {
		a.error(w, r, err)
		return
	}
	a.json(w, 200, result)
}

// Profile drafts use a separate key from matching drafts in the existing collection.
type learnerDraft struct {
	LearnerInput `bson:",inline"`
	ID           string `json:"-" bson:"_id"`
	Step         int    `json:"step" bson:"step"`
	RequestID    string `json:"requestId" bson:"requestId"`
	Version      int    `json:"version" bson:"version"`
}

func (a *App) getLearnerDraft(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "parent") {
		return
	}
	v, err := storage.One[learnerDraft](r.Context(), a.Store, "drafts", bson.M{"_id": "learner:" + user(r).ID})
	if err == mongo.ErrNoDocuments {
		a.json(w, 200, nil)
		return
	}
	if err != nil {
		a.error(w, r, err)
		return
	}
	a.json(w, 200, v)
}

func (a *App) saveLearnerDraft(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "parent") {
		return
	}
	var in learnerDraft
	if !a.decode(w, r, &in) {
		return
	}
	if !validLearner(in.LearnerInput, true) || in.Step != 2 || len(in.RequestID) < 8 || len(in.RequestID) > 100 || in.Version < 0 {
		a.error(w, r, domain.Fail(422, "validation", "Check learner draft fields."))
		return
	}
	in.ID = "learner:" + user(r).ID
	err := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		if err := a.checkLearnerConsent(ctx, user(r).ID, in.LearnerInput); err != nil {
			return err
		}
		prior, err := storage.One[learnerDraft](ctx, a.Store, "drafts", bson.M{"_id": in.ID})
		if err != nil && err != mongo.ErrNoDocuments {
			return err
		}
		// A response can be lost after a successful draft write.
		if err == nil && prior.Version == in.Version+1 {
			retried := in
			retried.Version++
			if prior == retried {
				return nil
			}
		}
		if err == nil && (prior.Version != in.Version || prior.RequestID != in.RequestID) || err == mongo.ErrNoDocuments && in.Version != 0 {
			return domain.Fail(409, "learner_draft_stale", "This draft changed in another tab. Reload to continue.")
		}
		saved := in
		saved.Version++
		if err == mongo.ErrNoDocuments {
			_, err = a.Store.C("drafts").InsertOne(ctx, saved)
		} else {
			_, err = a.Store.C("drafts").ReplaceOne(ctx, bson.M{"_id": in.ID}, saved)
		}
		return err
	})
	if err != nil {
		a.error(w, r, err)
		return
	}
	in.Version++
	a.json(w, 200, in)
}

func (a *App) deleteLearnerDraft(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "parent") {
		return
	}
	var in struct {
		RequestID string `json:"requestId"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	if len(in.RequestID) < 8 || len(in.RequestID) > 100 {
		a.error(w, r, domain.Fail(422, "validation", "A draft key is required."))
		return
	}
	if _, err := a.Store.C("drafts").DeleteOne(r.Context(), bson.M{"_id": "learner:" + user(r).ID, "requestId": in.RequestID}); err != nil {
		a.error(w, r, err)
		return
	}
	a.json(w, 200, map[string]bool{"ok": true})
}
