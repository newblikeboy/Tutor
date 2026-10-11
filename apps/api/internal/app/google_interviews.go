package app

import (
	"context"
	"errors"
	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"net/http"
	"strings"
	"time"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/googlecalendar"
	"tutorplatform/internal/storage"
)

func validInterviewLink(v *domain.Interview) bool {
	return v != nil && v.Provider == "google" && googlecalendar.ValidMeetURL(v.JoinURL)
}
func (a *App) queueGoogleInterview(ctx context.Context, v *domain.Application, operation string) error {
	if a.Google == nil {
		return domain.Fail(503, "google_unconfigured", "Google interviews are not configured.")
	}
	if operation != "delete" {
		c, e := storage.One[googleConnection](ctx, a.Store, "google_connections", bson.M{"_id": v.AssessorID, "status": "connected"})
		if e != nil {
			if e != mongo.ErrNoDocuments {
				return e
			}
			return domain.Fail(409, "google_reconnect_required", "Connect your Google account before scheduling.")
		}
		// Contend with disconnect/reconnect within this same scheduling transaction.
		if _, e = a.Store.C("google_connections").UpdateOne(ctx, bson.M{"_id": c.ID, "revision": c.Revision}, bson.M{"$inc": bson.M{"revision": 1}}); e != nil {
			return e
		}
		v.Interview.HostKey = digest(c.Email)
	}
	id := "google:" + token()
	v.Interview.Provider = "google"
	v.Interview.SyncStatus = "pending"
	v.Interview.LastError = ""
	v.Interview.JobID = id
	v.Interview.JoinURL = ""
	if v.Interview.MentorID == "" {
		v.Interview.MentorID = v.AssessorID
	}
	if operation == "create" {
		v.Interview.MeetingID = "g" + digest(id)
	}
	tutor, e := storage.One[domain.User](ctx, a.Store, "users", bson.M{"_id": v.ID})
	if e != nil {
		return e
	}
	email, valid := normalizeEmail(tutor.Email)
	if !valid {
		email = ""
	}
	return a.enqueue(ctx, id, "google_interview", bson.M{"applicationId": v.ID, "mentorId": v.Interview.MentorID, "operation": operation, "eventId": v.Interview.MeetingID, "etag": v.Interview.ETag, "start": v.Interview.Start.Format(time.RFC3339), "end": v.Interview.End.Format(time.RFC3339), "email": email, "notes": v.Interview.Notes, "requestedAt": a.Now().Format(time.RFC3339)}, "pending")
}
func (a *App) processGoogleInterview(ctx context.Context, j job) error {
	if a.Google == nil {
		return domain.Fail(503, "google_unconfigured", "Google interviews are not configured.")
	}
	access, e := a.googleAccess(ctx, j.Payload["mentorId"])
	if e != nil {
		return e
	}
	if j.Kind == "google_revoke" {
		return errors.New("invalid Google interview job")
	}
	// Only current, assigned work can create/update events. Cancellation still uses the historical organizer.
	current, e := storage.One[domain.Application](ctx, a.Store, "applications", bson.M{"_id": j.Payload["applicationId"]})
	if e != nil {
		return e
	}
	if current.Interview == nil || current.Interview.JobID != j.ID {
		return nil
	}
	if j.Payload["operation"] != "delete" {
		if current.AssessorID != j.Payload["mentorId"] {
			return domain.Fail(403, "google_assignment_changed", "Interview assignment changed.")
		}
		if _, e = storage.One[domain.User](ctx, a.Store, "users", bson.M{"_id": current.AssessorID, "role": "mentor", "$or": activeStaffFilter()["$or"]}); e != nil {
			return e
		}
	}
	start, e := time.Parse(time.RFC3339, j.Payload["start"])
	if e != nil {
		return e
	}
	end, e := time.Parse(time.RFC3339, j.Payload["end"])
	if e != nil {
		return e
	}
	var event googlecalendar.Event
	switch j.Payload["operation"] {
	case "create":
		event, e = a.Google.Create(ctx, access, j.Payload["eventId"], digest(j.ID), current.ID, j.Payload["email"], j.Payload["notes"], start, end)
	case "update":
		event, e = a.Google.Update(ctx, access, j.Payload["eventId"], j.Payload["etag"], digest(j.ID), j.Payload["notes"], start, end)
	case "delete":
		e = a.Google.Delete(ctx, access, j.Payload["eventId"], j.Payload["etag"])
	default:
		return domain.Fail(422, "google_operation_invalid", "Unknown Calendar operation.")
	}
	if e != nil {
		a.googleRecordError(ctx, j.Payload["mentorId"], e)
		return e
	}
	link := ""
	if j.Payload["operation"] != "delete" {
		if event.Extended.Private["application"] != current.ID || event.Extended.Private["operation"] != digest(j.ID) {
			return googlecalendar.Failure("google_calendar_conflict", true, false)
		}
		eventStart, err := time.Parse(time.RFC3339, event.Start.DateTime)
		if err != nil || !eventStart.Equal(start) {
			return googlecalendar.Failure("google_calendar_conflict", true, false)
		}
		eventEnd, err := time.Parse(time.RFC3339, event.End.DateTime)
		if err != nil || !eventEnd.Equal(end) {
			return googlecalendar.Failure("google_calendar_conflict", true, false)
		}
		link, e = event.Link()
		if e != nil {
			var f *googlecalendar.Error
			requested, _ := time.Parse(time.RFC3339, j.Payload["requestedAt"])
			if errors.As(e, &f) && f.Code == "google_conference_pending" && !requested.IsZero() && a.Now().After(requested.Add(15*time.Minute)) {
				return googlecalendar.Failure("google_conference_timeout", true, false)
			}
		}
		if e != nil {
			return e
		}
	}
	return a.Store.Tx(ctx, func(ctx context.Context) error {
		v, e := storage.One[domain.Application](ctx, a.Store, "applications", bson.M{"_id": current.ID})
		if e != nil {
			return e
		}
		if v.Interview == nil || v.Interview.JobID != j.ID || v.Interview.SyncStatus == "ready" {
			return nil
		}
		v.Interview.SyncStatus = "ready"
		v.Interview.LastError = ""
		v.Interview.JoinURL = link
		if j.Payload["operation"] != "delete" {
			v.Interview.MeetingID = event.ID
			v.Interview.MeetingCode = strings.TrimPrefix(link, "https://meet.google.com/")
			v.Interview.ETag = event.ETag
		}
		v.Version++
		v.UpdatedAt = a.Now()
		if _, e = a.Store.C("applications").ReplaceOne(ctx, bson.M{"_id": v.ID}, v); e != nil {
			return e
		}
		n := domain.Notification{ID: "interview:" + j.ID, OwnerID: v.ID, Kind: "interview_" + j.Payload["operation"], TargetID: v.ID, CreatedAt: a.Now()}
		if _, e = a.Store.C("notifications").UpdateOne(ctx, bson.M{"_id": n.ID}, bson.M{"$setOnInsert": n}, options.UpdateOne().SetUpsert(true)); e != nil {
			return e
		}
		if e = a.queueInterviewEmail(ctx, v, j.Payload["operation"]); e != nil {
			return e
		}
		return a.staffAudit(ctx, domain.User{ID: "worker", Name: "Google Calendar integration"}, "application.google_"+j.Payload["operation"], v.ID, "", v.Status, v.Status, &v)
	})
}
func (a *App) processGoogleRevoke(ctx context.Context, j job) error {
	refresh, e := a.Google.Decrypt(j.Payload["encryptedRefresh"], j.Payload["mentorId"]+":refresh")
	if e != nil {
		return e
	}
	e = a.Google.Revoke(ctx, refresh)
	var f *googlecalendar.Error
	if errors.As(e, &f) && f.Code == "google_already_revoked" {
		e = nil
	}
	if e == nil {
		_, e = a.Store.C("outbox").UpdateOne(ctx, bson.M{"_id": j.ID}, bson.M{"$unset": bson.M{"payload.encryptedRefresh": ""}})
	}
	return e
}
func (a *App) queueInterviewEmail(ctx context.Context, v domain.Application, operation string) error {
	if a.Mail == nil {
		return nil
	}
	for _, id := range []string{v.ID, v.Interview.MentorID} {
		if e := a.enqueue(ctx, "email:"+v.Interview.JobID+":"+id, "email", bson.M{"event": "interview_update", "recipientId": id, "targetKind": "application", "targetId": v.ID, "jobId": v.Interview.JobID, "operation": operation}, "pending"); e != nil {
			return e
		}
	}
	return nil
}

