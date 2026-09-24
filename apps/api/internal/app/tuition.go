package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
)

type recordPage[T any] struct {
	Items      []T    `json:"items"`
	NextCursor string `json:"nextCursor"`
}

func pageRecords[T any](ctx context.Context, s *storage.Store, collection string, filter bson.M, cursor string) (recordPage[T], error) {
	p := recordPage[T]{Items: []T{}}
	if len(cursor) > 200 {
		return p, domain.Fail(422, "validation", "Invalid page cursor.")
	}
	if cursor != "" {
		filter["_id"] = bson.M{"$gt": cursor}
	}
	c, e := s.C(collection).Find(ctx, filter, options.Find().SetSort(bson.D{{Key: "_id", Value: 1}}).SetLimit(26))
	if e != nil {
		return p, e
	}
	defer c.Close(ctx)
	var rows []bson.Raw
	if e = c.All(ctx, &rows); e != nil {
		return p, e
	}
	if len(rows) > 25 {
		rows = rows[:25]
		p.NextCursor = rows[24].Lookup("_id").StringValue()
	}
	for _, raw := range rows {
		var item T
		if e = bson.Unmarshal(raw, &item); e != nil {
			return p, e
		}
		p.Items = append(p.Items, item)
	}
	return p, nil
}
func tuitionFilter(u domain.User) bson.M {
	switch u.Role {
	case "parent":
		return bson.M{"ownerId": u.ID}
	case "tutor":
		return bson.M{"tutorId": u.ID, "status": bson.M{"$nin": []string{"cancelled", "completed", "expired"}}}
	case "mentor":
		return bson.M{"mentorId": u.ID}
	default:
		return bson.M{"_id": "not-authorised"}
	}
}
func (a *App) tuitionAccess(ctx context.Context, u domain.User, id string) (domain.Enrollment, error) {
	if u.Role == "tutor" {
		v, e := storage.One[domain.Application](ctx, a.Store, "applications", bson.M{"_id": u.ID})
		if e != nil {
			return domain.Enrollment{}, e
		}
		if enum(v.Status, "suspended", "terminated") {
			return domain.Enrollment{}, domain.Fail(403, "tutor_restricted", "Teaching access is restricted.")
		}
	}
	f := tuitionFilter(u)
	f["_id"] = id
	if !enum(u.Role, "parent", "tutor", "mentor") {
		return domain.Enrollment{}, domain.Fail(403, "forbidden", "This role cannot access learning records.")
	}
	return storage.One[domain.Enrollment](ctx, a.Store, "enrollments", f)
}
func (a *App) enrollments(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "parent", "tutor", "mentor") {
		return
	}
	p, e := pageRecords[domain.Enrollment](r.Context(), a.Store, "enrollments", tuitionFilter(user(r)), r.URL.Query().Get("cursor"))
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 200, p)
}
func (a *App) tuitionDetail(w http.ResponseWriter, r *http.Request) {
	v, e := a.tuitionAccess(r.Context(), user(r), chi.URLParam(r, "id"))
	if e != nil {
		a.error(w, r, e)
		return
	}
	d := domain.TuitionDetail{Enrollment: v, Sessions: []domain.ClassSession{}, Plans: []domain.LearningPlan{}, Agreements: []domain.Agreement{}, Handovers: []domain.Handover{}}
	f := bson.M{"enrollmentId": v.ID}
	d.Sessions, e = storage.Many[domain.ClassSession](r.Context(), a.Store, "classes", f)
	if e == nil {
		d.Plans, e = storage.Many[domain.LearningPlan](r.Context(), a.Store, "learning_plans", f)
	}
	if e == nil {
		d.Agreements, e = storage.Many[domain.Agreement](r.Context(), a.Store, "agreements", f)
	}
	if e == nil {
		d.Handovers, e = storage.Many[domain.Handover](r.Context(), a.Store, "handovers", f)
	}
	for _, s := range d.Sessions {
		if s.Status == "reviewed" {
			d.Delivered++
		}
		if !enum(s.Status, "reviewed", "missed", "cancelled_consumed", "cancelled") {
			d.Remaining++
		}
	}
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 200, d)
}

