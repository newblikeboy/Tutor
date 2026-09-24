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
	"tutorplatform/internal/media"
	"tutorplatform/internal/meetings"
	"tutorplatform/internal/payments"
	"tutorplatform/internal/storage"
)

type App struct {
	Store         *storage.Store
	Config        config.Config
	Now           func() time.Time
	PasswordSlots chan struct{}
	Payments      payments.Gateway
	Files         media.Store
	Videos        media.Store
	DirectFiles   media.DirectStore
	Meetings      meetings.Gateway
	Scanner       media.Scanner
	FileSlots     chan struct{}
}

func New(s *storage.Store, c config.Config) *App {
	a := &App{Store: s, Config: c, Now: func() time.Time { return time.Now().UTC() }, PasswordSlots: make(chan struct{}, 4)}
	a.FileSlots = make(chan struct{}, 2)
	if c.MeetingProvider == "zoom" {
		provider := meetings.New(c.ZoomAccountID, c.ZoomClientID, c.ZoomSecret, c.ZoomHostID)
		if c.Env == "test" && c.TestZoomURL != "" {
			provider.UseTestEndpoint(c.TestZoomURL)
		}
		a.Meetings = provider
	}
	if c.PaymentProvider == "razorpay" {
		a.Payments = payments.New(c.RazorpayKeyID, c.RazorpaySecret)
	}
	return a
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
	limit := int64(16 * 1024)
	if strings.HasSuffix(r.URL.Path, "/plans") || r.URL.Path == "/api/v1/application" {
		limit = 64 * 1024
	}
	if strings.HasSuffix(r.URL.Path, "/files") {
		limit = 4*1024*1024 + 2048
		if strings.HasPrefix(r.URL.Path, "/api/v1/applications/") {
			limit = 35 * 1024 * 1024
		}
	}
	r.Body = http.MaxBytesReader(w, r.Body, limit)
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
			webhook := r.Method == "POST" && r.URL.Path == "/api/v1/webhooks/razorpay"
			if !webhook && r.Method != "GET" && r.Method != "HEAD" && (r.Header.Get("Origin") != a.Config.Origin || !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json")) {
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
		provider := "disabled"
		if a.Payments != nil {
			provider = "razorpay_sandbox"
		}
		a.json(w, 200, map[string]any{"appName": a.Config.Name, "development": a.Config.Env != "production", "authEnabled": a.Config.AuthProvider == "password", "trialFeePaise": 0, "payments": provider, "timezone": "Asia/Kolkata", "uploadsEnabled": a.Files != nil, "videoUploadsEnabled": a.Videos != nil, "videoProvider": a.Config.VideoProvider, "mediaProvider": a.Config.MediaProvider, "meetingsEnabled": a.Meetings != nil, "scannerConfigured": a.Scanner != nil})
	})
	r.Get("/api/v1/tutors", a.tutors)
	r.Post("/api/v1/webhooks/razorpay", a.razorpayWebhook)
	r.Get("/api/v1/tutors/{id}", a.tutor)
	r.Get("/api/v1/tutors/{id}/availability", a.availability)
	r.Post("/api/v1/auth/signup", a.signup)
	r.Post("/api/v1/auth/login", a.login)
	r.Get("/api/v1/auth/session", a.sessionState)
	r.Group(func(r chi.Router) {
		r.Use(a.authenticated)
		r.Get("/api/v1/me", a.me)
		r.Post("/api/v1/auth/logout", a.logout)
		r.Get("/api/v1/account", a.account)
		r.Put("/api/v1/account", a.saveAccount)
		r.Get("/api/v1/account/sessions", a.accountSessions)
		r.Post("/api/v1/account/sessions/{id}/revoke", a.revokeAccountSession)
		r.Post("/api/v1/account/password", a.changePassword)
		r.Get("/api/v1/dashboard", a.dashboard)
		r.Get("/api/v1/staff/overview", a.staffOverview)
		r.Get("/api/v1/staff/applications", a.staffApplications)
		r.Get("/api/v1/staff/applications/{id}", a.staffApplicationDetail)
		r.Get("/api/v1/staff/members", a.staffMembers)
		r.Get("/api/v1/staff/events", a.staffEvents)
		r.Get("/api/v1/staff/followups", a.staffFollowups)
		r.Post("/api/v1/staff/followups/{id}/resolve", a.resolveTutorFollowup)
		r.Put("/api/v1/application", a.application)
		r.Get("/api/v1/application", a.ownApplication)
		r.Post("/api/v1/applications/{id}/decision", a.decision)
		r.Post("/api/v1/staff/applications/{id}/meeting/retry", a.retryMeeting)
		r.Post("/api/v1/consents", a.consent)
		r.Post("/api/v1/learners", a.learner)
		r.Get("/api/v1/learners/{id}", a.getLearner)
		r.Put("/api/v1/draft", a.draft)
		r.Post("/api/v1/requirements", a.requirement)
		r.Post("/api/v1/trials", a.requestTrial)
		r.Post("/api/v1/trials/{id}/action", a.trialAction)
		r.Get("/api/v1/availability", a.availability)
		r.Put("/api/v1/availability", a.saveAvailability)
		r.Get("/api/v1/enrollments", a.enrollments)
		r.Post("/api/v1/enrollments", a.createEnrollment)
		r.Get("/api/v1/enrollments/{id}", a.tuitionDetail)
		r.Post("/api/v1/enrollments/{id}/action", a.enrollmentAction)
		r.Post("/api/v1/classes/{id}/action", a.classAction)
		r.Post("/api/v1/enrollments/{id}/plans", a.savePlan)
		r.Post("/api/v1/enrollments/{id}/handovers", a.requestHandover)
		r.Get("/api/v1/handovers/invitations", a.handoverInvitations)
		r.Post("/api/v1/handovers/{id}/action", a.handoverAction)
		r.Post("/api/v1/enrollments/{id}/payment", a.createPayment)
		r.Get("/api/v1/billing", a.billing)
		r.Get("/api/v1/billing/{id}", a.billingDetail)
		r.Post("/api/v1/billing/{id}/verify", a.verifyPayment)
		r.Post("/api/v1/billing/{id}/reconcile", a.reconcilePayment)
		r.Post("/api/v1/billing/{id}/refunds", a.requestRefund)
		r.Post("/api/v1/refunds/{id}/action", a.refundAction)
		r.Get("/api/v1/jobs", a.jobs)
		r.Post("/api/v1/jobs/{id}/retry", a.retryJob)
		r.Get("/api/v1/enrollments/{id}/messages", a.messages)
		r.Post("/api/v1/enrollments/{id}/messages", a.sendMessage)
		r.Get("/api/v1/notifications", a.notifications)
		r.Post("/api/v1/notifications/{id}/read", a.readNotification)
		r.Get("/api/v1/cases", a.cases)
		r.Post("/api/v1/cases", a.createCase)
		r.Get("/api/v1/cases/{id}", a.caseDetail)
		r.Post("/api/v1/cases/{id}/action", a.caseAction)
		r.Get("/api/v1/enrollments/{id}/files", a.privateFiles)
		r.Post("/api/v1/enrollments/{id}/files", a.uploadFile)
		r.Get("/api/v1/applications/{id}/files", a.privateFiles)
		r.Post("/api/v1/applications/{id}/files", a.uploadFile)
		r.Post("/api/v1/applications/{id}/files/upload-intent", a.createUploadIntent)
		r.Post("/api/v1/enrollments/{id}/files/upload-intent", a.createUploadIntent)
		r.Post("/api/v1/files/{id}/complete", a.completeDirectUpload)
		r.Get("/api/v1/files/{id}/view", a.viewDirectFile)
		r.Get("/api/v1/files/{id}/download", a.downloadFile)
		r.Get("/api/v1/files/{id}/play", a.downloadFile)
		r.Post("/api/v1/files/{id}/scan", a.retryFileScan)
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
	ids := []string{}
	for _, v := range items {
		ids = append(ids, v.ID)
	}
	paused, e := storage.Many[domain.Availability](r.Context(), a.Store, "availability", bson.M{"_id": bson.M{"$in": ids}, "paused": true})
	if e != nil {
		a.error(w, r, e)
		return
	}
	unavailable := map[string]bool{}
	for _, v := range paused {
		unavailable[v.ID] = true
	}
	for _, v := range items {
		if unavailable[v.ID] {
			continue
		}
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
