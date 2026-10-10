package app

import (
	"context"
	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"net/http"
	"strings"
	"time"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/meetings"
	"tutorplatform/internal/storage"
)

// The configured Zoom host is a finite resource shared with interviews.
func (a *App) reserveZoom(ctx context.Context, id string, start, end time.Time, release bool) error {
	var g guard
	err := a.Store.C("guards").FindOneAndUpdate(ctx, bson.M{"_id": "zoom-host"}, bson.M{"$setOnInsert": bson.M{"intervals": []interval{}}, "$inc": bson.M{"version": 1}}, options.FindOneAndUpdate().SetUpsert(true).SetReturnDocument(options.After)).Decode(&g)
	if err != nil {
		return err
	}
	if !release {
		// Include retained interviews created before host reservations were introduced.
		conflicts, err := a.Store.C("applications").CountDocuments(ctx, bson.M{"_id": bson.M{"$ne": strings.TrimPrefix(id, "application:")}, "interview.provider": "zoom", "interview.start": bson.M{"$lt": end}, "interview.end": bson.M{"$gt": start}, "$or": []bson.M{{"interview.joinUrl": bson.M{"$ne": "", "$exists": true}}, {"interview.syncStatus": "pending"}}})
		if err != nil {
			return err
		}
		if conflicts > 0 {
			return domain.Fail(409, "meeting_conflict", "The configured Zoom host has an interview at this time.")
		}
	}
	rows := []interval{}
	for _, v := range g.Intervals {
		if v.ID == id || !v.End.After(a.Now()) {
			continue
		}
		if !release && start.Before(v.End) && end.After(v.Start) {
			return domain.Fail(409, "meeting_conflict", "The configured Zoom host is already booked at this time.")
		}
		rows = append(rows, v)
	}
	if !release {
		rows = append(rows, interval{ID: id, Start: start, End: end})
	}
	_, err = a.Store.C("guards").UpdateOne(ctx, bson.M{"_id": g.ID}, bson.M{"$set": bson.M{"intervals": rows}})
	return err
}

func (a *App) clearLessonMeeting(ctx context.Context, kind, id string, m **domain.LessonMeeting) error {
	if *m == nil {
		return nil
	}
	if (*m).ID != "" {
		if err := a.enqueue(ctx, "zoom-delete:"+token(), "zoom_meeting", bson.M{"operation": "delete", "meetingId": (*m).ID, "lessonKind": kind, "lessonId": id, "start": a.Now().Format(time.RFC3339), "end": a.Now().Add(time.Minute).Format(time.RFC3339)}, "pending"); err != nil {
			return err
		}
	}
	*m = nil
	return a.reserveZoom(ctx, kind+":"+id, time.Time{}, time.Time{}, true)
}

func (a *App) lessonMeetingAccess(ctx context.Context, u domain.User, kind, id string) (string, time.Time, time.Time, *domain.LessonMeeting, int, error) {
	if kind == "classes" {
		s, err := storage.One[domain.ClassSession](ctx, a.Store, "classes", bson.M{"_id": id})
		if err != nil {
			return "", time.Time{}, time.Time{}, nil, 0, err
		}
		en, err := a.tuitionAccess(ctx, u, s.EnrollmentID)
		if err != nil {
			return "", time.Time{}, time.Time{}, nil, 0, err
		}
		if !enum(u.Role, "parent", "tutor") || en.Status != "active" || s.Status != "scheduled" || en.Agreement.Mode != "online" || s.TutorID != en.TutorID {
			return "", time.Time{}, time.Time{}, nil, 0, domain.Fail(404, "not_found", "This online lesson is unavailable.")
		}
		app, err := storage.One[domain.Application](ctx, a.Store, "applications", bson.M{"_id": en.TutorID})
		if err != nil {
			return "", time.Time{}, time.Time{}, nil, 0, err
		}
		if !domain.EligibleForMode(app, en.Class, "online", a.Now()) || !app.Scope.CoversSubjects(agreementSubjects(en.Agreement)) {
			return "", time.Time{}, time.Time{}, nil, 0, domain.Fail(403, "scope_unavailable", "Teaching access is paused.")
		}
		return s.TutorID, s.Start, s.End, s.Meeting, s.Version, nil
	}
	t, err := storage.One[domain.Trial](ctx, a.Store, "trials", bson.M{"_id": id})
	if err != nil {
		return "", time.Time{}, time.Time{}, nil, 0, err
	}
	if !enum(u.Role, "parent", "tutor") || (t.OwnerID != u.ID && t.TutorID != u.ID) || t.Status != "confirmed" || (t.Mode != "online" && t.Mode != "") {
		return "", time.Time{}, time.Time{}, nil, 0, domain.Fail(404, "not_found", "This online trial is unavailable.")
	}
	app, err := storage.One[domain.Application](ctx, a.Store, "applications", bson.M{"_id": t.TutorID})
	if err != nil {
		return "", time.Time{}, time.Time{}, nil, 0, err
	}
	subjects := t.Subjects
	if len(subjects) == 0 {
		subjects = []string{t.Subject}
	}
	if !domain.EligibleForMode(app, t.Class, "online", a.Now()) || !app.Scope.CoversSubjects(subjects) {
		return "", time.Time{}, time.Time{}, nil, 0, domain.Fail(403, "scope_unavailable", "Teaching access is paused.")
	}
	return t.TutorID, t.Start, t.End, t.Meeting, 0, nil
}

