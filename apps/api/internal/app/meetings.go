package app

import (
	"context"
	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"net/http"
	"time"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
)

func (a *App) retryMeeting(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "mentor") {
		return
	}
	if a.Google == nil {
		a.error(w, r, domain.Fail(503, "meeting_unconfigured", "Google Meet is not configured."))
		return
	}
	var in struct {
		Version      *int   `json:"version"`
		CalendarETag string `json:"calendarETag"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	if in.CalendarETag != "" {
		v, e := a.staffApplication(r.Context(), user(r), chi.URLParam(r, "id"))
		if e != nil {
			a.error(w, r, e)
			return
		}
		if v.Interview == nil || v.Interview.Provider != "google" || a.Google == nil {
			a.error(w, r, domain.Fail(409, "meeting_pending", "No Google Calendar operation to reconcile."))
			return
		}
		access, e := a.googleAccess(r.Context(), v.Interview.MentorID)
		if e != nil {
			a.error(w, r, e)
			return
		}
		event, e := a.Google.Get(r.Context(), access, v.Interview.MeetingID)
		if e != nil {
			a.error(w, r, e)
			return
		}
		if event.ETag != in.CalendarETag || event.Extended.Private["application"] != v.ID {
			a.error(w, r, domain.Fail(409, "google_calendar_conflict", "Calendar changed again. Review it before retrying."))
			return
		}
	}
	e := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		v, e := storage.One[domain.Application](ctx, a.Store, "applications", bson.M{"_id": chi.URLParam(r, "id")})
		if e != nil {
			return e
		}
		u := user(r)
		if v.ID == u.ID || v.AssessorID != u.ID {
			return domain.Fail(403, "forbidden", "Only the reviewer can retry this operation.")
		}
		if in.Version == nil || *in.Version != v.Version {
			return domain.Fail(409, "stale", "Refresh the application before retrying.")
		}
		if v.Interview == nil || v.Interview.Provider != "google" || v.Interview.SyncStatus != "failed" {
			return domain.Fail(409, "meeting_pending", "The meeting operation is not ready for retry.")
		}
		set := bson.M{"status": "pending", "attempts": 0, "availableAt": a.Now(), "lastError": "", "payload.requestedAt": a.Now().Format(time.RFC3339)}
		if in.CalendarETag != "" {
			set["payload.etag"] = in.CalendarETag
		}
		result, e := a.Store.C("outbox").UpdateOne(ctx, bson.M{"_id": v.Interview.JobID, "status": "failed"}, bson.M{"$set": set})
		if e != nil {
			return e
		}
		if result.ModifiedCount != 1 {
			return domain.Fail(409, "meeting_pending", "A retry is already in progress.")
		}
		v.Interview.SyncStatus = "pending"
		v.Version++
		v.UpdatedAt = a.Now()
		if _, e = a.Store.C("applications").ReplaceOne(ctx, bson.M{"_id": v.ID}, v); e != nil {
			return e
		}
		return a.staffAudit(ctx, u, "application."+v.Interview.Provider+"_retry", v.ID, "", v.Status, v.Status, &v)
	})
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 200, map[string]bool{"ok": true})
}