func (a *App) reviewGoogleCalendar(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "mentor") || !a.googleAvailable(w, r) {
		return
	}
	v, e := a.staffApplication(r.Context(), user(r), chi.URLParam(r, "id"))
	if e != nil {
		a.error(w, r, e)
		return
	}
	if v.Interview == nil || v.Interview.Provider != "google" || v.Interview.SyncStatus != "failed" {
		a.error(w, r, domain.Fail(409, "meeting_pending", "No failed Google operation to review."))
		return
	}
	j, e := storage.One[job](r.Context(), a.Store, "outbox", bson.M{"_id": v.Interview.JobID})
	if e != nil {
		a.error(w, r, e)
		return
	}
	access, e := a.googleAccess(r.Context(), v.Interview.MentorID)
	if e != nil {
		a.error(w, r, e)
		return
	}
	event, e := a.Google.Get(r.Context(), access, v.Interview.MeetingID)
	if e != nil {
		a.googleRecordError(r.Context(), v.Interview.MentorID, e)
		a.error(w, r, e)
		return
	}
	if event.Extended.Private["application"] != v.ID {
		a.error(w, r, domain.Fail(409, "google_calendar_conflict", "The Calendar event no longer matches this application."))
		return
	}
	a.json(w, 200, map[string]string{"etag": event.ETag, "status": event.Status, "start": event.Start.DateTime, "end": event.End.DateTime, "operation": j.Payload["operation"]})
}

