package app

import (
	"context"
	"errors"
	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"net/http"
	"time"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/googlecalendar"
	"tutorplatform/internal/storage"
)

func (a *App) reserveLessonCalendar(ctx context.Context, kind, id, tutor string, m *domain.LessonMeeting, release bool) error {
	return a.reserveInterview(ctx, domain.Application{ID: "lesson:" + kind + ":" + id, AssessorID: tutor, Interview: &domain.Interview{Provider: "google", Status: "scheduled", HostKey: m.HostKey, Start: m.Start, End: m.End}}, release)
}

func (a *App) clearLessonMeeting(ctx context.Context, kind, id string, m **domain.LessonMeeting) error {
	if *m == nil || (*m).Status == "cancelled" || (*m).Status == "retired" {
		return nil
	}
	if (*m).Provider != "google" {
		(*m).Status = "retired"
		return nil
	}
	meeting := *m
	previous, err := storage.One[job](ctx, a.Store, "outbox", bson.M{"_id": meeting.JobID})
	if err != nil && !errors.Is(err, mongo.ErrNoDocuments) {
		return err
	}
	if err == nil && previous.Payload["operation"] == "delete" {
		return nil
	}
	jobID := "google-lesson-delete:" + token()
	payload := bson.M{"lessonKind": kind, "lessonId": id, "organizerId": meeting.OrganizerID, "operation": "delete", "eventId": meeting.ID, "etag": meeting.ETag, "sourceOperation": digest(meeting.JobID), "start": meeting.Start.Format(time.RFC3339Nano), "end": meeting.End.Format(time.RFC3339Nano)}
	if err := a.enqueue(ctx, jobID, "google_lesson", payload, "pending"); err != nil {
		return err
	}
	if err := a.reserveLessonCalendar(ctx, kind, id, meeting.OrganizerID, meeting, true); err != nil {
		return err
	}
	meeting.Status = "cancelled"
	meeting.JoinURL = ""
	meeting.JobID = jobID
	return nil
}

