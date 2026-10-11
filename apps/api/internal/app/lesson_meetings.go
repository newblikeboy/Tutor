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
