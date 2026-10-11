package app

import (
	"context"
	"errors"
	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"net/http"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/googlecalendar"
	"tutorplatform/internal/storage"
)

// A paused tutor may renew existing authorization solely to resolve hosted work.
// This does not reopen any lesson or teaching route.
func (a *App) googleOrganizerAllowed(ctx context.Context, u domain.User) error {
	if u.Role != "tutor" {
		return nil
	}
	application, err := storage.One[domain.Application](ctx, a.Store, "applications", bson.M{"_id": u.ID})
	if err != nil && !errors.Is(err, mongo.ErrNoDocuments) {
		return err
	}
	if err == nil && application.Status == "approved" && application.Scope.ExpiresAt.After(a.Now()) {
		return nil
	}
	connection, err := storage.One[googleConnection](ctx, a.Store, "google_connections", bson.M{"_id": u.ID})
	if err != nil && !errors.Is(err, mongo.ErrNoDocuments) {
		return err
	}
	if err == nil && connection.Status != "disconnected" {
		outstanding, e := a.googleOutstanding(ctx, u.ID)
		if e != nil {
			return e
		}
		if outstanding > 0 {
			return nil
		}
	}
	return domain.Fail(403, "approval_required", "Google lesson hosting requires tutor approval. Existing hosted work can still be resolved.")
}

func googleReturnPath(u domain.User) string {
	if u.Role == "tutor" {
		return "/workspace?view=home"
	}
	return "/workspace?view=interviews"
}

// Count unresolved provider work and active host meetings before replacing/removing authorization.
func (a *App) googleOutstanding(ctx context.Context, id string) (int64, error) {
	total, err := a.Store.C("applications").CountDocuments(ctx, bson.M{"interview.mentorId": id, "interview.provider": "google", "$or": []bson.M{{"interview.status": "scheduled"}, {"interview.syncStatus": bson.M{"$in": []string{"pending", "failed"}}}}})
	if err != nil {
		return 0, err
	}
	for _, kind := range []string{"classes", "trials"} {
		n, e := a.Store.C(kind).CountDocuments(ctx, bson.M{"meeting.organizerId": id, "meeting.provider": "google", "meeting.status": bson.M{"$in": []string{"ready", "pending", "failed"}}})
		if e != nil {
			return 0, e
		}
		total += n
	}
	n, err := a.Store.C("outbox").CountDocuments(ctx, bson.M{"kind": "google_lesson", "payload.organizerId": id, "status": bson.M{"$ne": "done"}})
	return total + n, err
}

func (a *App) googleLessonRecovery(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "tutor") || !a.googleAvailable(w, r) {
		return
	}
	jobs, err := storage.Many[job](r.Context(), a.Store, "outbox", bson.M{"kind": "google_lesson", "payload.organizerId": user(r).ID, "status": "failed"})
	if err != nil {
		a.error(w, r, err)
		return
	}
	items := []map[string]string{}
	for _, j := range jobs {
		items = append(items, map[string]string{"id": j.ID, "operation": j.Payload["operation"], "lessonKind": j.Payload["lessonKind"], "lessonId": j.Payload["lessonId"], "lastError": j.LastError})
	}
	a.json(w, 200, map[string]any{"items": items})
}

func (a *App) googleRecoveryJob(ctx context.Context, u domain.User, id string) (job, error) {
	return storage.One[job](ctx, a.Store, "outbox", bson.M{"_id": id, "kind": "google_lesson", "payload.organizerId": u.ID, "status": "failed"})
}

func (a *App) reviewGoogleLesson(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "tutor") || !a.googleAvailable(w, r) {
		return
	}
	j, err := a.googleRecoveryJob(r.Context(), user(r), chi.URLParam(r, "id"))
	if err != nil {
		a.error(w, r, err)
		return
	}
	access, err := a.googleAccess(r.Context(), user(r).ID)
	if err != nil {
		a.error(w, r, err)
		return
	}
	event, err := a.Google.Get(r.Context(), access, j.Payload["eventId"])
	if err != nil {
		var failure *googlecalendar.Error
		if j.Payload["operation"] == "delete" && errors.As(err, &failure) && failure.Code == "google_event_missing" {
			a.json(w, 200, map[string]any{"etag": "", "status": "missing", "operation": "delete", "calendarMissing": true})
			return
		}
		a.googleRecordError(r.Context(), user(r).ID, err)
		a.error(w, r, err)
		return
	}
	if event.Extended.Private["application"] != j.Payload["lessonKind"]+":"+j.Payload["lessonId"] {
		a.error(w, r, domain.Fail(409, "google_calendar_conflict", "The Calendar event does not match this lesson."))
		return
	}
	a.json(w, 200, map[string]string{"etag": event.ETag, "start": event.Start.DateTime, "end": event.End.DateTime, "status": event.Status, "operation": j.Payload["operation"]})
}

