package app

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"go.mongodb.org/mongo-driver/v2/bson"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"
	"time"
	"tutorplatform/internal/config"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/googlecalendar"
	"tutorplatform/internal/storage"
)

func TestMongoGoogleInterviewLifecycle(t *testing.T) {
	uri := os.Getenv("TEST_MONGODB_URI")
	if uri == "" {
		t.Skip("TEST_MONGODB_URI required")
	}
	t.Setenv("SEED_PASSWORD", testPassword)
	ctx := context.Background()
	name := "tutor_test_google_" + token()[:12]
	s, e := storage.Connect(ctx, uri, name)
	if e != nil {
		t.Fatal(e)
	}
	defer s.Client.Disconnect(ctx)
	for i := 0; i < 2; i++ {
		if e = s.Migrate(ctx); e != nil {
			t.Fatal(e)
		}
	}
	if e = s.Seed(ctx, "test"); e != nil {
		t.Fatal(e)
	}
	t.Log("Retained isolated Google test database", name)
	now := time.Now().UTC().Truncate(time.Second)
	a := New(s, config.Config{Env: "test", AuthProvider: "password", Origin: "http://test.local"})
	a.Now = func() time.Time { return now }
	a.Google, e = googlecalendar.New("fixture-client", "fixture-secret", "https://example.test/api/integrations/google/callback", base64.StdEncoding.EncodeToString(make([]byte, 32)))
	if e != nil {
		t.Fatal(e)
	}
	var mu sync.Mutex
	events := map[string]googlecalendar.Event{}
	posts, patches, deletes, refreshes, revokes := 0, 0, 0, 0, 0
	pending, revoked, failCreate := false, false, false
	scope := googlecalendar.EventsScope + " " + googlecalendar.EmailScope
	fixture := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/token" {
			_ = r.ParseForm()
			if revoked {
				w.WriteHeader(400)
				_, _ = w.Write([]byte(`{"error":"invalid_grant"}`))
				return
			}
			if r.Form.Get("grant_type") == "refresh_token" {
				refreshes++
			}
			if r.Form.Get("grant_type") == "authorization_code" && r.Form.Get("code_verifier") == "" {
				t.Error("PKCE missing")
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"access_token": "fictional-access", "refresh_token": "fictional-refresh", "token_type": "Bearer", "expires_in": 3600, "scope": scope})
			return
		}
		if r.URL.Path == "/userinfo" {
			_ = json.NewEncoder(w).Encode(map[string]any{"email": "fictional-mentor@example.test", "verified_email": true})
			return
		}
		if r.URL.Path == "/revoke" {
			revokes++
			_, _ = w.Write([]byte(`{}`))
			return
		}
		if r.Header.Get("Authorization") != "Bearer fictional-access" {
			t.Error("wrong token")
		}
		root := "/calendars/primary/events"
		if r.URL.Path == root && r.Method == "GET" {
			_, _ = w.Write([]byte(`{"kind":"calendar#events","items":[]}`))
			return
		}
		if r.URL.Path == root && r.Method == "POST" {
			if failCreate {
				w.WriteHeader(503)
				_, _ = w.Write([]byte(`{"error":"unavailable"}`))
				return
			}
			var event googlecalendar.Event
			_ = json.NewDecoder(r.Body).Decode(&event)
			posts++
			event.ETag = "original"
			event.Status = "confirmed"
			if pending {
				event.Conference.CreateRequest.Status.Code = "pending"
			} else {
				event.Conference.CreateRequest.Status.Code = "success"
				event.HangoutLink = "https://meet.google.com/abc-defg-hij"
			}
			events[event.ID] = event
			_ = json.NewEncoder(w).Encode(event)
			return
		}
		id := strings.TrimPrefix(r.URL.Path, root+"/")
		event, ok := events[id]
		if !ok {
			w.WriteHeader(404)
			_, _ = w.Write([]byte(`{"error":"not_found"}`))
			return
		}
		if r.Method == "PATCH" {
			if r.Header.Get("If-Match") != event.ETag {
				w.WriteHeader(412)
				return
			}
			patches++
			var input googlecalendar.Event
			_ = json.NewDecoder(r.Body).Decode(&input)
			event.Start = input.Start
			event.End = input.End
			event.Extended = input.Extended
			event.ETag = "updated"
			events[id] = event
		}
		if r.Method == "DELETE" {
			deletes++
			delete(events, id)
			w.WriteHeader(204)
			return
		}
		_ = json.NewEncoder(w).Encode(event)
	}))
	defer fixture.Close()
	a.Google.Base = fixture.URL
	a.Google.TokenURL = fixture.URL + "/token"
	a.Google.UserURL = fixture.URL + "/userinfo"
	a.Google.RevokeURL = fixture.URL + "/revoke"
	server := httptest.NewServer(a.Routes())
	defer server.Close()
	client := func(id string) *testClient {
		jar, _ := cookiejar.New(nil)
		c := &testClient{t: t, http: &http.Client{Jar: jar, Timeout: 30 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}, base: server.URL}
		c.login(id)
		return c
	}
	mentor, admin, tutor, parent, unrelated := client("mentor-a"), client("admin-a"), client("tutor-a"), client("parent-a"), client("tutor-meera")
	if _, e = s.C("users").InsertOne(ctx, domain.User{ID: "mentor-b", Name: "Fictional other mentor", Email: "mentor-b@example.test", Role: "mentor", Sample: true}); e != nil {
		t.Fatal(e)
	}
	credentialFixture, e := storage.One[credential](ctx, s, "credentials", bson.M{"userId": "mentor-a"})
	if e != nil {
		t.Fatal(e)
	}
	credentialFixture.Email = "mentor-b@example.test"
	credentialFixture.UserID = "mentor-b"
	if _, e = s.C("credentials").InsertOne(ctx, credentialFixture); e != nil {
		t.Fatal(e)
	}
	otherMentor := client("mentor-b")
	callback := func(c *testClient, state, code string) string {
		req, _ := http.NewRequest("GET", server.URL+"/api/integrations/google/callback?state="+url.QueryEscape(state)+"&code="+url.QueryEscape(code), nil)
		res, e := c.http.Do(req)
		if e != nil {
			t.Fatal(e)
		}
		defer res.Body.Close()
		if res.StatusCode != 303 {
			t.Fatalf("callback status %d", res.StatusCode)
		}
		return res.Header.Get("Location")
	}
	connect := func() string {
		v := mentor.ok("POST", "/integrations/google/connect", map[string]any{}, 200)
		u, _ := url.Parse(v["url"].(string))
		return u.Query().Get("state")
	}
	current := func() domain.Application {
		v, e := storage.One[domain.Application](ctx, s, "applications", bson.M{"_id": "tutor-a"})
		if e != nil {
			t.Fatal(e)
		}
		return v
	}
	currentJob := func() job {
		v := current()
		j, e := storage.One[job](ctx, s, "outbox", bson.M{"_id": v.Interview.JobID})
		if e != nil {
			t.Fatal(e)
		}
		return j
	}
	run := func() {
		if _, e := a.runOneJobMatching(ctx, bson.M{"kind": "google_interview"}); e != nil {
			t.Fatal(e)
		}
	}
	t.Run("OAuth role session state replay scope and encrypted persistence", func(t *testing.T) {
		for _, c := range []*testClient{admin, parent, tutor} {
			c.ok("POST", "/integrations/google/connect", map[string]any{}, 403)
		}
		csrf := mentor.csrf
		mentor.csrf = ""
		mentor.ok("POST", "/integrations/google/connect", map[string]any{}, 403)
		mentor.csrf = csrf
	})
	// Remaining checks run sequentially against one real transaction-backed workflow.
	state := connect()
	if !strings.Contains(callback(mentor, "wrong-state", "fixture"), "invalid_state") {
		t.Fatal("invalid state accepted")
	}
	other := client("mentor-a")
	if !strings.Contains(callback(other, state, "fixture"), "invalid_state") {
		t.Fatal("another session accepted OAuth callback")
	}
	if !strings.Contains(callback(otherMentor, state, "fixture"), "invalid_state") {
		t.Fatal("another mentor accepted OAuth callback")
	}
	if !strings.Contains(callback(mentor, state, "fixture"), "connected") {
		t.Fatal("valid connection failed")
	}
	if !strings.Contains(callback(mentor, state, "fixture"), "invalid_state") {
		t.Fatal("callback replay accepted")
	}
	c, e := storage.One[googleConnection](ctx, s, "google_connections", bson.M{"_id": "mentor-a"})
	if e != nil || c.Access == "fictional-access" || c.Refresh == "fictional-refresh" {
		t.Fatal("unencrypted authorization persisted")
	}
	status := mentor.ok("GET", "/integrations/google", nil, 200)
	raw, _ := json.Marshal(status)
	if status["status"] != "connected" || strings.Contains(string(raw), "fictional-access") || strings.Contains(string(raw), "fictional-refresh") {
		t.Fatal("status leaked tokens or incorrect health")
	}
	mu.Lock()
	scope = googlecalendar.EventsScope
	mu.Unlock()
	now = now.Add(time.Minute)
	state = connect()
	if !strings.Contains(callback(mentor, state, "fixture"), "consent_required") {
		t.Fatal("missing consent accepted")
	}
	mu.Lock()
	scope = googlecalendar.EventsScope + " " + googlecalendar.EmailScope
	mu.Unlock()
	profile := completeApplication("Fictional Google applicant", now)
	installApplicationEvidence(t, s, "tutor-a", &profile)
	for i := range profile.TeachingAreas {
		profile.TeachingAreas[i].Modes = []string{"online"}
	}
	tutor.ok("PUT", "/application", map[string]any{"version": 0, "step": 5, "profile": profile, "submit": true}, 200)
	start := now.Add(time.Hour)
	schedule := map[string]any{"action": "schedule", "interview": domain.Interview{Start: start, End: start.Add(30 * time.Minute), Timezone: "Asia/Kolkata", Notes: "Discuss the sample teaching approach."}}
	admin.decide("tutor-a", schedule, 403)
	tutor.ok("POST", "/applications/tutor-a/decision", map[string]any{"action": "schedule", "version": current().Version}, 403)
	schedule["version"] = current().Version
	results := make(chan int, 2)
	for i := 0; i < 2; i++ {
		go func() {
			status, _, _ := mentor.call("POST", "/applications/tutor-a/decision", schedule, nil)
			results <- status
		}()
	}
	first, second := <-results, <-results
	if !(first == 200 && second == 409 || first == 409 && second == 200) {
		t.Fatalf("duplicate scheduling returned %d and %d", first, second)
	}
	initial := current()
	if initial.Interview.SyncStatus != "pending" || initial.Interview.JoinURL != "" {
		t.Fatal("unconfirmed link exposed")
	}
	otherMentor.ok("POST", "/applications/tutor-a/decision", map[string]any{"action": "reschedule", "version": initial.Version, "interview": schedule["interview"], "reason": "An unrelated mentor must be rejected."}, 403)
	otherMentor.ok("GET", "/staff/applications/tutor-a", nil, 404)
	if _, e = s.C("users").InsertOne(ctx, domain.User{ID: "calendar-conflict-applicant", Name: "Fictional conflict applicant", Role: "tutor", Email: "conflict@example.test", Sample: true}); e != nil {
		t.Fatal(e)
	}
	if _, e = s.C("applications").InsertOne(ctx, domain.Application{ID: "calendar-conflict-applicant", Name: "Fictional conflict applicant", AssessorID: "mentor-b", Status: "submitted", Sample: true}); e != nil {
		t.Fatal(e)
	}
	otherAccess, _ := a.Google.Encrypt("fictional-access", "mentor-b:access")
	otherRefresh, _ := a.Google.Encrypt("fictional-refresh", "mentor-b:refresh")
	if _, e = s.C("google_connections").InsertOne(ctx, googleConnection{ID: "mentor-b", Email: "fictional-mentor@example.test", Generation: token(), Status: "connected", Access: otherAccess, Refresh: otherRefresh, ExpiresAt: now.Add(time.Hour)}); e != nil {
		t.Fatal(e)
	}
	otherMentor.ok("POST", "/applications/calendar-conflict-applicant/decision", map[string]any{"action": "schedule", "version": 0, "interview": schedule["interview"]}, 409)
	mentor.ok("POST", "/applications/tutor-a/decision", map[string]any{"action": "schedule", "version": initial.Version - 1, "interview": schedule["interview"]}, 409)
	mentor.ok("POST", "/integrations/google/disconnect", map[string]any{}, 409)
	mu.Lock()
	pending = true
	mu.Unlock()
	run()
	if current().Interview.SyncStatus != "pending" {
		t.Fatal("pending conference reported ready")
	}
	mu.Lock()
	for id, event := range events {
		event.Conference.CreateRequest.Status.Code = "success"
		event.HangoutLink = "https://meet.google.com/abc-defg-hij"
		events[id] = event
	}
	pending = false
	mu.Unlock()
	now = now.Add(5 * time.Second)

	// Simulate MongoDB rejecting the finish transaction after Google has created the event.
	if e = s.DB.RunCommand(ctx, bson.D{{Key: "collMod", Value: "applications"}, {Key: "validator", Value: bson.M{"workerFailureFixture": bson.M{"$exists": true}}}}).Err(); e != nil {
		t.Fatal(e)
	}
	if e = a.processGoogleInterview(ctx, currentJob()); e == nil {
		t.Fatal("database failure masked")
	}
	if e = s.MigrateStaff(ctx); e != nil {
		t.Fatal(e)
	}
	run()
	confirmed := current()
	if confirmed.Interview.SyncStatus != "ready" || confirmed.Interview.JoinURL != "https://meet.google.com/abc-defg-hij" || confirmed.Interview.MeetingCode != "abc-defg-hij" {
		t.Fatal("provider-confirmed meeting not saved")
	}
	if e = a.processGoogleInterview(ctx, currentJob()); e != nil {
		t.Fatal(e)
	}
	mu.Lock()
	if posts != 1 {
		t.Fatal("duplicate Calendar event")
	}
	mu.Unlock()
	own := tutor.ok("GET", "/application", nil, 200)
	join, e := tutor.http.Get(server.URL + "/api/v1/applications/tutor-a/interview/join")
	if e != nil {
		t.Fatal(e)
	}
	join.Body.Close()
	if join.StatusCode != 303 || join.Header.Get("Location") != "https://meet.google.com/abc-defg-hij" {
		t.Fatal("authorized join did not verify Google")
	}
	unrelated.ok("GET", "/applications/tutor-a/interview/join", nil, 404)
	if own["application"].(map[string]any)["interview"].(map[string]any)["joinUrl"] == "" {
		t.Fatal("own meeting unavailable")
	}
	unrelated.ok("GET", "/staff/applications/tutor-a", nil, 403)
	parent.ok("GET", "/application", nil, 403)
	assessment := map[string]any{"action": "interview_assessment", "assessment": map[string]any{"scores": []int{4, 5, 4, 4}, "recommendation": "approve", "comments": "Fictional observed teaching feedback.", "conducted": true}}
	mentor.decide("tutor-a", assessment, 409)
	mu.Lock()
	event := events[confirmed.Interview.MeetingID]
	event.ETag = "manual-change"
	events[event.ID] = event
	mu.Unlock()
	rescheduled := start.Add(time.Hour)
	mentor.decide("tutor-a", map[string]any{"action": "reschedule", "reason": "Participant requested a later interview.", "interview": domain.Interview{Start: rescheduled, End: rescheduled.Add(30 * time.Minute), Timezone: "Asia/Kolkata"}}, 200)
	run()
	if current().Interview.SyncStatus != "failed" || current().Interview.LastError != "google_calendar_conflict" {
		t.Fatal("manual Calendar change overwritten")
	}
	review := mentor.ok("GET", "/staff/applications/tutor-a/meeting/calendar", nil, 200)
	mentor.ok("POST", "/staff/applications/tutor-a/meeting/retry", map[string]any{"version": current().Version, "calendarETag": review["etag"]}, 200)
	run()
	if current().Interview.SyncStatus != "ready" || current().Interview.MeetingID != confirmed.Interview.MeetingID {
		t.Fatal("reschedule lost event linkage")
	}
	mu.Lock()
	if patches != 1 {
		t.Fatal("reschedule duplicate")
	}
	mu.Unlock()
	now = rescheduled.Add(31 * time.Minute)
	mentor.decide("tutor-a", map[string]any{"action": "approve", "subjects": []string{"Mathematics"}, "modes": []string{"online"}, "minClass": 6, "maxClass": 10}, 409)
	if current().Interview.Status != "scheduled" {
		t.Fatal("elapsed time assumed attendance")
	}
	admin.decide("tutor-a", assessment, 403)
	otherMentor.ok("POST", "/applications/tutor-a/decision", map[string]any{"action": "interview_assessment", "version": current().Version, "assessment": assessment["assessment"]}, 403)
	mentor.decide("tutor-a", map[string]any{"action": "interview_assessment", "assessment": map[string]any{"scores": []int{6, 4, 4, 4}, "conducted": true, "recommendation": "approve", "comments": "Invalid rating must be rejected."}}, 422)
	mentor.decide("tutor-a", assessment, 200)
	if current().Status != "assessed" || current().Interview.Status != "completed" {
		t.Fatal("assessment not persisted")
	}
	mentor.decide("tutor-a", assessment, 409)
	mentor.decide("tutor-a", map[string]any{"action": "fees", "feePlans": []domain.FeePlan{{Mode: "online", Period: "hour", Classes: 1, Minutes: 60, AmountPaise: 10000}}}, 200)
	mentor.decide("tutor-a", map[string]any{"action": "approve", "subjects": []string{"Mathematics"}, "modes": []string{"online"}, "minClass": 6, "maxClass": 10}, 200)
	if current().Status != "approved" {
		t.Fatal("assessment did not feed approval")
	}
	// A reopened/another submitted request exercises cancellation and durable revocation independently.
	if _, e = s.C("applications").UpdateOne(ctx, bson.M{"_id": "tutor-a"}, bson.M{"$set": bson.M{"status": "under_review"}}); e != nil {
		t.Fatal(e)
	}
	now = now.Add(time.Hour)
	start = now.Add(time.Hour)
	schedule["interview"] = domain.Interview{Start: start, End: start.Add(30 * time.Minute), Timezone: "Asia/Kolkata"}
	mentor.decide("tutor-a", schedule, 200)
	mu.Lock()
	failCreate = true
	mu.Unlock()
	run()
	if current().Interview.JoinURL != "" || current().Interview.SyncStatus != "pending" {
		t.Fatal("API failure fabricated success")
	}
	mu.Lock()
	failCreate = false
	mu.Unlock()
	now = now.Add(5 * time.Second)
	run()
	mentor.decide("tutor-a", map[string]any{"action": "cancel_interview", "reason": "Fictional applicant requested cancellation."}, 200)
	if current().Interview.JoinURL != "" {
		t.Fatal("cancelled join link exposed")
	}
	run()
	if current().Interview.Status != "cancelled" || current().Interview.SyncStatus != "ready" {
		t.Fatal("cancel did not synchronize")
	}
	mu.Lock()
	if deletes != 1 {
		t.Fatal("cancellation failed")
	}
	mu.Unlock()
	// Expired token refresh and revoked grants are reflected in server health.
	mu.Lock()
	previousRefreshes := refreshes
	mu.Unlock()
	if _, e = s.C("google_connections").UpdateOne(ctx, bson.M{"_id": "mentor-a"}, bson.M{"$set": bson.M{"expiresAt": now.Add(-time.Minute)}}); e != nil {
		t.Fatal(e)
	}
	mentor.ok("GET", "/integrations/google", nil, 200)
	mu.Lock()
	if refreshes != previousRefreshes+1 {
		t.Fatal("expired token not refreshed")
	}
	revoked = true
	mu.Unlock()
	if _, e = s.C("google_connections").UpdateOne(ctx, bson.M{"_id": "mentor-a"}, bson.M{"$set": bson.M{"expiresAt": now.Add(-time.Minute)}}); e != nil {
		t.Fatal(e)
	}
	if mentor.ok("GET", "/integrations/google", nil, 200)["status"] != "reconnect_required" {
		t.Fatal("revoked connection reported healthy")
	}
	mentor.ok("POST", "/integrations/google/disconnect", map[string]any{}, 200)
	mentor.ok("POST", "/integrations/google/connect", map[string]any{}, 409)
	if _, e = a.runOneJobMatching(ctx, bson.M{"kind": "google_revoke"}); e != nil {
		t.Fatal(e)
	}
	mu.Lock()
	if revokes != 1 {
		t.Fatal("revocation not durable")
	}
	mu.Unlock()
	c, e = storage.One[googleConnection](ctx, s, "google_connections", bson.M{"_id": "mentor-a"})
	if e != nil || c.Access != "" || c.Refresh != "" {
		t.Fatal("disconnect retained tokens")
	}
	if current().Interview == nil {
		t.Fatal("disconnect deleted historical interview")
	}
}