func (a *App) prepareLessonMeeting(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "tutor") {
		return
	}
	if a.Google == nil || a.Config.MeetingProvider != "google" {
		a.error(w, r, domain.Fail(503, "meeting_unconfigured", "Google Meet lessons are not configured."))
		return
	}
	var in struct {
		Version int `json:"version"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	kind, id := lessonKind(r), chi.URLParam(r, "id")
	err := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		tutor, start, end, m, version, err := a.lessonMeetingAccess(ctx, user(r), kind, id)
		if err != nil {
			return err
		}
		if tutor != user(r).ID {
			return domain.Fail(403, "forbidden", "Only the assigned tutor can prepare this meeting.")
		}
		if kind == "classes" && version != in.Version {
			return domain.Fail(409, "stale_version", "This class changed. Reload first.")
		}
		if !end.After(a.Now()) {
			return domain.Fail(409, "not_finished", "This lesson has already ended.")
		}
		connection, err := storage.One[googleConnection](ctx, a.Store, "google_connections", bson.M{"_id": tutor, "status": "connected"})
		if err != nil {
			if errors.Is(err, mongo.ErrNoDocuments) {
				return domain.Fail(409, "google_reconnect_required", "Connect your Google account before preparing lessons.")
			}
			return err
		}
		if _, err = a.Store.C("google_connections").UpdateOne(ctx, bson.M{"_id": tutor, "revision": connection.Revision}, bson.M{"$inc": bson.M{"revision": 1}}); err != nil {
			return err
		}
		update := bson.M{}
		if m != nil && m.Provider == "google" && m.Status == "cancelled" {
			pending, e := a.Store.C("outbox").CountDocuments(ctx, bson.M{"_id": m.JobID, "status": bson.M{"$ne": "done"}})
			if e != nil {
				return e
			}
			if pending != 0 {
				return domain.Fail(409, "meeting_pending", "Wait for the previous Google meeting cancellation to finish.")
			}
		}
		if m != nil && m.Provider != "google" {
			update["$push"] = bson.M{"meetingHistory": m}
			m = nil
		}
		if m != nil && m.Status != "cancelled" {
			if m.Status != "failed" {
				return nil
			}
			previous, e := storage.One[job](ctx, a.Store, "outbox", bson.M{"_id": m.JobID})
			if e != nil {
				return e
			}
			if previous.Payload["operation"] == "delete" {
				return domain.Fail(409, "meeting_pending", "Resolve the previous cancellation in your Google connection settings before preparing another meeting.")
			}
			if m.LastError == "google_calendar_conflict" {
				return domain.Fail(409, "google_calendar_conflict", "Review Calendar changes in your Google connection settings before retrying.")
			}
			result, err := a.Store.C("outbox").UpdateOne(ctx, bson.M{"_id": m.JobID, "status": "failed"}, bson.M{"$set": bson.M{"status": "pending", "attempts": 0, "availableAt": a.Now(), "lastError": "", "payload.requestedAt": a.Now().Format(time.RFC3339Nano)}})
			if err != nil {
				return err
			}
			if result.ModifiedCount != 1 {
				return domain.Fail(409, "meeting_pending", "A retry is already in progress.")
			}
			m.Status = "pending"
			m.LastError = ""
		} else {
			if m != nil {
				update["$push"] = bson.M{"meetingHistory": m}
			}
			jobID := "google-lesson:" + token()
			m = &domain.LessonMeeting{Provider: "google", OrganizerID: tutor, HostKey: digest(connection.Email), Status: "pending", JobID: jobID, ID: "g" + digest(jobID), Start: start, End: end}
			if err = a.reserveLessonCalendar(ctx, kind, id, tutor, m, false); err != nil {
				return err
			}
			owner := ""
			if kind == "classes" {
				lesson, e := storage.One[domain.ClassSession](ctx, a.Store, kind, bson.M{"_id": id})
				if e != nil {
					return e
				}
				en, e := storage.One[domain.Enrollment](ctx, a.Store, "enrollments", bson.M{"_id": lesson.EnrollmentID})
				if e != nil {
					return e
				}
				owner = en.OwnerID
			} else {
				lesson, e := storage.One[domain.Trial](ctx, a.Store, kind, bson.M{"_id": id})
				if e != nil {
					return e
				}
				owner = lesson.OwnerID
			}
			parent, e := storage.One[domain.User](ctx, a.Store, "users", bson.M{"_id": owner})
			if e != nil {
				return e
			}
			email, valid := normalizeEmail(parent.Email)
			if !valid {
				email = ""
			}
			if err = a.enqueue(ctx, jobID, "google_lesson", bson.M{"lessonKind": kind, "lessonId": id, "organizerId": tutor, "operation": "create", "eventId": m.ID, "start": start.Format(time.RFC3339Nano), "end": end.Format(time.RFC3339Nano), "email": email, "requestedAt": a.Now().Format(time.RFC3339Nano)}, "pending"); err != nil {
				return err
			}
		}
		update["$set"] = bson.M{"meeting": m}
		if kind == "classes" {
			update["$inc"] = bson.M{"version": 1}
		}
		if _, err = a.Store.C(kind).UpdateOne(ctx, bson.M{"_id": id}, update); err != nil {
			return err
		}
		return a.audit(ctx, tutor, "lesson.meeting_prepare", id)
	})
	if err != nil {
		a.error(w, r, err)
		return
	}
	a.json(w, 200, map[string]bool{"ok": true})
}

func (a *App) processGoogleLesson(ctx context.Context, j job) error {
	if a.Google == nil {
		return domain.Fail(503, "meeting_unconfigured", "Google Meet is not configured.")
	}
	kind, id, organizer := j.Payload["lessonKind"], j.Payload["lessonId"], j.Payload["organizerId"]
	if !enum(kind, "classes", "trials") {
		return domain.Fail(422, "validation", "Invalid lesson kind.")
	}
	if j.Payload["operation"] == "create" {
		_, _, lessonEnd, m, _, err := a.lessonMeetingAccess(ctx, domain.User{ID: organizer, Role: "tutor"}, kind, id)
		if err != nil || m == nil || m.JobID != j.ID {
			if err != nil && !errors.Is(err, mongo.ErrNoDocuments) {
				var f *domain.Fault
				if !errors.As(err, &f) {
					return err
				}
				current, readErr := storage.One[struct {
					Meeting *domain.LessonMeeting `bson:"meeting"`
				}](ctx, a.Store, kind, bson.M{"_id": id})
				if readErr != nil && !errors.Is(readErr, mongo.ErrNoDocuments) {
					return readErr
				}
				if readErr == nil && current.Meeting != nil && current.Meeting.JobID == j.ID {
					return googlecalendar.Failure("google_lesson_unavailable", true, false)
				}
			}
			return nil
		}
		if !lessonEnd.After(a.Now()) {
			return googlecalendar.Failure("google_lesson_ended", true, false)
		}
	}
	access, err := a.googleAccess(ctx, organizer)
	if err != nil {
		return err
	}
	start, e := time.Parse(time.RFC3339, j.Payload["start"])
	if e != nil {
		return e
	}
	end, e := time.Parse(time.RFC3339, j.Payload["end"])
	if e != nil {
		return e
	}
	identity := kind + ":" + id
	if j.Payload["operation"] == "delete" {
		event, e := a.Google.Get(ctx, access, j.Payload["eventId"])
		var failure *googlecalendar.Error
		if errors.As(e, &failure) && failure.Code == "google_event_missing" {
			return a.finishLessonDeletion(ctx, kind, id, j.ID)
		}
		if e != nil {
			a.googleRecordError(ctx, organizer, e)
			return e
		}
		if event.Extended.Private["application"] != identity {
			return googlecalendar.Failure("google_calendar_conflict", true, false)
		}
		etag := j.Payload["etag"]
		if etag == "" {
			eventStart, _ := time.Parse(time.RFC3339, event.Start.DateTime)
			eventEnd, _ := time.Parse(time.RFC3339, event.End.DateTime)
			if event.Extended.Private["operation"] != j.Payload["sourceOperation"] || !eventStart.Equal(start) || !eventEnd.Equal(end) {
				return googlecalendar.Failure("google_calendar_conflict", true, false)
			}
			etag = event.ETag
		}
		e = a.Google.Delete(ctx, access, event.ID, etag)
		a.googleRecordError(ctx, organizer, e)
		if e != nil {
			return e
		}
		return a.finishLessonDeletion(ctx, kind, id, j.ID)
	}
	if j.Payload["operation"] != "create" {
		return domain.Fail(422, "validation", "Invalid lesson operation.")
	}
	event, err := a.Google.CreateLesson(ctx, access, j.Payload["eventId"], digest(j.ID), identity, j.Payload["email"], start, end)
	if err != nil {
		a.googleRecordError(ctx, organizer, err)
		return err
	}
	eventStart, _ := time.Parse(time.RFC3339, event.Start.DateTime)
	eventEnd, _ := time.Parse(time.RFC3339, event.End.DateTime)
	if event.Extended.Private["application"] != identity || event.Extended.Private["operation"] != digest(j.ID) || !eventStart.Equal(start) || !eventEnd.Equal(end) {
		return googlecalendar.Failure("google_calendar_conflict", true, false)
	}
	link, err := event.Link()
	if err != nil {
		var f *googlecalendar.Error
		requested, _ := time.Parse(time.RFC3339, j.Payload["requestedAt"])
		if errors.As(err, &f) && f.Code == "google_conference_pending" && !requested.IsZero() && a.Now().After(requested.Add(15*time.Minute)) {
			return googlecalendar.Failure("google_conference_timeout", true, false)
		}
		return err
	}
	return a.Store.Tx(ctx, func(ctx context.Context) error {
		_, _, _, m, _, accessErr := a.lessonMeetingAccess(ctx, domain.User{ID: organizer, Role: "tutor"}, kind, id)
		if accessErr != nil {
			var f *domain.Fault
			if !errors.As(accessErr, &f) && !errors.Is(accessErr, mongo.ErrNoDocuments) {
				return accessErr
			}
		}
		if accessErr != nil || m == nil || m.JobID != j.ID {
			return a.enqueue(ctx, "google-orphan:"+j.ID, "google_lesson", bson.M{"lessonKind": kind, "lessonId": id, "organizerId": organizer, "operation": "delete", "eventId": event.ID, "etag": event.ETag, "start": j.Payload["start"], "end": j.Payload["end"], "sourceOperation": digest(j.ID)}, "pending")
		}
		if m.Status == "ready" {
			return nil
		}
		m.Status = "ready"
		m.JoinURL = link
		m.ETag = event.ETag
		m.LastError = ""
		update := bson.M{"$set": bson.M{"meeting": m}}
		if kind == "classes" {
			update["$inc"] = bson.M{"version": 1}
		}
		if _, err = a.Store.C(kind).UpdateOne(ctx, bson.M{"_id": id, "meeting.jobId": j.ID}, update); err != nil {
			return err
		}
		return a.audit(ctx, organizer, "lesson.meeting_confirmed", id)
	})
}

func (a *App) finishLessonDeletion(ctx context.Context, kind, id, jobID string) error {
	_, err := a.Store.C(kind).UpdateOne(ctx, bson.M{"_id": id, "meeting.jobId": jobID}, bson.M{"$set": bson.M{"meeting.status": "cancelled", "meeting.lastError": "", "meeting.joinUrl": ""}})
	return err
}

func (a *App) joinLessonMeeting(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "parent", "tutor") || !a.googleAvailable(w, r) {
		return
	}
	kind, id := lessonKind(r), chi.URLParam(r, "id")
	tutor, start, end, m, _, err := a.lessonMeetingAccess(r.Context(), user(r), kind, id)
	if err != nil {
		a.error(w, r, err)
		return
	}
	if a.Now().Before(start.Add(-15*time.Minute)) || a.Now().After(end.Add(15*time.Minute)) {
		a.error(w, r, domain.Fail(409, "join_closed", "The meeting opens 15 minutes before the lesson."))
		return
	}
	if m == nil || m.Provider != "google" || m.Status != "ready" || m.OrganizerID != tutor || !googlecalendar.ValidMeetURL(m.JoinURL) {
		a.error(w, r, domain.Fail(409, "meeting_pending", "The Google Meet lesson is not ready. Ask your tutor to prepare it."))
		return
	}
	access, err := a.googleAccess(r.Context(), tutor)
	if err != nil {
		a.error(w, r, err)
		return
	}
	event, err := a.Google.Get(r.Context(), access, m.ID)
	link := ""
	if err == nil {
		link, err = event.Link()
	}
	eventStart, _ := time.Parse(time.RFC3339, event.Start.DateTime)
	eventEnd, _ := time.Parse(time.RFC3339, event.End.DateTime)
	if err == nil && (!eventStart.Equal(start) || !eventEnd.Equal(end) || link != m.JoinURL || event.Extended.Private["application"] != kind+":"+id) {
		err = googlecalendar.Failure("google_calendar_conflict", true, false)
	}
	if err != nil {
		a.googleRecordError(r.Context(), tutor, err)
		a.error(w, r, err)
		return
	}
	_, newStart, newEnd, current, _, err := a.lessonMeetingAccess(r.Context(), user(r), kind, id)
	if err != nil {
		a.error(w, r, err)
		return
	}
	if current == nil || current.JobID != m.JobID || current.Status != "ready" || !newStart.Equal(start) || !newEnd.Equal(end) {
		a.error(w, r, domain.Fail(409, "meeting_pending", "The lesson changed. Reload before joining."))
		return
	}
	w.Header().Set("Referrer-Policy", "no-referrer")
	a.json(w, 200, map[string]string{"joinUrl": link})
}