// Idempotency records are inserted in the same transaction as the business result.
func (a *App) receipt(ctx context.Context, actor, key string, body any) (string, string, error) {
	if len(key) < 8 || len(key) > 100 {
		return "", "", domain.Fail(422, "validation", "An idempotency key is required.")
	}
	b, _ := json.Marshal(body)
	fingerprint := digest(string(b))
	var v struct {
		ResultID    string `bson:"resultId"`
		Fingerprint string `bson:"fingerprint"`
	}
	e := a.Store.C("requests").FindOne(ctx, bson.M{"_id": actor + ":" + key}).Decode(&v)
	if errors.Is(e, mongo.ErrNoDocuments) {
		return "", fingerprint, nil
	}
	if e != nil {
		return "", "", e
	}
	if v.Fingerprint != fingerprint {
		return "", "", domain.Fail(409, "idempotency_conflict", "This retry key belongs to different details.")
	}
	return v.ResultID, fingerprint, nil
}
func (a *App) saveReceipt(ctx context.Context, actor, key, fingerprint, id string) error {
	_, e := a.Store.C("requests").InsertOne(ctx, bson.M{"_id": actor + ":" + key, "ownerId": actor, "fingerprint": fingerprint, "resultId": id})
	return e
}
func (a *App) createEnrollment(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "parent") {
		return
	}
	var in struct {
		TrialID         string          `json:"trialId"`
		Schedule        RecurrenceInput `json:"schedule"`
		OfferingVersion int             `json:"offeringVersion"`
		Accepted        bool            `json:"accepted"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	if !in.Accepted {
		a.error(w, r, domain.Fail(422, "validation", "Accept the displayed agreement first."))
		return
	}
	u := user(r)
	id := token()
	var result domain.Enrollment
	e := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		prior, fp, er := a.receipt(ctx, u.ID, r.Header.Get("Idempotency-Key"), in)
		if er != nil {
			return er
		}
		if prior != "" {
			result, er = a.tuitionAccess(ctx, u, prior)
			return er
		}
		starts, er := recurrence(in.Schedule, a.Now())
		if er != nil {
			return er
		}
		trial, er := storage.One[domain.Trial](ctx, a.Store, "trials", bson.M{"_id": in.TrialID, "ownerId": u.ID, "status": "reviewed"})
		if er != nil {
			return er
		}
		app, av, er := a.lockOffering(ctx, trial.TutorID, trial.Class)
		if er != nil {
			return er
		}
		if av.Version != in.OfferingVersion {
			return domain.Fail(409, "stale_version", "The tutor's offering changed. Review the latest fee and availability.")
		}
		for _, start := range starts {
			end := start.Add(time.Duration(in.Schedule.Minutes) * time.Minute)
			if !available(av, start, end) || end.After(app.Scope.ExpiresAt) {
				return domain.Fail(409, "availability", "A requested class falls outside current availability or approval.")
			}
		}
		if len(starts) > 0 && av.FeePaise > 10000000 {
			return domain.Fail(422, "validation", "Invalid offering price.")
		}
		ag := domain.Agreement{ID: id + ":1", EnrollmentID: id, Version: 1, TutorID: app.ID, Subject: app.Scope.Subject, Mode: app.Scope.Mode, Timezone: in.Schedule.Timezone, SessionCount: len(starts), Minutes: in.Schedule.Minutes, Starts: starts, FeePerSessionPaise: av.FeePaise, TotalPaise: int64(len(starts)) * av.FeePaise, Currency: "INR", CancellationHours: 12, TermsVersion: "development-tuition-v1", Terms: "Development agreement, pending operator/legal review. Fees are the tutor's recorded test offering, not published live prices. Academic support included. Family cancellations at least 12 hours before class retain a makeup session; later family cancellations consume it. Tutor cancellations retain a makeup session. Schedule changes require both parties. No automatic renewal, real payment or result guarantee.", CreatedAt: a.Now()}
		result = domain.Enrollment{ID: id, OwnerID: u.ID, TrialID: trial.ID, LearnerID: trial.LearnerID, LearnerName: trial.LearnerName, Class: trial.Class, TutorID: app.ID, TutorName: app.Name, MentorID: trial.MentorID, Status: "pending_agreement", Agreement: ag, Version: 1, CreatedAt: a.Now()}
		if _, er = a.Store.C("enrollments").InsertOne(ctx, result); er != nil {
			return er
		}
		if _, er = a.Store.C("agreements").InsertOne(ctx, ag); er != nil {
			return er
		}
		for i, start := range starts {
			s := domain.ClassSession{ID: fmt.Sprintf("%s:%02d", id, i+1), EnrollmentID: id, TutorID: app.ID, Start: start, End: start.Add(time.Duration(in.Schedule.Minutes) * time.Minute), Status: "planned", BufferMinutes: av.BufferMinutes, Timezone: av.Timezone, Version: 1}
			if _, er = a.Store.C("classes").InsertOne(ctx, s); er != nil {
				return er
			}
		}
		if er = a.saveReceipt(ctx, u.ID, r.Header.Get("Idempotency-Key"), fp, id); er != nil {
			return er
		}
		return a.audit(ctx, u.ID, "enrollment.proposed", id)
	})
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 201, result)
}
func (a *App) reserveClass(ctx context.Context, v domain.Enrollment, s domain.ClassSession, av domain.Availability, hold *time.Time, release bool) error {
	if e := a.reserveWindow(ctx, s.ID, s.TutorID, v.LearnerID, s.Start, s.End, s.BufferMinutes, 48, hold, release); e != nil {
		return e
	}
	zone := s.Timezone
	if zone == "" {
		zone = av.Timezone
	}
	loc, e := time.LoadLocation(zone)
	if e != nil {
		return e
	}
	key := "capacity:" + s.TutorID + ":" + s.Start.In(loc).Format("2006-01-02")
	var g guard
	e = a.Store.C("guards").FindOneAndUpdate(ctx, bson.M{"_id": key}, bson.M{"$inc": bson.M{"version": 1}, "$setOnInsert": bson.M{"intervals": []interval{}}}, options.FindOneAndUpdate().SetUpsert(true).SetReturnDocument(options.After)).Decode(&g)
	if e != nil {
		return e
	}
	values := []interval{}
	for _, i := range g.Intervals {
		if i.ID != s.ID && (i.ExpiresAt == nil || i.ExpiresAt.After(a.Now())) {
			values = append(values, i)
		}
	}
	if !release {
		if len(values) >= av.DailyCapacity {
			return domain.Fail(409, "capacity", "The tutor's local-day capacity is full.")
		}
		values = append(values, interval{ID: s.ID, Start: s.Start, End: s.End, ExpiresAt: hold})
	}
	_, e = a.Store.C("guards").UpdateOne(ctx, bson.M{"_id": key}, bson.M{"$set": bson.M{"intervals": values}})
	return e
}
func (a *App) enrollmentAction(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Action  string `json:"action"`
		Version int    `json:"version"`
		Reason  string `json:"reason"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	u := user(r)
	e := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		v, er := a.tuitionAccess(ctx, u, chi.URLParam(r, "id"))
		if er != nil {
			return er
		}
		if v.Version != in.Version {
			return domain.Fail(409, "stale_version", "This agreement changed. Reload before acting.")
		}
		classes, er := storage.Many[domain.ClassSession](ctx, a.Store, "classes", bson.M{"enrollmentId": v.ID})
		if er != nil {
			return er
		}
		switch in.Action {
		case "accept":
			if u.Role != "tutor" || u.ID != v.TutorID || v.Status != "pending_agreement" {
				return domain.Fail(403, "forbidden", "Only the assigned tutor can accept this proposed agreement.")
			}
			application, av, er := a.lockOffering(ctx, v.TutorID, v.Class)
			if er != nil {
				return er
			}
			v.Status = "active"
			if v.Agreement.TotalPaise > 0 {
				v.Status = "awaiting_payment"
				until := a.Now().Add(15 * time.Minute)
				v.HoldUntil = &until
			}
			for _, s := range classes {
				if !s.Start.After(a.Now()) || s.End.After(application.Scope.ExpiresAt) || !available(av, s.Start, s.End) {
					return domain.Fail(409, "availability", "A class is outside the tutor's current availability or approval.")
				}
				s.BufferMinutes = av.BufferMinutes
				if er = a.reserveClass(ctx, v, s, av, v.HoldUntil, false); er != nil {
					return er
				}
				s.Status = "scheduled"
				if v.HoldUntil != nil {
					s.Status = "held"
				}
				s.Version++
				if _, er = a.Store.C("classes").ReplaceOne(ctx, bson.M{"_id": s.ID}, s); er != nil {
					return er
				}
			}
		case "pause", "resume":
			if !enum(u.Role, "parent", "tutor") || !validText(in.Reason, 5, 1000) {
				return domain.Fail(403, "forbidden", "The family or tutor must record a reason.")
			}
			if in.Action == "pause" && v.Status == "active" {
				v.Status = "paused"
			} else if in.Action == "resume" && v.Status == "paused" {
				v.Status = "active"
			} else {
				return domain.Fail(409, "invalid_transition", "This tuition cannot make that transition.")
			}
		case "cancel":
			if !enum(u.Role, "parent", "tutor") || !validText(in.Reason, 5, 1000) || enum(v.Status, "completed", "cancelled") {
				return domain.Fail(409, "invalid_transition", "Record a reason for cancelling open tuition.")
			}
			av, er := storage.One[domain.Availability](ctx, a.Store, "availability", bson.M{"_id": v.TutorID})
			if er != nil {
				return er
			}
			for _, s := range classes {
				if enum(s.Status, "planned", "held", "scheduled", "makeup_due") {
					if er = a.reserveClass(ctx, v, s, av, nil, true); er != nil {
						return er
					}
					s.Status = "cancelled"
					s.Reason = in.Reason
					s.Version++
					if _, er = a.Store.C("classes").ReplaceOne(ctx, bson.M{"_id": s.ID}, s); er != nil {
						return er
					}
				}
			}
			v.Status = "cancelled"
			v.HoldUntil = nil
		default:
			return domain.Fail(422, "validation", "Unknown tuition action.")
		}
		v.Version++
		if _, er = a.Store.C("enrollments").ReplaceOne(ctx, bson.M{"_id": v.ID}, v); er != nil {
			return er
		}
		return a.audit(ctx, u.ID, "enrollment."+in.Action, v.ID)
	})
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 200, map[string]bool{"ok": true})
}
func (a *App) classAction(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Action            string    `json:"action"`
		Version           int       `json:"version"`
		Start             time.Time `json:"start"`
		Reason            string    `json:"reason"`
		Notes             string    `json:"notes"`
		Homework          string    `json:"homework"`
		Review            string    `json:"review"`
		Attendance        string    `json:"attendance"`
		DevelopmentRecord bool      `json:"developmentRecord"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	u := user(r)
	e := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		s, er := storage.One[domain.ClassSession](ctx, a.Store, "classes", bson.M{"_id": chi.URLParam(r, "id")})
		if er != nil {
			return er
		}
		v, er := a.tuitionAccess(ctx, u, s.EnrollmentID)
		if er != nil {
			return er
		}
		if s.Version != in.Version {
			return domain.Fail(409, "stale_version", "This class changed. Reload first.")
		}
		if !enum(v.Status, "active", "paused") {
			return domain.Fail(409, "invalid_transition", "Tuition must be active for class actions.")
		}
		// Writes to the assignment serialize class updates against handover/cancellation.
		if _, er = a.Store.C("enrollments").UpdateOne(ctx, bson.M{"_id": v.ID}, bson.M{"$inc": bson.M{"version": 1}}); er != nil {
			return er
		}
		av, er := storage.One[domain.Availability](ctx, a.Store, "availability", bson.M{"_id": v.TutorID})
		if er != nil {
			return er
		}
		switch in.Action {
		case "propose":
			if !enum(u.Role, "parent", "tutor") || !enum(s.Status, "scheduled", "makeup_due") || !in.Start.After(a.Now().Add(5*time.Minute)) || in.Start.After(a.Now().AddDate(0, 6, 0)) || !validText(in.Reason, 5, 1000) {
				return domain.Fail(422, "validation", "Choose a future time and explain the proposed change.")
			}
			s.Proposal = &domain.ScheduleProposal{Start: in.Start.UTC(), By: u.ID, Reason: in.Reason}
		case "accept_change":
			if !enum(u.Role, "parent", "tutor") || s.Proposal == nil || s.Proposal.By == u.ID || !enum(s.Status, "scheduled", "makeup_due") {
				return domain.Fail(403, "forbidden", "The other party must accept the proposed schedule.")
			}
			app, updated, er := a.lockOffering(ctx, v.TutorID, v.Class)
			if er != nil {
				return er
			}
			if er = a.reserveClass(ctx, v, s, av, nil, true); er != nil {
				return er
			}
			s.Start = s.Proposal.Start
			s.End = s.Start.Add(time.Duration(v.Agreement.Minutes) * time.Minute)
			s.BufferMinutes = updated.BufferMinutes
			s.Timezone = updated.Timezone
			if !s.Start.After(a.Now()) || s.End.After(app.Scope.ExpiresAt) || !available(updated, s.Start, s.End) {
				return domain.Fail(409, "availability", "The new time is no longer available.")
			}
			if er = a.reserveClass(ctx, v, s, updated, nil, false); er != nil {
				return er
			}
			s.Status = "scheduled"
			s.Reason = s.Proposal.Reason
			s.Proposal = nil
		case "cancel":
			if !enum(u.Role, "parent", "tutor") || s.Status != "scheduled" || !s.Start.After(a.Now()) || !validText(in.Reason, 5, 1000) {
				return domain.Fail(422, "validation", "A future scheduled class and cancellation reason are required.")
			}
			if er = a.reserveClass(ctx, v, s, av, nil, true); er != nil {
				return er
			}
			s.Status = "makeup_due"
			if u.Role == "parent" && s.Start.Before(a.Now().Add(time.Duration(v.Agreement.CancellationHours)*time.Hour)) {
				s.Status = "cancelled_consumed"
			}
			s.Reason = in.Reason
			s.Proposal = nil
		case "record":
			if u.Role != "tutor" || s.TutorID != u.ID || v.Status != "active" || s.Status != "scheduled" {
				return domain.Fail(403, "forbidden", "Only the currently assigned tutor can record an active class.")
			}
			if a.Now().Before(s.End) && (a.Config.Env == "production" || !in.DevelopmentRecord) {
				return domain.Fail(409, "not_finished", "This class has not ended. Development timeline recording must be explicitly selected.")
			}
			if !validText(in.Notes, 10, 2000) || !validText(in.Homework, 5, 1200) || !enum(in.Attendance, "present", "absent", "disputed") {
				return domain.Fail(422, "validation", "Record attendance, lesson evidence and next practice.")
			}
			var app domain.Application
			er := a.Store.C("applications").FindOneAndUpdate(ctx, bson.M{"_id": u.ID}, bson.M{"$inc": bson.M{"version": 1}}, options.FindOneAndUpdate().SetReturnDocument(options.After)).Decode(&app)
			if er != nil {
				return er
			}
			if !domain.Eligible(app, v.Class, a.Now()) {
				return domain.Fail(403, "scope_unavailable", "Teaching access is paused.")
			}
			s.Notes = clean(in.Notes)
			s.Homework = clean(in.Homework)
			s.Attendance = in.Attendance
			s.Status = "awaiting_review"
		case "review":
			if u.Role != "mentor" || u.ID != v.MentorID || s.Status != "awaiting_review" || !validText(in.Review, 10, 2000) {
				return domain.Fail(403, "forbidden", "The assigned mentor must review the recorded evidence.")
			}
			s.Review = clean(in.Review)
			s.Status = "reviewed"
			if s.Attendance == "absent" {
				s.Status = "missed"
			}
			if s.Attendance == "disputed" {
				return domain.Fail(409, "attendance_dispute", "Resolve the attendance dispute before completing review.")
			}
		case "resolve_attendance":
			if u.Role != "mentor" || u.ID != v.MentorID || s.Status != "awaiting_review" || !enum(in.Attendance, "present", "absent") || !validText(in.Reason, 10, 1000) {
				return domain.Fail(403, "forbidden", "The assigned mentor must record the dispute outcome.")
			}
			s.Attendance = in.Attendance
			s.Reason = in.Reason
		default:
			return domain.Fail(422, "validation", "Unknown class action.")
		}
		s.Version++
		if _, er = a.Store.C("classes").ReplaceOne(ctx, bson.M{"_id": s.ID}, s); er != nil {
			return er
		}
		if enum(s.Status, "reviewed", "missed", "cancelled_consumed") {
			remaining, er := a.Store.C("classes").CountDocuments(ctx, bson.M{"enrollmentId": v.ID, "status": bson.M{"$nin": []string{"reviewed", "missed", "cancelled_consumed", "cancelled"}}})
			if er != nil {
				return er
			}
			if remaining == 0 {
				if _, er = a.Store.C("enrollments").UpdateOne(ctx, bson.M{"_id": v.ID}, bson.M{"$set": bson.M{"status": "completed"}}); er != nil {
					return er
				}
			}
		}
		return a.audit(ctx, u.ID, "class."+in.Action, s.ID)
	})
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 200, map[string]bool{"ok": true})
}
