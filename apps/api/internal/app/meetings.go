package app

import (
	"context"
	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"net/http"
	"time"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/meetings"
	"tutorplatform/internal/storage"
)

func (a *App) queueMeeting(ctx context.Context, v *domain.Application, operation string) error {
	if a.Meetings == nil {
		return domain.Fail(503, "meeting_unconfigured", "Zoom is not configured.")
	}
	id := "zoom:" + token()
	v.Interview.Provider = "zoom"
	v.Interview.SyncStatus = "pending"
	v.Interview.JobID = id
	return a.enqueue(ctx, id, "zoom_meeting", bson.M{"applicationId": v.ID, "operation": operation, "meetingId": v.Interview.MeetingID, "start": v.Interview.Start.Format(time.RFC3339), "end": v.Interview.End.Format(time.RFC3339), "topic": "Tutor assessment " + id[5:]}, "pending")
}

func (a *App) processMeeting(ctx context.Context, j job) error {
	if a.Meetings == nil {
		return domain.Fail(503, "meeting_unconfigured", "Zoom is not configured.")
	}
	start, e := time.Parse(time.RFC3339, j.Payload["start"])
	if e != nil {
		return e
	}
	end, e := time.Parse(time.RFC3339, j.Payload["end"])
	if e != nil {
		return e
	}
	var meeting meetings.Meeting
	switch j.Payload["operation"] {
	case "create":
		// Persist intent before making a non-idempotent POST. An uncertain response
		// is reconciled by its opaque topic; retries never blindly create a second meeting.
		current, err := storage.One[job](ctx, a.Store, "outbox", bson.M{"_id": j.ID})
		if err != nil {
			return err
		}
		if current.ZoomMeetingID != "" {
			meeting = meetings.Meeting{ID: current.ZoomMeetingID, JoinURL: current.ZoomJoinURL}
			break
		}
		result, err := a.Store.C("outbox").UpdateOne(ctx, bson.M{"_id": j.ID, "zoomCreateAttempted": bson.M{"$ne": true}}, bson.M{"$set": bson.M{"zoomCreateAttempted": true}})
		if err != nil {
			return err
		}
		if result.ModifiedCount == 0 {
			var found bool
			meeting, found, e = a.Meetings.Find(ctx, j.Payload["topic"])
			if e == nil && !found {
				e = domain.Fail(503, "zoom_reconcile_required", "The previous create request needs confirmation from Zoom.")
			}
		} else {
			meeting, e = a.Meetings.Create(ctx, j.Payload["topic"], start, end)
			if e != nil && meetings.Definitive(e) {
				_, err = a.Store.C("outbox").UpdateOne(ctx, bson.M{"_id": j.ID}, bson.M{"$set": bson.M{"zoomCreateAttempted": false}})
				if err != nil {
					return err
				}
			}
		}
		if e != nil {
			return e
		}
		if !meetings.ValidJoinURL(meeting.JoinURL) {
			return domain.Fail(503, "meeting_unavailable", "Zoom did not return a valid meeting.")
		}
		if _, e = a.Store.C("outbox").UpdateOne(ctx, bson.M{"_id": j.ID}, bson.M{"$set": bson.M{"zoomMeetingId": meeting.ID, "zoomJoinUrl": meeting.JoinURL}}); e != nil {
			return e
		}
	case "update":
		meeting, e = a.Meetings.Update(ctx, j.Payload["meetingId"], start, end)
	case "delete":
		e = a.Meetings.Delete(ctx, j.Payload["meetingId"])
	default:
		return domain.Fail(422, "meeting_operation", "Invalid meeting operation.")
	}
	if e != nil {
		return e
	}
	if j.Payload["operation"] != "delete" && !meetings.ValidJoinURL(meeting.JoinURL) {
		return domain.Fail(503, "meeting_unavailable", "Zoom did not return a valid meeting.")
	}
	return a.Store.Tx(ctx, func(ctx context.Context) error {
		v, err := storage.One[domain.Application](ctx, a.Store, "applications", bson.M{"_id": j.Payload["applicationId"]})
		if err != nil {
			return err
		}
		if v.Interview == nil || v.Interview.JobID != j.ID || v.Interview.SyncStatus == "ready" {
			return nil
		}
		v.Interview.SyncStatus = "ready"
		if j.Payload["operation"] != "delete" {
			v.Interview.MeetingID = meeting.ID
			v.Interview.JoinURL = meeting.JoinURL
		} else {
			v.Interview.JoinURL = ""
		}
		v.Version++
		v.UpdatedAt = a.Now()
		if _, err = a.Store.C("applications").ReplaceOne(ctx, bson.M{"_id": v.ID}, v); err != nil {
			return err
		}
		return a.staffAudit(ctx, domain.User{ID: "worker", Name: "Zoom integration"}, "application.zoom_"+j.Payload["operation"], v.ID, "", v.Status, v.Status, &v)
	})
}

func (a *App) retryMeeting(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "admin", "mentor") {
		return
	}
	if a.Meetings == nil {
		a.error(w, r, domain.Fail(503, "meeting_unconfigured", "Zoom is not configured."))
		return
	}
	var in struct {
		Version *int `json:"version"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	e := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		v, e := storage.One[domain.Application](ctx, a.Store, "applications", bson.M{"_id": chi.URLParam(r, "id")})
		if e != nil {
			return e
		}
		u := user(r)
		if v.ID == u.ID || u.Role != "admin" && v.AssessorID != u.ID {
			return domain.Fail(403, "forbidden", "Only the reviewer can retry this operation.")
		}
		if in.Version == nil || *in.Version != v.Version {
			return domain.Fail(409, "stale", "Refresh the application before retrying.")
		}
		if v.Interview == nil || v.Interview.Provider != "zoom" || v.Interview.SyncStatus != "failed" {
			return domain.Fail(409, "meeting_pending", "The meeting operation is not ready for retry.")
		}
		result, e := a.Store.C("outbox").UpdateOne(ctx, bson.M{"_id": v.Interview.JobID, "status": "failed"}, bson.M{"$set": bson.M{"status": "pending", "attempts": 0, "availableAt": a.Now(), "lastError": ""}})
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
		return a.staffAudit(ctx, u, "application.zoom_retry", v.ID, "", v.Status, v.Status, &v)
	})
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 200, map[string]bool{"ok": true})
}
