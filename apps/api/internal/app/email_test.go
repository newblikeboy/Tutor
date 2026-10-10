package app

import (
	"context"
	"encoding/base64"
	"go.mongodb.org/mongo-driver/v2/bson"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
	"tutorplatform/internal/config"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/mailer"
	"tutorplatform/internal/storage"
)

type testEmailSender struct {
	mu       sync.Mutex
	messages []mailer.Message
	err      error
}

func (s *testEmailSender) Send(_ context.Context, message mailer.Message) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.err != nil {
		return s.err
	}
	s.messages = append(s.messages, message)
	return nil
}

func TestMongoEmailAuthenticationAndDelivery(t *testing.T) {
	uri := os.Getenv("TEST_MONGODB_URI")
	if uri == "" {
		t.Skip("TEST_MONGODB_URI required")
	}
	t.Setenv("SEED_PASSWORD", testPassword)
	ctx := context.Background()
	store, err := storage.Connect(ctx, uri, "tutor_test_email_"+token()[:12])
	if err != nil {
		t.Fatal(err)
	}
	defer store.Client.Disconnect(ctx)
	if err = store.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	if err = store.Seed(ctx, "test"); err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{Env: "test", AuthProvider: "password", Origin: "http://test.local", SMTPFrom: "support@gocoaching.in", MailTokenKey: base64.StdEncoding.EncodeToString(make([]byte, 32))}
	a := New(store, cfg)
	sender := &testEmailSender{}
	a.Mail = sender
	var clock atomic.Int64
	clock.Store(time.Now().UTC().UnixNano())
	a.Now = func() time.Time { return time.Unix(0, clock.Load()).UTC() }
	server := httptest.NewServer(a.Routes())
	defer server.Close()
	client := func() *testClient {
		jar, _ := cookiejar.New(nil)
		return &testClient{t: t, http: &http.Client{Jar: jar, Timeout: 30 * time.Second}, base: server.URL}
	}
	request := func(c *testClient, email, purpose string) (string, string) {
		clock.Add(int64(61 * time.Second))
		response := c.ok("POST", "/auth/email/request", map[string]any{"email": email, "purpose": purpose}, 202)
		id := response["challengeId"].(string)
		j, e := storage.One[job](ctx, store, "outbox", bson.M{"_id": "email-code:" + id})
		if e != nil {
			t.Fatal(e)
		}
		code, e := a.protectCode(id, j.Payload["encryptedCode"], false)
		if e != nil {
			t.Fatal(e)
		}
		if j.Payload["encryptedCode"] == code || strings.Contains(j.Payload["encryptedCode"], code) {
			t.Fatal("plaintext code persisted")
		}
		return id, code
	}
	confirm := func(c *testClient, id, code string, status int) map[string]any {
		return c.ok("POST", "/auth/email/confirm", map[string]any{"challengeId": id, "code": code}, status)
	}
	t.Run("login verifies email, creates revocable session and rejects replay", func(t *testing.T) {
		c := client()
		id, code := request(c, "parent-a@example.test", "login")
		if _, err = a.runEmailBatch(ctx, 25, true); err != nil {
			t.Fatal(err)
		}
		j, _ := storage.One[job](ctx, store, "outbox", bson.M{"_id": "email-code:" + id})
		if j.Status != "done" || j.SMTPAcceptedAt == nil || j.Payload["encryptedCode"] != "" {
			t.Fatal("email acceptance not recorded or code retained")
		}
		sender.mu.Lock()
		acceptedCount := len(sender.messages)
		sender.mu.Unlock()
		_, err = store.C("outbox").UpdateOne(ctx, bson.M{"_id": j.ID}, bson.M{"$set": bson.M{"status": "processing", "leaseUntil": a.Now().Add(-time.Second)}})
		if err != nil {
			t.Fatal(err)
		}
		if _, err = a.runEmailBatch(ctx, 25, true); err != nil {
			t.Fatal(err)
		}
		sender.mu.Lock()
		if len(sender.messages) != acceptedCount {
			t.Error("accepted email was resubmitted after worker recovery")
		}
		sender.mu.Unlock()
		sender.mu.Lock()
		message := sender.messages[len(sender.messages)-1]
		sender.mu.Unlock()
		if !strings.Contains(message.Content.Text, code) || !strings.Contains(message.Content.HTML, "GoCoaching") {
			t.Fatal("code/brand missing from delivery")
		}
		response := confirm(c, id, code, 200)
		c.csrf = response["csrf"].(string)
		if response["user"].(map[string]any)["emailVerifiedAt"] == nil {
			t.Fatal("email not verified")
		}
		c.ok("GET", "/account", nil, 200)
		confirm(client(), id, code, 401)
		session := c.ok("GET", "/account/sessions", nil, 200)["items"].([]any)
		if len(session) != 1 {
			t.Fatal("OTP session not listed")
		}
		c.ok("POST", "/auth/logout", map[string]any{}, 200)
		c.ok("GET", "/account", nil, 401)
	})
	t.Run("unknown and staff requests disclose no eligibility and cannot sign in", func(t *testing.T) {
		for _, email := range []string{"unknown@example.test", "admin-a@example.test"} {
			clock.Add(int64(61 * time.Second))
			c := client()
			response := c.ok("POST", "/auth/email/request", map[string]any{"email": email, "purpose": "login"}, 202)
			count, e := store.C("outbox").CountDocuments(ctx, bson.M{"_id": "email-code:" + response["challengeId"].(string)})
			if e != nil || count != 0 {
				t.Fatal("ineligible code was queued")
			}
			confirm(c, response["challengeId"].(string), "123456", 401)
		}
	})
	t.Run("resend cooldown invalidates old codes and five guesses exhaust a challenge", func(t *testing.T) {
		c := client()
		old, oldCode := request(c, "parent-b@example.test", "login")
		c.ok("POST", "/auth/email/request", map[string]any{"email": "parent-b@example.test", "purpose": "login"}, 429)
		fresh, code := request(c, "parent-b@example.test", "login")
		confirm(c, old, oldCode, 401)
		wrong := "000000"
		if code == wrong {
			wrong = "111111"
		}
		for i := 0; i < 5; i++ {
			confirm(c, fresh, wrong, 401)
		}
		confirm(c, fresh, code, 401)
		challenge, e := storage.One[emailChallenge](ctx, store, "email_challenges", bson.M{"_id": fresh})
		if e != nil || challenge.Attempts != 5 {
			t.Fatal("failed guesses were not persisted")
		}
		expired, expiredCode := request(c, "parent-b@example.test", "login")
		clock.Add(int64(11 * time.Minute))
		confirm(c, expired, expiredCode, 401)
	})
	t.Run("authenticated verification is CSRF protected and owner scoped", func(t *testing.T) {
		c, other := client(), client()
		c.login("parent-b")
		other.login("parent-a")
		c.ok("POST", "/account/email/request", map[string]any{}, 202)
		challenges, e := storage.Many[emailChallenge](ctx, store, "email_challenges", bson.M{"userId": "parent-b", "purpose": "verify"})
		if e != nil || len(challenges) != 1 {
			t.Fatal("verification challenge missing")
		}
		challenge := challenges[0]
		j, _ := storage.One[job](ctx, store, "outbox", bson.M{"_id": "email-code:" + challenge.ID})
		code, _ := a.protectCode(challenge.ID, j.Payload["encryptedCode"], false)
		body := map[string]any{"challengeId": challenge.ID, "code": code}
		other.ok("POST", "/account/email/confirm", body, 401)
		savedCSRF := c.csrf
		c.csrf = ""
		c.ok("POST", "/account/email/confirm", body, 403)
		c.csrf = savedCSRF
		c.ok("POST", "/auth/email/confirm", body, 401)
		c.ok("POST", "/account/email/confirm", body, 200)
		c.ok("PUT", "/account/email/preferences", map[string]any{"reminders": false, "version": 0}, 200)
		c.ok("PUT", "/account/email/preferences", map[string]any{"reminders": true, "version": 0}, 409)
		c.ok("PUT", "/account", map[string]any{"name": "Fictional family", "language": "en", "version": 1}, 200)
		if c.ok("GET", "/account/email/preferences", nil, 200)["reminders"] != false {
			t.Fatal("profile save erased reminder preference")
		}
		other.ok("GET", "/admin/email-deliveries", nil, 403)
	})
	t.Run("recovery revokes all sessions and preserves password policy", func(t *testing.T) {
		first, second := client(), client()
		first.login("parent-a")
		second.login("parent-a")
		id, code := request(client(), "parent-a@example.test", "reset")
		recovery := client()
		recovery.ok("POST", "/auth/email/confirm", map[string]any{"challengeId": id, "code": code, "newPassword": "short"}, 422)
		next := "Changed integration learning passphrase 927!"
		recovery.ok("POST", "/auth/email/confirm", map[string]any{"challengeId": id, "code": code, "newPassword": next}, 200)
		first.ok("GET", "/account", nil, 401)
		second.ok("GET", "/account", nil, 401)
		recovery.ok("POST", "/auth/login", map[string]any{"email": "parent-a@example.test", "password": testPassword}, 401)
		result := recovery.ok("POST", "/auth/login", map[string]any{"email": "parent-a@example.test", "password": next}, 200)
		recovery.csrf = result["csrf"].(string)
		confirm(client(), id, code, 401)
	})
	t.Run("reminders deduplicate, honor opt-out and skip changed or cancelled classes", func(t *testing.T) {
		trial := domain.Trial{ID: token(), OwnerID: "parent-a", TutorID: "tutor-meera", LearnerName: "Fictional child", Class: 8, Subject: "Mathematics", Subjects: []string{"Mathematics"}, Mode: "online", Status: "confirmed", Start: a.Now().Add(24 * time.Hour), End: a.Now().Add(24*time.Hour + time.Hour), Version: 1}
		if _, err = store.C("trials").InsertOne(ctx, trial); err != nil {
			t.Fatal(err)
		}
		if err = a.scheduleEmailReminders(ctx); err != nil {
			t.Fatal(err)
		}
		if err = a.scheduleEmailReminders(ctx); err != nil {
			t.Fatal(err)
		}
		count, _ := store.C("outbox").CountDocuments(ctx, bson.M{"kind": "email", "payload.event": "reminder", "payload.targetId": trial.ID})
		if count != 4 {
			t.Fatalf("expected four unique reminder jobs, got %d", count)
		}
		jobs, _ := storage.Many[job](ctx, store, "outbox", bson.M{"payload.targetId": trial.ID, "payload.lead": "24 hours"})
		var j job
		for _, value := range jobs {
			if value.Payload["recipientId"] == "parent-a" {
				j = value
			}
		}
		parent, _ := storage.One[domain.User](ctx, store, "users", bson.M{"_id": "parent-a"})
		d, e := a.emailTemplate(ctx, j, parent)
		if e != nil || !strings.Contains(d.Title, "24 hours") {
			t.Fatalf("valid reminder rejected: %v", e)
		}
		_, err = store.C("preferences").InsertOne(ctx, accountPreferences{ID: "parent-a", Language: "en", EmailReminders: func() *bool { v := false; return &v }()})
		if err != nil {
			t.Fatal(err)
		}
		if _, e = a.emailTemplate(ctx, j, parent); e == nil {
			t.Fatal("opt-out ignored")
		}
		teacher, _ := storage.One[domain.User](ctx, store, "users", bson.M{"_id": "tutor-meera"})
		for _, value := range jobs {
			if value.Payload["recipientId"] == teacher.ID {
				j = value
			}
		}
		_, err = store.C("trials").UpdateOne(ctx, bson.M{"_id": trial.ID}, bson.M{"$set": bson.M{"start": trial.Start.Add(time.Hour)}})
		if err != nil {
			t.Fatal(err)
		}
		if _, e = a.emailTemplate(ctx, j, teacher); e == nil {
			t.Fatal("old schedule reminder sent")
		}
		_, err = store.C("trials").UpdateOne(ctx, bson.M{"_id": trial.ID}, bson.M{"$set": bson.M{"start": trial.Start, "status": "cancelled"}})
		if err != nil {
			t.Fatal(err)
		}
		if _, e = a.emailTemplate(ctx, j, teacher); e == nil {
			t.Fatal("cancelled reminder sent")
		}
	})
	t.Run("regular one-hour reminders require active current assignments", func(t *testing.T) {
		en := domain.Enrollment{ID: token(), OwnerID: "parent-b", TutorID: "tutor-meera", TutorName: "Fictional tutor", LearnerName: "Fictional learner", Class: 8, Status: "active", Version: 1, Agreement: domain.Agreement{Mode: "online", Subject: "Mathematics", Subjects: []string{"Mathematics"}, Minutes: 60, SessionCount: 24, TotalPaise: 480000}}
		lesson := domain.ClassSession{ID: token(), EnrollmentID: en.ID, TutorID: en.TutorID, Status: "scheduled", Start: a.Now().Add(time.Hour), End: a.Now().Add(2 * time.Hour), Version: 1}
		if _, err = store.C("enrollments").InsertOne(ctx, en); err != nil {
			t.Fatal(err)
		}
		if _, err = store.C("classes").InsertOne(ctx, lesson); err != nil {
			t.Fatal(err)
		}
		if err = a.scheduleEmailReminders(ctx); err != nil {
			t.Fatal(err)
		}
		jobs, e := storage.Many[job](ctx, store, "outbox", bson.M{"payload.targetId": lesson.ID})
		if e != nil || len(jobs) != 2 {
			t.Fatal("missed lead or duplicate reminders", len(jobs), e)
		}
		teacher, _ := storage.One[domain.User](ctx, store, "users", bson.M{"_id": en.TutorID})
		var reminder job
		for _, candidate := range jobs {
			if candidate.Payload["recipientId"] == teacher.ID {
				reminder = candidate
			}
		}
		if d, e := a.emailTemplate(ctx, reminder, teacher); e != nil || !strings.Contains(d.Title, "1 hour") {
			t.Fatal("valid one-hour reminder rejected", e)
		}
		if _, err = store.C("enrollments").UpdateOne(ctx, bson.M{"_id": en.ID}, bson.M{"$set": bson.M{"status": "paused"}}); err != nil {
			t.Fatal(err)
		}
		if _, e = a.emailTemplate(ctx, reminder, teacher); e == nil {
			t.Fatal("paused package sent reminder")
		}
		if _, err = store.C("enrollments").UpdateOne(ctx, bson.M{"_id": en.ID}, bson.M{"$set": bson.M{"status": "active", "tutorId": "tutor-arjun"}}); err != nil {
			t.Fatal(err)
		}
		if _, e = a.emailTemplate(ctx, reminder, teacher); e == nil {
			t.Fatal("former tutor received class reminder")
		}
	})
	t.Run("ambiguous SMTP acceptance stops automatic retries and hides codes from admins", func(t *testing.T) {
		if _, err = a.runEmailBatch(ctx, 100, false); err != nil {
			t.Fatal(err)
		}
		sender.err = &mailer.Error{Ambiguous: true}
		id := "email:security-test"
		if err = a.enqueue(ctx, id, "email", bson.M{"event": "password_changed", "recipientId": "parent-a"}, "pending"); err != nil {
			t.Fatal(err)
		}
		if _, err = a.runEmailBatch(ctx, 100, false); err != nil {
			t.Fatal(err)
		}
		j, e := storage.One[job](ctx, store, "outbox", bson.M{"_id": id})
		if e != nil || j.Status != "uncertain" {
			t.Fatal("uncertain outcome automatically retried")
		}
		admin := client()
		admin.login("admin-a")
		_, _, body := admin.call("GET", "/admin/email-deliveries", nil, nil)
		if strings.Contains(string(body), "encryptedCode") || strings.Contains(string(body), "codeHash") {
			t.Fatal("mail log leaked credentials")
		}
		encodedID := strings.ReplaceAll(url.PathEscape(id), ":", "%3A")
		admin.ok("POST", "/admin/email-deliveries/"+encodedID+"/retry", map[string]any{"reason": "Reviewed delivery with recipient", "acknowledgeDuplicate": false}, 422)
		admin.ok("POST", "/admin/email-deliveries/"+encodedID+"/retry", map[string]any{"reason": "Reviewed delivery with recipient", "acknowledgeDuplicate": true}, 200)
		sender.err = nil
	})
	t.Run("production codes keep Secure sessions and reject sample accounts", func(t *testing.T) {
		productionConfig := cfg
		productionConfig.Env = "production"
		productionConfig.Origin = "https://test.local"
		production := New(store, productionConfig)
		production.Now = a.Now
		production.Mail = &testEmailSender{}
		tlsServer := httptest.NewTLSServer(production.Routes())
		defer tlsServer.Close()
		jar, _ := cookiejar.New(nil)
		httpClient := *tlsServer.Client()
		httpClient.Jar = jar
		c := &testClient{t: t, http: &httpClient, base: tlsServer.URL}
		call := func(path string, body any, want int) map[string]any {
			t.Helper()
			status, value, raw := c.call("POST", path, body, map[string]string{"Origin": productionConfig.Origin})
			if status != want {
				t.Fatalf("production %s: got %d want %d: %s", path, status, want, raw)
			}
			return value
		}
		call("/auth/signup", map[string]any{"name": "Fictional production adult", "email": "fictional-otp@example.com", "password": testPassword, "role": "parent", "adult": true}, 201)
		sample := call("/auth/email/request", map[string]any{"email": "parent-a@example.test", "purpose": "login"}, 202)
		count, e := store.C("outbox").CountDocuments(ctx, bson.M{"_id": "email-code:" + sample["challengeId"].(string)})
		if e != nil || count != 0 {
			t.Fatal("sample account received production code")
		}
		response := call("/auth/email/request", map[string]any{"email": "fictional-otp@example.com", "purpose": "login"}, 202)
		id := response["challengeId"].(string)
		j, e := storage.One[job](ctx, store, "outbox", bson.M{"_id": "email-code:" + id})
		if e != nil {
			t.Fatal(e)
		}
		code, e := production.protectCode(id, j.Payload["encryptedCode"], false)
		if e != nil {
			t.Fatal(e)
		}
		result := call("/auth/email/confirm", map[string]any{"challengeId": id, "code": code}, 200)
		c.csrf = result["csrf"].(string)
		sessions, e := storage.Many[Session](ctx, store, "sessions", bson.M{"userId": result["user"].(map[string]any)["id"], "method": "email-otp-production"})
		if e != nil || len(sessions) != 1 {
			t.Fatal("production OTP method missing", e)
		}
		status, _, raw := c.call("GET", "/account", nil, map[string]string{"Origin": productionConfig.Origin})
		if status != 200 {
			t.Fatalf("Secure OTP cookie not usable over TLS: %s", raw)
		}
		secureURL, _ := url.Parse(tlsServer.URL)
		devURL, _ := url.Parse(server.URL)
		dev := client()
		for _, cookie := range jar.Cookies(secureURL) {
			cookie.Secure = false
			dev.http.Jar.SetCookies(devURL, []*http.Cookie{cookie})
		}
		dev.ok("GET", "/account", nil, 401)
	})
}