func (a *App) retryGoogleLesson(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "tutor") || !a.googleAvailable(w, r) {
		return
	}
	var in struct {
		CalendarETag    string `json:"calendarETag"`
		CalendarMissing bool   `json:"calendarMissing"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	id := chi.URLParam(r, "id")
	j, err := a.googleRecoveryJob(r.Context(), user(r), id)
	if err != nil {
		a.error(w, r, err)
		return
	}
	if j.LastError == "google_calendar_conflict" && in.CalendarETag == "" && !in.CalendarMissing {
		a.error(w, r, domain.Fail(409, "google_calendar_conflict", "Review the current Calendar event before retrying."))
		return
	}
	verifiedMissing := false
	if in.CalendarETag != "" || in.CalendarMissing {
		if j.Payload["operation"] != "delete" {
			a.error(w, r, domain.Fail(409, "google_calendar_conflict", "Cancel or reschedule this lesson through its class controls; a changed meeting cannot be adopted."))
			return
		}
		access, e := a.googleAccess(r.Context(), user(r).ID)
		if e != nil {
			a.error(w, r, e)
			return
		}
		event, e := a.Google.Get(r.Context(), access, j.Payload["eventId"])
		var failure *googlecalendar.Error
		verifiedMissing = in.CalendarMissing && errors.As(e, &failure) && failure.Code == "google_event_missing"
		if e != nil && !verifiedMissing {
			a.error(w, r, e)
			return
		}
		if !verifiedMissing && (in.CalendarMissing || event.ETag != in.CalendarETag || event.Extended.Private["application"] != j.Payload["lessonKind"]+":"+j.Payload["lessonId"]) {
			a.error(w, r, domain.Fail(409, "google_calendar_conflict", "Calendar changed again. Review it before retrying."))
			return
		}
	}
	err = a.Store.Tx(r.Context(), func(ctx context.Context) error {
		current, e := a.googleRecoveryJob(ctx, user(r), id)
		if e != nil {
			return e
		}
		if current.Payload["eventId"] != j.Payload["eventId"] {
			return domain.Fail(409, "stale", "The meeting operation changed.")
		}
		set := bson.M{"status": "pending", "attempts": 0, "availableAt": a.Now(), "lastError": "", "payload.requestedAt": a.Now().Format("2006-01-02T15:04:05Z07:00")}
		if verifiedMissing {
			set["status"] = "done"
		}
		if in.CalendarETag != "" {
			set["payload.etag"] = in.CalendarETag
		}
		result, e := a.Store.C("outbox").UpdateOne(ctx, bson.M{"_id": id, "status": "failed"}, bson.M{"$set": set})
		if e != nil {
			return e
		}
		if result.ModifiedCount != 1 {
			return domain.Fail(409, "meeting_pending", "A retry is already in progress.")
		}
		if verifiedMissing {
			if e = a.finishLessonDeletion(ctx, j.Payload["lessonKind"], j.Payload["lessonId"], j.ID); e != nil {
				return e
			}
		}
		if j.Payload["operation"] == "create" {
			_, _, _, m, _, e := a.lessonMeetingAccess(ctx, user(r), j.Payload["lessonKind"], j.Payload["lessonId"])
			if e != nil {
				return e
			}
			if m == nil || m.JobID != id {
				return domain.Fail(409, "stale", "This meeting is no longer current.")
			}
			_, e = a.Store.C(j.Payload["lessonKind"]).UpdateOne(ctx, bson.M{"_id": j.Payload["lessonId"], "meeting.jobId": id}, bson.M{"$set": bson.M{"meeting.status": "pending", "meeting.lastError": ""}})
			if e != nil {
				return e
			}
		}
		return a.audit(ctx, user(r).ID, "lesson.meeting_retry", j.Payload["lessonId"])
	})
	if err != nil {
		a.error(w, r, err)
		return
	}
	a.json(w, 200, map[string]bool{"ok": true})
}
