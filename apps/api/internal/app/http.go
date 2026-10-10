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
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"
	"tutorplatform/internal/config"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/mailer"
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
	Mail          mailer.Sender
	EmailCodeWake chan struct{}
	Scanner       media.Scanner
	FileSlots     chan struct{}
}

func New(s *storage.Store, c config.Config) *App {
	a := &App{Store: s, Config: c, Now: func() time.Time { return time.Now().UTC() }, PasswordSlots: make(chan struct{}, 4), EmailCodeWake: make(chan struct{}, 1)}
	a.FileSlots = make(chan struct{}, 2)
	if c.MailProvider == "smtp" {
		a.Mail = &mailer.SMTP{Host: c.SMTPHost, Port: c.SMTPPort, Security: c.SMTPSecurity, User: c.SMTPUser, Password: c.SMTPPassword, From: c.SMTPFrom}
	}
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
	if r.URL.Path == "/api/v1/inbox" {
		limit = 24 * 1024
	}
	if strings.HasSuffix(r.URL.Path, "/plans") || r.URL.Path == "/api/v1/application" {
		limit = 64 * 1024
	}
	if strings.HasPrefix(r.URL.Path, "/api/v1/classes/") && strings.HasSuffix(r.URL.Path, "/action") {
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
		if a.Config.PaymentProvider == "simulation" {
			provider = "simulation"
		} else if a.Payments != nil {
			provider = "razorpay_sandbox"
		}
		a.json(w, 200, map[string]any{"appName": a.Config.Name, "development": a.Config.Env != "production", "authEnabled": a.Config.AuthProvider == "password", "emailEnabled": a.Mail != nil, "trialFeePaise": 0, "payments": provider, "timezone": "Asia/Kolkata", "uploadsEnabled": a.Files != nil, "videoUploadsEnabled": a.Videos != nil, "videoProvider": a.Config.VideoProvider, "mediaProvider": a.Config.MediaProvider, "meetingsEnabled": a.Meetings != nil, "scannerConfigured": a.Scanner != nil})
	})
	r.Get("/api/v1/tutors", a.tutors)
	r.Post("/api/v1/webhooks/razorpay", a.razorpayWebhook)
	r.Get("/api/v1/tutors/{id}", a.tutor)
	r.Get("/api/v1/tutors/{id}/photo", a.tutorPhoto)
	r.Get("/api/v1/tutors/{id}/intro-video", a.tutorIntroVideo)
	r.Get("/api/v1/tutors/{id}/availability", a.availability)
	r.Get("/api/v1/location/reverse", a.reverseLocation)
	r.Post("/api/v1/auth/signup", a.signup)
	r.Post("/api/v1/auth/login", a.login)
	r.Post("/api/v1/auth/email/request", a.requestEmailCode)
	r.Post("/api/v1/auth/email/confirm", a.confirmEmailCode)
	r.Get("/api/v1/auth/session", a.sessionState)
	r.Group(func(r chi.Router) {
		r.Use(a.authenticated)
		r.Get("/api/v1/me", a.me)
		r.Post("/api/v1/auth/logout", a.logout)
		r.Get("/api/v1/account", a.account)
		r.Post("/api/v1/account/email/request", a.requestVerification)
		r.Post("/api/v1/account/email/confirm", a.confirmVerification)
		r.Get("/api/v1/account/email/preferences", a.emailPreferences)
		r.Put("/api/v1/account/email/preferences", a.saveEmailPreferences)
		r.Put("/api/v1/account", a.saveAccount)
		r.Get("/api/v1/account/sessions", a.accountSessions)
		r.Post("/api/v1/account/sessions/{id}/revoke", a.revokeAccountSession)
		r.Post("/api/v1/account/password", a.changePassword)
		r.Get("/api/v1/dashboard", a.dashboard)
		r.Get("/api/v1/staff/overview", a.staffOverview)
		r.Get("/api/v1/staff/applications", a.staffApplications)
		r.Get("/api/v1/staff/applications/{id}", a.staffApplicationDetail)
		r.Get("/api/v1/staff/members", a.staffMembers)
		r.Post("/api/v1/staff/members", a.createStaffMember)
		r.Post("/api/v1/staff/members/{id}/action", a.staffMemberAction)
		r.Get("/api/v1/staff/events", a.staffEvents)
		r.Get("/api/v1/staff/followups", a.staffFollowups)
		r.Post("/api/v1/staff/followups/{id}/resolve", a.resolveTutorFollowup)
		r.Get("/api/v1/staff/academic", a.mentorAcademicReport)
		r.Get("/api/v1/admin/founder", a.founderReport)
		r.Get("/api/v1/admin/email-deliveries", a.emailDeliveries)
		r.Post("/api/v1/admin/email-deliveries/{id}/retry", a.retryEmail)
		r.Get("/api/v1/admin/families", a.adminFamilies)
		r.Put("/api/v1/application", a.application)
		r.Get("/api/v1/application", a.ownApplication)
		r.Post("/api/v1/applications/{id}/decision", a.decision)
		r.Post("/api/v1/staff/applications/{id}/meeting/retry", a.retryMeeting)
		r.Post("/api/v1/consents", a.consent)
		r.Post("/api/v1/learners", a.learner)
		r.Get("/api/v1/learners/{id}", a.getLearner)
		r.Get("/api/v1/learners/{id}/progress", a.learnerProgress)
		r.Get("/api/v1/tutor/workspace", a.tutorWorkspace)
		r.Get("/api/v1/tutor/learners/{id}/progress", a.tutorLearnerProgress)
		r.Put("/api/v1/learners/{id}", a.updateLearner)
		r.Get("/api/v1/learner-draft", a.getLearnerDraft)
		r.Put("/api/v1/learner-draft", a.saveLearnerDraft)
		r.Delete("/api/v1/learner-draft", a.deleteLearnerDraft)
		r.Put("/api/v1/draft", a.draft)
		r.Post("/api/v1/requirements", a.requirement)
		r.Delete("/api/v1/requirements/{id}", a.deleteRequirement)
		r.Post("/api/v1/trials", a.requestTrial)
		r.Post("/api/v1/trials/{id}/action", a.trialAction)
		r.Get("/api/v1/availability", a.availability)
		r.Put("/api/v1/availability", a.saveAvailability)
		r.Get("/api/v1/enrollments", a.enrollments)
		r.Post("/api/v1/enrollments", a.createEnrollment)
		r.Get("/api/v1/enrollments/{id}", a.tuitionDetail)
		r.Post("/api/v1/enrollments/{id}/action", a.enrollmentAction)
		r.Post("/api/v1/classes/{id}/action", a.classAction)
		r.Post("/api/v1/{kind:classes|trials}/{id}/meeting", a.prepareLessonMeeting)
		r.Get("/api/v1/{kind:classes|trials}/{id}/meeting/join", a.joinLessonMeeting)
		r.Post("/api/v1/enrollments/{id}/plans", a.savePlan)
		r.Post("/api/v1/enrollments/{id}/handovers", a.requestHandover)
		r.Get("/api/v1/handovers/invitations", a.handoverInvitations)
		r.Post("/api/v1/handovers/{id}/action", a.handoverAction)
		r.Post("/api/v1/enrollments/{id}/payment", a.createPayment)
		r.Post("/api/v1/billing/{id}/simulate", a.simulatePayment)
		r.Get("/api/v1/billing", a.billing)
		r.Get("/api/v1/finance/business", a.businessSettings)
		r.Put("/api/v1/finance/business", a.saveBusinessSettings)
		r.Get("/api/v1/finance/bookings", a.financeBookings)
		r.Post("/api/v1/finance/bookings/{id}/tax", a.reviewBookingTax)
		r.Post("/api/v1/finance/bookings/{id}/reconcile", a.reconcileFinance)
		r.Get("/api/v1/finance/earnings", a.earnings)
		r.Get("/api/v1/finance/holds", a.earningHolds)
		r.Post("/api/v1/finance/classes/{id}/tax", a.reviewReplacementTax)
		r.Get("/api/v1/finance/summary", a.financeSummary)
		r.Get("/api/v1/finance/payouts", a.payouts)
		r.Post("/api/v1/finance/payouts", a.createPayout)
		r.Post("/api/v1/finance/payouts/{id}/action", a.payoutAction)
		r.Get("/api/v1/billing/{id}", a.billingDetail)
		r.Post("/api/v1/billing/{id}/invoice", a.recordInvoice)
		r.Post("/api/v1/billing/{id}/verify", a.verifyPayment)
		r.Post("/api/v1/billing/{id}/reconcile", a.reconcilePayment)
		r.Post("/api/v1/billing/{id}/refunds", a.requestRefund)
		r.Post("/api/v1/refunds/{id}/action", a.refundAction)
		r.Get("/api/v1/jobs", a.jobs)
		r.Post("/api/v1/jobs/{id}/retry", a.retryJob)
		r.Get("/api/v1/enrollments/{id}/messages", a.messages)
		r.Post("/api/v1/enrollments/{id}/messages", a.sendMessage)
		r.Get("/api/v1/notifications", a.notifications)
		r.Get("/api/v1/inbox/status", a.inboxStatus)
		r.Get("/api/v1/inbox/recipients", a.inboxRecipients)
		r.Get("/api/v1/inbox", a.inboxList)
		r.Post("/api/v1/inbox", a.inboxSend)
		r.Get("/api/v1/inbox/{id}", a.inboxDetail)
		r.Post("/api/v1/inbox/{id}/read", a.inboxRead)
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
		r.Delete("/api/v1/files/{id}", a.deletePrivateFile)
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
	if subjects := r.URL.Query()["subject"]; len(subjects) > 0 {
		if len(subjects) > 20 {
			a.error(w, r, domain.Fail(422, "validation", "Choose up to 20 subjects."))
			return
		}
		for _, subject := range subjects {
			if !validText(subject, 1, 80) {
				a.error(w, r, domain.Fail(422, "validation", "Choose a valid subject."))
				return
			}
		}
		f["$and"] = []bson.M{{"$or": []bson.M{{"scope.subject": bson.M{"$in": subjects}}, {"scope.subjects": bson.M{"$in": subjects}}}}}
	}
	if v := r.URL.Query().Get("language"); v != "" {
		f["language"] = v
	}
	if v := r.URL.Query().Get("mode"); enum(v, "home", "online") {
		f["$or"] = []bson.M{{"scope.mode": v}, {"scope.modes": v}}
	}
	if v := r.URL.Query().Get("class"); v != "" {
		klass, er := strconv.Atoi(v)
		if er != nil || klass < 1 || klass > 12 {
			a.error(w, r, domain.Fail(422, "validation", "Choose a valid class."))
			return
		}
		f["scope.minClass"] = bson.M{"$lte": klass}
		f["scope.maxClass"] = bson.M{"$gte": klass}
	}
	queryLat, hasLat := optionalCoordinate(r, "latitude", -90, 90)
	queryLng, hasLng := optionalCoordinate(r, "longitude", -180, 180)
	if hasLat != hasLng || !hasLat && (r.URL.Query().Get("latitude") != "" || r.URL.Query().Get("longitude") != "") {
		a.error(w, r, domain.Fail(422, "validation", "Choose a complete location."))
		return
	}
	searchRadiusKM := 0.0
	if raw := strings.TrimSpace(r.URL.Query().Get("radiusKm")); raw != "" {
		v, er := strconv.ParseFloat(raw, 64)
		if er != nil || math.IsNaN(v) || math.IsInf(v, 0) || v < 1 || v > 100 {
			a.error(w, r, domain.Fail(422, "validation", "Choose a valid search radius."))
			return
		}
		searchRadiusKM = v
	}
	items, next, e := a.tutorPage(r.Context(), f, r.URL.Query().Get("cursor"), hasLat, queryLat, queryLng, searchRadiusKM)
	if e != nil {
		a.error(w, r, e)
		return
	}
	w.Header().Set("X-Next-Cursor", next)
	a.json(w, 200, items)
}

func optionalCoordinate(r *http.Request, key string, min, max float64) (float64, bool) {
	raw := strings.TrimSpace(r.URL.Query().Get(key))
	if raw == "" {
		return 0, false
	}
	value, err := strconv.ParseFloat(raw, 64)
	if err != nil || math.IsNaN(value) || math.IsInf(value, 0) || value < min || value > max {
		return 0, false
	}
	return value, true
}

func tutorBaseLocation(v domain.Application) (domain.LocationPoint, bool) {
	if v.Profile == nil || v.Profile.About.Location == nil {
		return domain.LocationPoint{}, false
	}
	location := *v.Profile.About.Location
	if location.Latitude < -90 || location.Latitude > 90 || location.Longitude < -180 || location.Longitude > 180 || location.Latitude == 0 && location.Longitude == 0 {
		return domain.LocationPoint{}, false
	}
	return location, true
}

func haversineKM(lat1, lon1, lat2, lon2 float64) float64 {
	const earthRadiusKM = 6371.0088
	toRadians := func(value float64) float64 { return value * math.Pi / 180 }
	dLat := toRadians(lat2 - lat1)
	dLon := toRadians(lon2 - lon1)
	rLat1 := toRadians(lat1)
	rLat2 := toRadians(lat2)
	a := math.Sin(dLat/2)*math.Sin(dLat/2) + math.Cos(rLat1)*math.Cos(rLat2)*math.Sin(dLon/2)*math.Sin(dLon/2)
	return earthRadiusKM * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
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