// Recheck both authorization and Google's current event immediately before joining.
func (a *App) joinInterview(w http.ResponseWriter, r *http.Request) {
	u := user(r)
	id := chi.URLParam(r, "id")
	v, e := storage.One[domain.Application](r.Context(), a.Store, "applications", bson.M{"_id": id})
	if e != nil {
		a.error(w, r, e)
		return
	}
	if !(u.Role == "tutor" && u.ID == id || u.Role == "mentor" && v.AssessorID == u.ID) {
		a.error(w, r, domain.Fail(404, "not_found", "This interview is unavailable."))
		return
	}
	if v.Interview == nil || v.Interview.Status != "scheduled" || v.Interview.SyncStatus != "ready" || !validInterviewLink(v.Interview) {
		a.error(w, r, domain.Fail(409, "interview_pending", "The current interview has no confirmed join link."))
		return
	}
	if v.Interview.Provider == "google" {
		if !a.googleAvailable(w, r) {
			return
		}
		access, err := a.googleAccess(r.Context(), v.Interview.MentorID)
		if err != nil {
			a.error(w, r, err)
			return
		}
		event, err := a.Google.Get(r.Context(), access, v.Interview.MeetingID)
		if err == nil {
			var link string
			link, err = event.Link()
			start, startErr := time.Parse(time.RFC3339, event.Start.DateTime)
			end, endErr := time.Parse(time.RFC3339, event.End.DateTime)
			// Calendar RSVP/metadata changes can alter the ETag without changing the interview.
			// Joining verifies its schedule/link; writes still require explicit ETag reconciliation.
			if err == nil && (startErr != nil || endErr != nil || !start.Equal(v.Interview.Start) || !end.Equal(v.Interview.End) || link != v.Interview.JoinURL || event.Extended.Private["application"] != v.ID) {
				err = googlecalendar.Failure("google_calendar_conflict", true, false)
			}
		}
		if err != nil {
			a.googleRecordError(r.Context(), v.Interview.MentorID, err)
			var f *googlecalendar.Error
			if errors.As(err, &f) && enum(f.Code, "google_calendar_conflict", "google_event_missing", "google_conference_failed") {
				persistErr := a.Store.Tx(r.Context(), func(ctx context.Context) error {
					current, e := storage.One[domain.Application](ctx, a.Store, "applications", bson.M{"_id": v.ID})
					if e != nil {
						return e
					}
					if current.Version != v.Version {
						return nil
					}
					if e = a.queueGoogleInterview(ctx, &current, "update"); e != nil {
						return e
					}
					current.Interview.SyncStatus = "failed"
					current.Interview.LastError = f.Code
					current.Version++
					current.UpdatedAt = a.Now()
					if _, e = a.Store.C("outbox").UpdateOne(ctx, bson.M{"_id": current.Interview.JobID}, bson.M{"$set": bson.M{"status": "failed", "lastError": f.Code}}); e != nil {
						return e
					}
					if _, e = a.Store.C("applications").ReplaceOne(ctx, bson.M{"_id": current.ID}, current); e != nil {
						return e
					}
					return a.staffAudit(ctx, domain.User{ID: "worker", Name: "Google Calendar verification"}, "application.google_conflict", current.ID, "", current.Status, current.Status, &current)
				})
				if persistErr != nil {
					a.error(w, r, persistErr)
					return
				}
			}
			a.error(w, r, err)
			return
		}
	}
	w.Header().Set("Referrer-Policy", "no-referrer")
	http.Redirect(w, r, v.Interview.JoinURL, http.StatusSeeOther)
}
