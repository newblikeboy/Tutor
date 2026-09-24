package app

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"net/http"
	"sort"
	"time"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
)

type interval struct {
	ID        string     `bson:"id"`
	Start     time.Time  `bson:"start"`
	End       time.Time  `bson:"end"`
	ExpiresAt *time.Time `bson:"expiresAt,omitempty"`
}
type guard struct {
	ID        string     `bson:"_id"`
	Version   int        `bson:"version"`
	Intervals []interval `bson:"intervals"`
}

// Every schedule mutation contends on both resource/day documents, including UTC boundaries.
func guardKeys(t domain.Trial) []string {
	keys := []string{}
	for day := t.Start.UTC().Truncate(24 * time.Hour); day.Before(t.End); day = day.Add(24 * time.Hour) {
		for _, p := range []string{"t:" + t.TutorID, "l:" + t.LearnerID} {
			keys = append(keys, p+":"+day.Format("2006-01-02"))
		}
	}
	sort.Strings(keys)
	return keys
}
func (a *App) ensureGuards(ctx context.Context, t domain.Trial) error {
	for _, key := range guardKeys(t) {
		_, e := a.Store.C("guards").UpdateOne(ctx, bson.M{"_id": key}, bson.M{"$setOnInsert": bson.M{"version": 0, "intervals": []interval{}}}, options.UpdateOne().SetUpsert(true))
		if e != nil && !mongo.IsDuplicateKeyError(e) {
			return e
		}
	}
	return nil
}
func (a *App) reserve(ctx context.Context, t domain.Trial, release bool) error {
	av := defaultAvailability(t.TutorID)
	av.DailyCapacity = 48
	if !release {
		err := a.Store.C("availability").FindOneAndUpdate(ctx, bson.M{"_id": t.TutorID}, bson.M{"$inc": bson.M{"bookingRevision": 1}}, options.FindOneAndUpdate().SetReturnDocument(options.After)).Decode(&av)
		if err != nil && err != mongo.ErrNoDocuments {
			return err
		}
		if err == nil && !available(av, t.Start, t.End) {
			return domain.Fail(409, "availability", "This trial falls outside the tutor's teaching availability.")
		}
	}
	return a.reserveClass(ctx, domain.Enrollment{LearnerID: t.LearnerID}, domain.ClassSession{ID: t.ID, TutorID: t.TutorID, Start: t.Start, End: t.End, Timezone: t.ScheduleTimezone, BufferMinutes: t.BufferMinutes}, av, nil, release)
}
func (a *App) requestTrial(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "parent") {
		return
	}
	var in struct {
		RequirementID string    `json:"requirementId"`
		TutorID       string    `json:"tutorId"`
		Start         time.Time `json:"start"`
		TermsAccepted bool      `json:"termsAccepted"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	key := r.Header.Get("Idempotency-Key")
	if len(key) < 8 || len(key) > 100 || !in.TermsAccepted {
		a.error(w, r, domain.Fail(422, "validation", "Accept the trial terms and select a time between five minutes and one month from now."))
		return
	}
	u := user(r)
	payload, _ := json.Marshal(in)
	fingerprint := digest(string(payload))
	id := token()
	v := domain.Trial{}
	e := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		var prev struct {
			ResultID    string `bson:"resultId"`
			Fingerprint string `bson:"fingerprint"`
		}
		er := a.Store.C("requests").FindOne(ctx, bson.M{"_id": u.ID + ":" + key}).Decode(&prev)
		if er == nil {
			if prev.Fingerprint != fingerprint {
				return domain.Fail(409, "idempotency_conflict", "This request key was used with different details.")
			}
			v, er = storage.One[domain.Trial](ctx, a.Store, "trials", bson.M{"_id": prev.ResultID})
			return er
		}
		if er != mongo.ErrNoDocuments {
			return er
		}
		if in.Start.Before(a.Now().Add(5*time.Minute)) || in.Start.After(a.Now().AddDate(0, 1, 0)) {
			return domain.Fail(422, "validation", "Select a trial time between five minutes and one month from now.")
		}
		req, er := storage.One[domain.Requirement](ctx, a.Store, "requirements", bson.M{"_id": in.RequirementID, "ownerId": u.ID})
		if er != nil {
			return er
		}
		l, er := storage.One[domain.Learner](ctx, a.Store, "learners", bson.M{"_id": req.LearnerID, "ownerId": u.ID})
		if er != nil {
			return er
		}
		var t domain.Application
		er = a.Store.C("applications").FindOneAndUpdate(ctx, bson.M{"_id": in.TutorID}, bson.M{"$inc": bson.M{"version": 1}}, options.FindOneAndUpdate().SetReturnDocument(options.After)).Decode(&t)
		if er != nil {
			return er
		}
		if !domain.Eligible(t, l.Class, a.Now()) {
			return domain.Fail(409, "scope_unavailable", "This tutor is not currently approved for this learning scope.")
		}
		v = domain.Trial{ID: id, OwnerID: u.ID, LearnerID: l.ID, RequirementID: req.ID, TutorID: t.ID, MentorID: t.AcademicMentor(), LearnerName: l.Name, Subject: req.Subject, Class: l.Class, Start: in.Start.UTC(), End: in.Start.UTC().Add(time.Hour), Status: "requested", FeePaise: 0, TermsVersion: "development-trial-v1", Terms: "Development only. One online Mathematics trial, 60 minutes, INR 0. No payment or tuition enrollment. Either party can cancel before completion. Mentor review included. No service availability guarantee.", CreatedAt: a.Now()}
		var av domain.Availability
		er = a.Store.C("availability").FindOneAndUpdate(ctx, bson.M{"_id": t.ID}, bson.M{"$inc": bson.M{"bookingRevision": 1}}, options.FindOneAndUpdate().SetReturnDocument(options.After)).Decode(&av)
		if er != nil && er != mongo.ErrNoDocuments {
			return er
		}
		if er == nil && !available(av, v.Start, v.End) {
			return domain.Fail(409, "availability", "The tutor is not available at this time.")
		}
		if _, er = a.Store.C("trials").InsertOne(ctx, v); er != nil {
			return er
		}
		if _, er = a.Store.C("requests").InsertOne(ctx, bson.M{"_id": u.ID + ":" + key, "ownerId": u.ID, "fingerprint": fingerprint, "resultId": id}); er != nil {
			return er
		}
		return a.audit(ctx, u.ID, "trial.requested", id)
	})
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 201, v)
}
func (a *App) trialAction(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Action    string `json:"action"`
		Notes     string `json:"notes"`
		NextSteps string `json:"nextSteps"`
		Review    string `json:"review"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	u := user(r)
	id := chi.URLParam(r, "id")
	initial, e := storage.One[domain.Trial](r.Context(), a.Store, "trials", bson.M{"_id": id})
	if e != nil {
		a.error(w, r, e)
		return
	}
	if initial.OwnerID != u.ID && initial.TutorID != u.ID && initial.MentorID != u.ID {
		a.error(w, r, domain.Fail(404, "not_found", "This record is unavailable."))
		return
	}
	if e = a.ensureGuards(r.Context(), initial); e != nil {
		a.error(w, r, e)
		return
	}
	e = a.Store.Tx(r.Context(), func(ctx context.Context) error {
		v, e := storage.One[domain.Trial](ctx, a.Store, "trials", bson.M{"_id": id})
		if e != nil {
			return e
		}
		switch in.Action {
		case "accept":
			if u.Role != "tutor" || v.TutorID != u.ID {
				return domain.Fail(403, "forbidden", "Only the assigned tutor can accept.")
			}
			if v.Status == "confirmed" {
				return nil
			}
			if v.Status != "requested" || !v.Start.After(a.Now()) {
				return domain.Fail(409, "invalid_transition", "Only a future requested trial can be accepted.")
			}
			var t domain.Application
			e = a.Store.C("applications").FindOneAndUpdate(ctx, bson.M{"_id": u.ID}, bson.M{"$inc": bson.M{"version": 1}}, options.FindOneAndUpdate().SetReturnDocument(options.After)).Decode(&t)
			if e != nil {
				return e
			}
			if !domain.Eligible(t, v.Class, a.Now()) {
				return domain.Fail(409, "scope_unavailable", "Your approval does not cover this trial.")
			}
			av, availabilityErr := storage.One[domain.Availability](ctx, a.Store, "availability", bson.M{"_id": v.TutorID})
			if availabilityErr != nil && availabilityErr != mongo.ErrNoDocuments {
				return availabilityErr
			}
			v.ScheduleTimezone = "Asia/Kolkata"
			if availabilityErr == nil {
				v.ScheduleTimezone = av.Timezone
				v.BufferMinutes = av.BufferMinutes
			}
			if v.End.After(t.Scope.ExpiresAt) {
				return domain.Fail(409, "scope_unavailable", "Approval expires before this trial ends.")
			}
			if e = a.reserve(ctx, v, false); e != nil {
				return e
			}
			v.Status = "confirmed"
		case "cancel", "decline":
			if in.Action == "decline" && (u.Role != "tutor" || u.ID != v.TutorID) {
				return domain.Fail(403, "forbidden", "Only the assigned tutor can decline.")
			}
			if u.ID != v.OwnerID && u.ID != v.TutorID {
				return domain.Fail(403, "forbidden", "Only the family or assigned tutor can cancel.")
			}
			if v.Status == "cancelled" || v.Status == "declined" {
				return nil
			}
			if in.Action == "decline" && v.Status != "requested" {
				return domain.Fail(409, "invalid_transition", "Only requested trials can be declined. Cancel a confirmed trial instead.")
			}
			if v.Status != "requested" && v.Status != "confirmed" {
				return domain.Fail(409, "invalid_transition", "Completed trials cannot be cancelled.")
			}
			if v.Status == "confirmed" {
				if e = a.reserve(ctx, v, true); e != nil {
					return e
				}
			}
			v.Status = map[string]string{"cancel": "cancelled", "decline": "declined"}[in.Action]
		case "complete":
			if u.Role != "tutor" || v.TutorID != u.ID {
				return domain.Fail(403, "forbidden", "Only the assigned tutor can submit lesson evidence.")
			}
			if v.Status != "confirmed" {
				return domain.Fail(409, "invalid_transition", "Confirm the trial before adding a lesson record.")
			}
			if a.Config.Env == "production" && a.Now().Before(v.End) {
				return domain.Fail(409, "not_finished", "The class has not ended yet.")
			}
			if !validText(in.Notes, 10, 2000) || !validText(in.NextSteps, 10, 1200) {
				return domain.Fail(422, "validation", "Add lesson evidence and concrete next steps.")
			}
			t, er := storage.One[domain.Application](ctx, a.Store, "applications", bson.M{"_id": u.ID})
			if er != nil {
				return er
			}
			if t.Status != "approved" {
				return domain.Fail(403, "scope_unavailable", "Teaching access is paused pending academic review.")
			}
			v.Notes = in.Notes
			v.NextSteps = in.NextSteps
			v.Status = "completed"
		case "review":
			if u.Role != "mentor" || v.MentorID != u.ID {
				return domain.Fail(403, "forbidden", "Only the assigned mentor can review this lesson.")
			}
			if v.Status != "completed" {
				return domain.Fail(409, "invalid_transition", "The tutor must submit lesson evidence first.")
			}
			if !validText(in.Review, 10, 2000) {
				return domain.Fail(422, "validation", "Explain the learning evidence and review outcome.")
			}
			v.Review = in.Review
			now := a.Now()
			v.ReviewAt = &now
			v.Status = "reviewed"
		default:
			return domain.Fail(422, "validation", fmt.Sprintf("Unsupported trial action."))
		}
		if _, e = a.Store.C("trials").ReplaceOne(ctx, bson.M{"_id": id}, v); e != nil {
			return e
		}
		return a.audit(ctx, u.ID, "trial."+v.Status, id)
	})
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 200, map[string]bool{"ok": true})
}