func lessonKind(r *http.Request) string {
	if chi.URLParam(r, "kind") == "trials" {
		return "trials"
	}
	return "classes"
}

func (a *App) prepareLessonMeeting(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "tutor") {
		return
	}
	if a.Meetings == nil {
		a.error(w, r, domain.Fail(503, "meeting_unconfigured", "Zoom is not configured."))
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
		if m != nil {
			if m.Status != "failed" {
				return nil
			}
			result, err := a.Store.C("outbox").UpdateOne(ctx, bson.M{"_id": m.JobID, "status": "failed"}, bson.M{"$set": bson.M{"status": "pending", "attempts": 0, "availableAt": a.Now(), "lastError": ""}})
			if err != nil {
				return err
			}
			if result.ModifiedCount != 1 {
				return domain.Fail(409, "meeting_pending", "A retry is already in progress.")
			}
			m.Status = "pending"
		} else {
			if err = a.reserveZoom(ctx, kind+":"+id, start, end, false); err != nil {
				return err
			}
			host, err := storage.One[domain.User](ctx, a.Store, "users", bson.M{"_id": tutor})
			if err != nil {
				return err
			}
			if host.Email == "" {
				return domain.Fail(409, "meeting_host_unavailable", "The tutor needs a configured Zoom account for this login email.")
			}
			jobID := "zoom:" + token()
			m = &domain.LessonMeeting{Status: "pending", JobID: jobID}
			if err = a.enqueue(ctx, jobID, "zoom_meeting", bson.M{"lessonKind": kind, "lessonId": id, "operation": "create", "start": start.Format(time.RFC3339), "end": end.Format(time.RFC3339), "topic": "GoCoaching lesson " + jobID[5:], "tutorEmail": host.Email}, "pending"); err != nil {
				return err
			}
		}
		update := bson.M{"$set": bson.M{"meeting": m}}
		if kind == "classes" {
			update["$inc"] = bson.M{"version": 1}
		}
		if _, err = a.Store.C(kind).UpdateOne(ctx, bson.M{"_id": id}, update); err != nil {
			return err
		}
		return a.audit(ctx, user(r).ID, "lesson.meeting_prepare", id)
	})
	if err != nil {
		a.error(w, r, err)
		return
	}
	a.json(w, 200, map[string]bool{"ok": true})
}

func (a *App) joinLessonMeeting(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "parent", "tutor") {
		return
	}
	var link string
	err := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		_, start, end, m, _, err := a.lessonMeetingAccess(ctx, user(r), lessonKind(r), chi.URLParam(r, "id"))
		if err != nil {
			return err
		}
		if a.Now().Before(start.Add(-15*time.Minute)) || a.Now().After(end.Add(15*time.Minute)) {
			return domain.Fail(409, "join_closed", "The meeting opens 15 minutes before the lesson.")
		}
		if m == nil || m.Status != "ready" || !meetings.ValidJoinURL(m.JoinURL) {
			return domain.Fail(409, "meeting_pending", "The Zoom meeting is not ready. Ask your tutor to prepare it.")
		}
		link = m.JoinURL
		return nil
	})
	if err != nil {
		a.error(w, r, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	a.json(w, 200, map[string]string{"joinUrl": link})
}

func (a *App) finishLessonMeeting(ctx context.Context, j job, meeting meetings.Meeting) error {
	kind, id := j.Payload["lessonKind"], j.Payload["lessonId"]
	if !enum(kind, "classes", "trials") {
		return domain.Fail(422, "validation", "Invalid lesson kind.")
	}
	if j.Payload["operation"] == "delete" {
		return nil
	}
	stale := false
	err := a.Store.Tx(ctx, func(ctx context.Context) error {
		result, err := a.Store.C(kind).UpdateOne(ctx, bson.M{"_id": id, "meeting.jobId": j.ID, "meeting.status": bson.M{"$in": []string{"pending", "ready"}}}, bson.M{"$set": bson.M{"meeting.status": "ready", "meeting.id": meeting.ID, "meeting.joinUrl": meeting.JoinURL}})
		if err != nil {
			return err
		}
		stale = result.MatchedCount == 0
		if stale {
			return a.enqueue(ctx, "zoom-orphan:"+j.ID, "zoom_meeting", bson.M{"operation": "delete", "lessonKind": kind, "lessonId": id, "meetingId": meeting.ID, "start": a.Now().Format(time.RFC3339), "end": a.Now().Add(time.Minute).Format(time.RFC3339)}, "pending")
		}
		return nil
	})
	return err
}
