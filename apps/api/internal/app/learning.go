package app

import (
	"context"
	"fmt"
	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"net/http"
	"time"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
)

func (a *App) savePlan(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "mentor") {
		return
	}
	var in struct {
		ExpectedVersion int                    `json:"expectedVersion"`
		StartingPoint   string                 `json:"startingPoint"`
		Goals           string                 `json:"goals"`
		Topics          []domain.LearningTopic `json:"topics"`
		NextSteps       string                 `json:"nextSteps"`
		ReviewDate      time.Time              `json:"reviewDate"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	if !validText(in.StartingPoint, 10, 1500) || !validText(in.Goals, 10, 1500) || !validText(in.NextSteps, 10, 1200) || len(in.Topics) < 1 || len(in.Topics) > 20 || in.ReviewDate.Before(a.Now()) || in.ReviewDate.After(a.Now().AddDate(1, 0, 0)) {
		a.error(w, r, domain.Fail(422, "validation", "Add a starting point, goals, 1–20 evidence-based topics, next steps and future review date."))
		return
	}
	for _, t := range in.Topics {
		if !validText(t.Title, 2, 160) || !validText(t.Evidence, 5, 1200) || !validText(t.Practice, 5, 1200) || !enum(t.Status, "introduced", "practising", "independent", "needs_review") {
			a.error(w, r, domain.Fail(422, "validation", "Every topic needs a valid status, evidence and practice."))
			return
		}
	}
	u := user(r)
	var p domain.LearningPlan
	e := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		v, er := a.tuitionAccess(ctx, u, chi.URLParam(r, "id"))
		if er != nil {
			return er
		}
		if v.PlanVersion != in.ExpectedVersion {
			return domain.Fail(409, "stale_version", "A newer learning plan exists. Reload before saving.")
		}
		if !enum(v.Status, "active", "paused") {
			return domain.Fail(409, "invalid_transition", "An active teaching arrangement is required.")
		}
		p = domain.LearningPlan{ID: fmt.Sprintf("%s:%04d", v.ID, v.PlanVersion+1), EnrollmentID: v.ID, Version: v.PlanVersion + 1, StartingPoint: clean(in.StartingPoint), Goals: clean(in.Goals), Topics: in.Topics, NextSteps: clean(in.NextSteps), ReviewDate: in.ReviewDate, AuthorID: u.ID, CreatedAt: a.Now()}
		if _, er = a.Store.C("learning_plans").InsertOne(ctx, p); er != nil {
			return er
		}
		if _, er = a.Store.C("enrollments").UpdateOne(ctx, bson.M{"_id": v.ID}, bson.M{"$inc": bson.M{"version": 1, "planVersion": 1}}); er != nil {
			return er
		}
		return a.audit(ctx, u.ID, "learning_plan.versioned", p.ID)
	})
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 201, p)
}
func (a *App) requestHandover(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "parent") {
		return
	}
	var in struct {
		TutorID string `json:"tutorId"`
		Reason  string `json:"reason"`
		Consent bool   `json:"consent"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	if in.TutorID != "" {
		a.error(w, r, domain.Fail(422, "validation", "An administrator selects the replacement tutor after reviewing your request."))
		return
	}
	if err := a.rate(r.Context(), "tutor-change:"+user(r).ID, 8); err != nil {
		a.error(w, r, err)
		return
	}
	if !in.Consent || !validText(in.Reason, 10, 1000) {
		a.error(w, r, domain.Fail(422, "validation", "Explain the tutor change and consent to sharing the learning record."))
		return
	}
	u := user(r)
	var h domain.Handover
	e := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		v, er := a.tuitionAccess(ctx, u, chi.URLParam(r, "id"))
		if er != nil {
			return er
		}
		prior, fp, er := a.receipt(ctx, "tutor-change:"+u.ID, r.Header.Get("Idempotency-Key"), map[string]any{"enrollment": v.ID, "reason": in.Reason, "consent": in.Consent})
		if er != nil {
			return er
		}
		if prior != "" {
			h, er = storage.One[domain.Handover](ctx, a.Store, "handovers", bson.M{"_id": prior, "enrollmentId": v.ID})
			return er
		}
		if !enum(v.Status, "active", "paused") {
			return domain.Fail(409, "invalid_transition", "Tutor changes can be requested for current bookings.")
		}
		count, er := a.Store.C("handovers").CountDocuments(ctx, bson.M{"enrollmentId": v.ID, "status": bson.M{"$in": []string{"requested", "awaiting_tutor"}}})
		if er != nil {
			return er
		}
		if count > 0 {
			return domain.Fail(409, "conflict", "A tutor-change request is already open.")
		}
		h = domain.Handover{ID: token(), EnrollmentID: v.ID, OldTutorID: v.TutorID, NewTutorID: "", Reason: clean(in.Reason), Status: "requested", FamilyConsentAt: a.Now(), CreatedAt: a.Now()}
		if _, er = a.Store.C("enrollments").UpdateOne(ctx, bson.M{"_id": v.ID}, bson.M{"$inc": bson.M{"version": 1}}); er != nil {
			return er
		}
		if _, er = a.Store.C("handovers").InsertOne(ctx, h); er != nil {
			return er
		}
		if er = a.saveReceipt(ctx, "tutor-change:"+u.ID, r.Header.Get("Idempotency-Key"), fp, h.ID); er != nil {
			return er
		}
		admins, er := storage.Many[domain.User](ctx, a.Store, "users", bson.M{"role": "admin", "status": "active"})
		if er != nil {
			return er
		}
		for _, admin := range admins {
			if er = a.notifyActivity(ctx, admin.ID, "tutor_change_requested", h.ID); er != nil {
				return er
			}
		}
		return a.audit(ctx, u.ID, "handover.requested", h.ID)
	})
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 201, h)
}
func (a *App) handoverInvitations(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "tutor") {
		return
	}
	// Minimum necessary context only; full family records remain inaccessible until acceptance.
	items, e := storage.Many[domain.Handover](r.Context(), a.Store, "handovers", bson.M{"newTutorId": user(r).ID, "status": "awaiting_tutor"})
	if e != nil {
		a.error(w, r, e)
		return
	}
	type invitation struct {
		Handover  domain.Handover  `json:"handover"`
		Agreement domain.Agreement `json:"agreement"`
		Class     int              `json:"class"`
	}
	out := []invitation{}
	for _, h := range items {
		v, er := storage.One[domain.Enrollment](r.Context(), a.Store, "enrollments", bson.M{"_id": h.EnrollmentID})
		if er != nil {
			a.error(w, r, er)
			return
		}
		out = append(out, invitation{h, v.Agreement, v.Class})
	}
	a.json(w, 200, out)
}
func (a *App) handoverAction(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Action    string `json:"action"`
		NextSteps string `json:"nextSteps"`
		TutorID   string `json:"tutorId"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	u := user(r)
	e := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		h, er := storage.One[domain.Handover](ctx, a.Store, "handovers", bson.M{"_id": chi.URLParam(r, "id")})
		if er != nil {
			return er
		}
		v, er := storage.One[domain.Enrollment](ctx, a.Store, "enrollments", bson.M{"_id": h.EnrollmentID})
		if er != nil {
			return er
		}
		if u.Role != "admin" && !(u.Role == "mentor" && u.ID == v.MentorID) && !(u.Role == "parent" && u.ID == v.OwnerID) && !(u.Role == "tutor" && u.ID == h.NewTutorID) {
			return domain.Fail(404, "not_found", "This record is unavailable.")
		}
		if in.Action != "reject" && (!enum(v.Status, "active", "paused") || v.TutorID != h.OldTutorID) {
			return domain.Fail(409, "invalid_transition", "The teaching arrangement changed.")
		}
		switch in.Action {
		case "prepare":
			if h.FamilyConsentAt.IsZero() {
				return domain.Fail(409, "guardian_required", "Family consent is required before preparing a replacement.")
			}
			legacyMentor := u.Role == "mentor" && u.ID == v.MentorID && h.NewTutorID != "" && in.TutorID == ""
			if !(u.Role == "admin" || legacyMentor) || h.Status != "requested" || !validText(in.NextSteps, 10, 2000) {
				return domain.Fail(403, "forbidden", "An administrator must select an approved replacement and record the handover steps.")
			}
			if u.Role == "admin" {
				if h.NewTutorID != "" && in.TutorID != h.NewTutorID {
					return domain.Fail(409, "consent_required", "The saved family consent names a different replacement tutor.")
				}
				if in.TutorID == "" || in.TutorID == v.TutorID {
					return domain.Fail(422, "validation", "Choose a different approved tutor.")
				}
				app, _, err := a.lockOffering(ctx, in.TutorID, v.Class, v.Agreement.Mode)
				if err != nil {
					return err
				}
				if !app.Scope.CoversSubjects(agreementSubjects(v.Agreement)) {
					return domain.Fail(409, "scope_unavailable", "The replacement must cover every booked subject.")
				}
				h.NewTutorID = in.TutorID
			}
			h.NextSteps = clean(in.NextSteps)
			h.Status = "awaiting_tutor"
			if er = a.notifyTutorChange(ctx, h.NewTutorID, "tutor_change_invitation", v.ID, h); er != nil {
				return er
			}
		case "reject":
			if u.Role != "admin" || h.Status != "requested" || !validText(in.NextSteps, 10, 2000) {
				return domain.Fail(403, "forbidden", "An administrator must explain a declined tutor-change request.")
			}
			h.NextSteps = clean(in.NextSteps)
			h.Status = "rejected"
		case "cancel":
			if u.ID != v.OwnerID || !enum(h.Status, "requested", "awaiting_tutor") {
				return domain.Fail(403, "forbidden", "Only the family can withdraw an open request.")
			}
			h.Status = "cancelled"
		case "decline":
			if u.ID != h.NewTutorID || h.Status != "awaiting_tutor" {
				return domain.Fail(403, "forbidden", "Only the invited tutor can decline.")
			}
			h.Status = "declined"
		case "accept":
			if u.Role != "tutor" || u.ID != h.NewTutorID || h.Status != "awaiting_tutor" {
				return domain.Fail(403, "forbidden", "Only the invited tutor can accept this prepared handover.")
			}
			app, av, er := a.lockOffering(ctx, h.NewTutorID, v.Class, v.Agreement.Mode)
			if er != nil {
				return er
			}
			subjects := v.Agreement.Subjects
			if len(subjects) == 0 {
				subjects = []string{v.Agreement.Subject}
			}
			if !app.Scope.CoversSubjects(subjects) || !app.Scope.HasMode(v.Agreement.Mode) {
				return domain.Fail(409, "scope_unavailable", "The new approval must cover the existing agreement.")
			}
			old, er := storage.One[domain.Availability](ctx, a.Store, "availability", bson.M{"_id": h.OldTutorID})
			if er != nil {
				return er
			}
			classes, er := storage.Many[domain.ClassSession](ctx, a.Store, "classes", bson.M{"enrollmentId": v.ID})
			if er != nil {
				return er
			}
			for _, s := range classes {
				if s.Status == "awaiting_review" || s.Status == "scheduled" && !s.Start.After(a.Now()) {
					return domain.Fail(409, "review_required", "Resolve outstanding class records before changing tutor.")
				}
				if !enum(s.Status, "scheduled", "makeup_due") {
					continue
				}
				if er = a.reserveClass(ctx, v, s, old, nil, true); er != nil {
					return er
				}
				if er = a.clearLessonMeeting(ctx, "classes", s.ID, &s.Meeting); er != nil {
					return er
				}
				s.TutorID = app.ID
				s.BufferMinutes = av.BufferMinutes
				s.Timezone = av.Timezone
				s.Proposal = nil
				s.Version++
				if s.Status == "scheduled" {
					if !available(av, s.Start, s.End) || s.End.After(app.Scope.ExpiresAt) {
						return domain.Fail(409, "availability", "The replacement tutor cannot cover all remaining classes.")
					}
					if er = a.reserveClass(ctx, v, s, av, nil, false); er != nil {
						return er
					}
				}
				if _, er = a.Store.C("classes").ReplaceOne(ctx, bson.M{"_id": s.ID}, s); er != nil {
					return er
				}
			}
			v.TutorID = app.ID
			v.TutorName = app.Name
			// Preserve historical agreements; accepted handover carries their agreed fee.
			v.Agreement.Version++
			v.Agreement.ID = fmt.Sprintf("%s:%d", v.ID, v.Agreement.Version)
			v.Agreement.TutorID = app.ID
			v.Agreement.CreatedAt = a.Now()
			if _, er = a.Store.C("agreements").InsertOne(ctx, v.Agreement); er != nil {
				return er
			}
			h.Status = "completed"
		default:
			return domain.Fail(422, "validation", "Unknown handover action.")
		}
		v.Version++
		if _, er = a.Store.C("enrollments").ReplaceOne(ctx, bson.M{"_id": v.ID}, v); er != nil {
			return er
		}
		if _, er = a.Store.C("handovers").ReplaceOne(ctx, bson.M{"_id": h.ID}, h); er != nil {
			return er
		}
		if er = a.notifyTutorChange(ctx, v.OwnerID, "tutor_change_update", v.ID, h); er != nil {
			return er
		}
		return a.audit(ctx, u.ID, "handover."+h.Status, h.ID)
	})
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 200, map[string]bool{"ok": true})
}

// Administrators see operational request context, without general access to
// learner progress, private conversations or academic approval controls.
func (a *App) adminTutorChanges(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "admin") {
		return
	}
	filter := bson.M{}
	status := r.URL.Query().Get("status")
	if !enum(status, "", "requested", "awaiting_tutor", "closed") {
		a.error(w, r, domain.Fail(422, "validation", "Choose a valid request status."))
		return
	}
	if status == "closed" {
		filter["status"] = bson.M{"$in": []string{"completed", "rejected", "cancelled", "declined"}}
	} else if status != "" {
		filter["status"] = status
	} else {
		filter["status"] = bson.M{"$in": []string{"requested", "awaiting_tutor"}}
	}
	if id := chi.URLParam(r, "id"); id != "" {
		filter = bson.M{"_id": id}
	}
	page, err := pageRecords[domain.Handover](r.Context(), a.Store, "handovers", filter, r.URL.Query().Get("cursor"))
	if err != nil {
		a.error(w, r, err)
		return
	}
	items := []domain.TutorChangeReview{}
	for _, h := range page.Items {
		v, err := storage.One[domain.Enrollment](r.Context(), a.Store, "enrollments", bson.M{"_id": h.EnrollmentID})
		if err != nil {
			a.error(w, r, err)
			return
		}
		items = append(items, domain.TutorChangeReview{Request: h, LearnerName: v.LearnerName, TutorName: v.TutorName, Class: v.Class, Subjects: agreementSubjects(v.Agreement), Mode: v.Agreement.Mode, BookingStatus: v.Status})
	}
	a.json(w, 200, map[string]any{"items": items, "nextCursor": page.NextCursor})
}

func (a *App) notifyTutorChange(ctx context.Context, recipient, kind, enrollment string, h domain.Handover) error {
	n := domain.Notification{ID: "handover:" + h.ID + ":" + h.Status + ":" + recipient, OwnerID: recipient, Kind: kind, TargetID: enrollment, CreatedAt: a.Now()}
	_, err := a.Store.C("notifications").InsertOne(ctx, n)
	return err
}
