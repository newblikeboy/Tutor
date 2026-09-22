package app

import (
	"context"
	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"net/http"
	"strings"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
)

func (a *App) audit(ctx context.Context, actor, action, target string) error {
	_, e := a.Store.C("audit").InsertOne(ctx, domain.Event{ID: token(), Actor: actor, Action: action, Target: target, At: a.Now()})
	return e
}
func validText(s string, min, max int) bool {
	return len(strings.TrimSpace(s)) >= min && len([]rune(s)) <= max
}
func (a *App) application(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "tutor") {
		return
	}
	var in struct {
		Name       string `json:"name"`
		Education  string `json:"education"`
		Approach   string `json:"approach"`
		Language   string `json:"language"`
		Experience int    `json:"experience"`
		Submit     bool   `json:"submit"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	if !validText(in.Name, 2, 80) || !validText(in.Education, 3, 500) || !validText(in.Approach, 10, 1200) || (in.Language != "Hindi" && in.Language != "English") || in.Experience < 0 || in.Experience > 60 {
		a.error(w, r, domain.Fail(422, "validation", "Complete your name, education and teaching approach."))
		return
	}
	u := user(r)
	status := "draft"
	if in.Submit {
		status = "submitted"
	}
	v := domain.Application{ID: u.ID, Name: in.Name, Education: in.Education, Approach: in.Approach, Language: in.Language, Experience: in.Experience, Status: status, Scope: domain.Scope{Subject: "Mathematics", MinClass: 6, MaxClass: 10, Mode: "online"}, Sample: true, UpdatedAt: a.Now()}
	e := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		old, er := storage.One[domain.Application](ctx, a.Store, "applications", bson.M{"_id": u.ID})
		if er != nil && er != mongo.ErrNoDocuments {
			return er
		}
		if er == nil && old.Status != "draft" && old.Status != "improvement_required" {
			return domain.Fail(409, "invalid_transition", "This application is already in review.")
		}
		_, er = a.Store.C("applications").ReplaceOne(ctx, bson.M{"_id": u.ID}, v, options.Replace().SetUpsert(true))
		if er != nil {
			return er
		}
		return a.audit(ctx, u.ID, "application."+status, u.ID)
	})
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 200, v)
}
func (a *App) decision(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "mentor", "admin") {
		return
	}
	var in struct {
		Action   string `json:"action"`
		Reason   string `json:"reason"`
		Evidence string `json:"evidence"`
		Scores   []int  `json:"scores"`
		MinClass int    `json:"minClass"`
		MaxClass int    `json:"maxClass"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	u := user(r)
	id := chi.URLParam(r, "id")
	e := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		v, e := storage.One[domain.Application](ctx, a.Store, "applications", bson.M{"_id": id})
		if e != nil {
			return e
		}
		if id == u.ID {
			return domain.Fail(403, "self_assessment", "You cannot assess your own application.")
		}
		if in.Action == "suspend" {
			if u.Role != "admin" || v.Status != "approved" || !validText(in.Reason, 10, 1000) {
				return domain.Fail(403, "forbidden", "An administrator must record a reason to suspend an approved tutor.")
			}
			v.Status = "suspended"
			v.Reason = in.Reason
			if _, e = a.Store.C("outbox").InsertOne(ctx, bson.M{"_id": token(), "status": "pending_operator", "attempts": 0, "availableAt": a.Now(), "kind": "review_existing_arrangements", "tutorId": id}); e != nil {
				return e
			}
		} else {
			if u.Role != "mentor" {
				return domain.Fail(403, "forbidden", "Academic decisions require an assigned mentor.")
			}
			switch in.Action {
			case "review":
				if v.Status != "submitted" {
					return domain.Fail(409, "invalid_transition", "Application must be submitted first.")
				}
				v.Status = "under_review"
				v.AssessorID = u.ID
			case "schedule":
				if v.Status != "under_review" || v.AssessorID != u.ID {
					return domain.Fail(409, "invalid_transition", "Only the assigned assessor can schedule.")
				}
				v.Status = "assessment_scheduled"
				v.AssessmentAt = a.Now()
			case "assess":
				if v.Status != "assessment_scheduled" || v.AssessorID != u.ID {
					return domain.Fail(409, "invalid_transition", "A scheduled assessment is required.")
				}
				if len(in.Scores) != 6 || !validText(in.Evidence, 10, 1200) {
					return domain.Fail(422, "validation", "Record six assessment scores and evidence.")
				}
				for _, s := range in.Scores {
					if s < 1 || s > 5 {
						return domain.Fail(422, "validation", "Scores must be from 1 to 5.")
					}
				}
				v.Scores = in.Scores
				v.Evidence = in.Evidence
				v.Status = "assessed"
			case "approve", "improve", "decline":
				if v.Status != "assessed" || v.AssessorID != u.ID {
					return domain.Fail(409, "invalid_transition", "Only the assigned assessor can decide an assessed application.")
				}
				if !validText(in.Reason, 10, 1000) {
					return domain.Fail(422, "validation", "Record the reason for this decision.")
				}
				v.Reason = in.Reason
				v.Status = map[string]string{"approve": "approved", "improve": "improvement_required", "decline": "declined"}[in.Action]
				if in.Action == "approve" {
					if in.MinClass < 6 || in.MaxClass > 10 || in.MinClass > in.MaxClass {
						return domain.Fail(422, "validation", "Approved classes must be within 6–10.")
					}
					v.Scope.MinClass = in.MinClass
					v.Scope.MaxClass = in.MaxClass
					v.Scope.ExpiresAt = a.Now().AddDate(0, 6, 0)
				}
			default:
				return domain.Fail(422, "validation", "Unknown assessment action.")
			}
		}
		v.UpdatedAt = a.Now()
		v.Version++
		if _, e = a.Store.C("applications").ReplaceOne(ctx, bson.M{"_id": id}, v); e != nil {
			return e
		}
		return a.audit(ctx, u.ID, "application."+v.Status, id)
	})
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 200, map[string]bool{"ok": true})
}
func (a *App) consent(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "parent") {
		return
	}
	if a.Config.Env == "production" {
		a.error(w, r, domain.Fail(503, "guardian_unconfigured", "Guardian verification procedure requires operator approval."))
		return
	}
	var in struct {
		Relationship string `json:"relationship"`
		Accepted     bool   `json:"accepted"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	if !in.Accepted || (in.Relationship != "parent" && in.Relationship != "legal_guardian") {
		a.error(w, r, domain.Fail(422, "guardian_required", "Confirm your guardian relationship and privacy consent first."))
		return
	}
	c := domain.Consent{ID: token(), OwnerID: user(r).ID, Relationship: in.Relationship, Version: "guardian-draft-v1", At: a.Now(), Verification: "development_declaration_only"}
	e := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		_, er := a.Store.C("consents").InsertOne(ctx, c)
		if er != nil {
			return er
		}
		return a.audit(ctx, user(r).ID, "consent.recorded", c.ID)
	})
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 201, c)
}
func (a *App) learner(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "parent") {
		return
	}
	var in struct {
		Name      string `json:"name"`
		Class     int    `json:"class"`
		Board     string `json:"board"`
		Language  string `json:"language"`
		Kind      string `json:"kind"`
		ConsentID string `json:"consentId"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	if !validText(in.Name, 1, 80) || in.Class < 6 || in.Class > 10 || (in.Board != "CBSE" && in.Board != "BSEB" && in.Board != "ICSE") || (in.Language != "Hindi" && in.Language != "English") || (in.Kind != "minor" && in.Kind != "adult_self") {
		a.error(w, r, domain.Fail(422, "validation", "Check learner name, class, board and language."))
		return
	}
	if in.Kind == "minor" {
		if a.Config.Env == "production" {
			a.error(w, r, domain.Fail(503, "guardian_unconfigured", "Guardian verification is not enabled."))
			return
		}
		if _, e := storage.One[domain.Consent](r.Context(), a.Store, "consents", bson.M{"_id": in.ConsentID, "ownerId": user(r).ID, "version": "guardian-draft-v1"}); e != nil {
			a.error(w, r, domain.Fail(403, "guardian_required", "Guardian consent is required before collecting learner details."))
			return
		}
	}
	v := domain.Learner{ID: token(), OwnerID: user(r).ID, Name: in.Name, Class: in.Class, Board: in.Board, Language: in.Language, Kind: in.Kind, ConsentID: in.ConsentID}
	if _, e := a.Store.C("learners").InsertOne(r.Context(), v); e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 201, v)
}
func (a *App) getLearner(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "parent") {
		return
	}
	v, e := storage.One[domain.Learner](r.Context(), a.Store, "learners", bson.M{"_id": chi.URLParam(r, "id"), "ownerId": user(r).ID})
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 200, v)
}
func (a *App) draft(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "parent") {
		return
	}
	var in domain.Draft
	if !a.decode(w, r, &in) {
		return
	}
	if in.Step < 1 || in.Step > 3 || len([]rune(in.Goal)) > 1200 || len(in.Locality) > 120 {
		a.error(w, r, domain.Fail(422, "validation", "Check draft fields."))
		return
	}
	if in.LearnerID != "" {
		if _, e := storage.One[domain.Learner](r.Context(), a.Store, "learners", bson.M{"_id": in.LearnerID, "ownerId": user(r).ID}); e != nil {
			a.error(w, r, e)
			return
		}
	}
	in.ID = user(r).ID
	if _, e := a.Store.C("drafts").ReplaceOne(r.Context(), bson.M{"_id": in.ID}, in, options.Replace().SetUpsert(true)); e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 200, in)
}
func (a *App) requirement(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "parent") {
		return
	}
	var in struct {
		LearnerID string `json:"learnerId"`
		Goal      string `json:"goal"`
		Locality  string `json:"locality"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	if !validText(in.Goal, 10, 1200) || !validText(in.Locality, 2, 120) {
		a.error(w, r, domain.Fail(422, "validation", "Add a learning goal and locality."))
		return
	}
	v := domain.Requirement{ID: token(), OwnerID: user(r).ID, LearnerID: in.LearnerID, Subject: "Mathematics", Goal: in.Goal, Locality: in.Locality, Status: "submitted", CreatedAt: a.Now()}
	e := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		if _, er := storage.One[domain.Learner](ctx, a.Store, "learners", bson.M{"_id": in.LearnerID, "ownerId": user(r).ID}); er != nil {
			return er
		}
		if _, er := a.Store.C("requirements").InsertOne(ctx, v); er != nil {
			return er
		}
		if _, er := a.Store.C("drafts").DeleteOne(ctx, bson.M{"_id": user(r).ID}); er != nil {
			return er
		}
		return a.audit(ctx, user(r).ID, "requirement.submitted", v.ID)
	})
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 201, v)
}
func (a *App) dashboard(w http.ResponseWriter, r *http.Request) {
	u := user(r)
	ctx := r.Context()
	d := domain.Dashboard{User: u, Learners: []domain.Learner{}, Requirements: []domain.Requirement{}, Trials: []domain.Trial{}, Applications: []domain.Application{}, Events: []domain.Event{}}
	var e error
	switch u.Role {
	case "parent":
		d.Learners, e = storage.Many[domain.Learner](ctx, a.Store, "learners", bson.M{"ownerId": u.ID})
		if e == nil {
			d.Requirements, e = storage.Many[domain.Requirement](ctx, a.Store, "requirements", bson.M{"ownerId": u.ID})
		}
		if e == nil {
			d.Trials, e = storage.Many[domain.Trial](ctx, a.Store, "trials", bson.M{"ownerId": u.ID})
		}
		dr, er := storage.One[domain.Draft](ctx, a.Store, "drafts", bson.M{"_id": u.ID})
		if er == nil {
			d.Draft = &dr
		} else if er != mongo.ErrNoDocuments {
			e = er
		}
		for i := range d.Trials {
			if d.Trials[i].Status != "reviewed" {
				d.Trials[i].Notes = ""
				d.Trials[i].NextSteps = ""
			}
		}
	case "tutor":
		d.Applications, e = storage.Many[domain.Application](ctx, a.Store, "applications", bson.M{"_id": u.ID})
		if e == nil {
			d.Trials, e = storage.Many[domain.Trial](ctx, a.Store, "trials", bson.M{"tutorId": u.ID, "status": bson.M{"$in": []string{"requested", "confirmed", "completed", "reviewed"}}})
		}
		for i := range d.Trials {
			if d.Trials[i].Status == "reviewed" {
				d.Trials[i].LearnerName = ""
				d.Trials[i].Notes = ""
				d.Trials[i].Review = ""
				d.Trials[i].NextSteps = ""
			}
		}
	case "mentor":
		d.Applications, e = storage.Many[domain.Application](ctx, a.Store, "applications", bson.M{"$or": []bson.M{{"status": "submitted"}, {"assessorId": u.ID}}})
		if e == nil {
			d.Trials, e = storage.Many[domain.Trial](ctx, a.Store, "trials", bson.M{"mentorId": u.ID})
		}
	case "admin":
		d.Applications, e = storage.Many[domain.Application](ctx, a.Store, "applications", bson.M{})
		if e == nil {
			d.Events, e = storage.Many[domain.Event](ctx, a.Store, "audit", bson.M{})
		}
	default:
		a.error(w, r, domain.Fail(403, "forbidden", "This role has no access to academic records."))
		return
	}
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 200, d)
}
