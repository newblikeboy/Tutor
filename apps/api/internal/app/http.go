package app

import (
	"encoding/json"
	"errors"
	"fmt"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"
	"tutorplatform/internal/config"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
)

type App struct {
	Store  *storage.Store
	Config config.Config
	Now    func() time.Time
}

func New(s *storage.Store, c config.Config) *App {
	return &App{s, c, func() time.Time { return time.Now().UTC() }}
}
func (a *App) json(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func (a *App) error(w http.ResponseWriter, r *http.Request, e error) {
	status := 500
	code := "internal"
	message := "Something went wrong. Please retry."
	var f *domain.Fault
	if errors.As(e, &f) {
		status = f.Status
		code = f.Code
		message = f.Message
	} else if errors.Is(e, mongo.ErrNoDocuments) {
		status = 404
		code = "not_found"
		message = "This record is unavailable."
	} else if mongo.IsDuplicateKeyError(e) {
		status = 409
		code = "conflict"
		message = "This action has already been recorded. Refresh to continue."
	} else {
		slog.Error("request failed", "requestId", middleware.GetReqID(r.Context()), "type", fmt.Sprintf("%T", e))
	}
	a.json(w, status, map[string]any{"code": code, "message": message, "fieldErrors": map[string]string{}, "requestId": middleware.GetReqID(r.Context())})
}
func (a *App) decode(w http.ResponseWriter, r *http.Request, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 16*1024)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if e := d.Decode(v); e != nil {
		a.error(w, r, domain.Fail(422, "validation", "Check the submitted fields."))
		return false
	}
	if e := d.Decode(new(any)); e != io.EOF {
		a.error(w, r, domain.Fail(422, "validation", "Submit a single JSON object."))
		return false
	}
	return true
}
func (a *App) Routes() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID, middleware.Recoverer, middleware.Timeout(15*time.Second))
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Cache-Control", "no-store")
			w.Header().Set("X-Content-Type-Options", "nosniff")
			w.Header().Set("X-Request-ID", middleware.GetReqID(r.Context()))
			if r.Method != "GET" && r.Method != "HEAD" && (r.Header.Get("Origin") != a.Config.Origin || !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json")) {
				a.error(w, r, domain.Fail(403, "origin", "This request origin is not allowed."))
				return
			}
			next.ServeHTTP(w, r)
		})
	})
	r.Get("/api/v1/health", func(w http.ResponseWriter, r *http.Request) { a.json(w, 200, map[string]string{"status": "ok"}) })
	r.Get("/api/v1/ready", func(w http.ResponseWriter, r *http.Request) {
		if e := a.Store.Client.Ping(r.Context(), nil); e != nil {
			a.error(w, r, domain.Fail(503, "unavailable", "Database unavailable."))
			return
		}
		a.json(w, 200, map[string]string{"status": "ready"})
	})
	r.Get("/api/v1/config", func(w http.ResponseWriter, r *http.Request) {
		a.json(w, 200, map[string]any{"appName": a.Config.Name, "development": a.Config.Env != "production", "authEnabled": a.Config.AuthProvider == "development", "trialFeePaise": 0, "payments": "disabled", "timezone": "Asia/Kolkata"})
	})
	r.Get("/api/v1/tutors", a.tutors)
	r.Get("/api/v1/tutors/{id}", a.tutor)
	r.Post("/api/v1/auth/challenges", a.challenge)
	r.Get("/api/v1/auth/session", a.sessionState)
	r.Post("/api/v1/auth/verify", a.verify)
	r.Group(func(r chi.Router) {
		r.Use(a.authenticated)
		r.Get("/api/v1/me", a.me)
		r.Post("/api/v1/auth/logout", a.logout)
		r.Get("/api/v1/dashboard", a.dashboard)
		r.Put("/api/v1/application", a.application)
		r.Post("/api/v1/applications/{id}/decision", a.decision)
		r.Post("/api/v1/consents", a.consent)
		r.Post("/api/v1/learners", a.learner)
		r.Get("/api/v1/learners/{id}", a.getLearner)
		r.Put("/api/v1/draft", a.draft)
		r.Post("/api/v1/requirements", a.requirement)
		r.Post("/api/v1/trials", a.requestTrial)
		r.Post("/api/v1/trials/{id}/action", a.trialAction)
	})
	r.NotFound(func(w http.ResponseWriter, r *http.Request) {
		a.error(w, r, domain.Fail(404, "not_found", "Route not found."))
	})
	return r
}
func (a *App) tutors(w http.ResponseWriter, r *http.Request) {
	f := bson.M{"status": "approved", "scope.expiresAt": bson.M{"$gt": a.Now()}}
	if a.Config.Env == "production" {
		f["sample"] = false
	}
	if v := r.URL.Query().Get("subject"); v != "" {
		f["scope.subject"] = v
	}
	if v := r.URL.Query().Get("language"); v != "" {
		f["language"] = v
	}
	items, e := storage.Many[domain.Application](r.Context(), a.Store, "applications", f)
	if e != nil {
		a.error(w, r, e)
		return
	}
	out := []domain.PublicTutor{}
	for _, v := range items {
		out = append(out, v.Public())
	}
	a.json(w, 200, out)
}
func (a *App) tutor(w http.ResponseWriter, r *http.Request) {
	f := bson.M{"_id": chi.URLParam(r, "id"), "status": "approved", "scope.expiresAt": bson.M{"$gt": a.Now()}}
	if a.Config.Env == "production" {
		f["sample"] = false
	}
	v, e := storage.One[domain.Application](r.Context(), a.Store, "applications", f)
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 200, v.Public())
}
