package app

import (
	"context"
	"encoding/base64"
	"go.mongodb.org/mongo-driver/v2/bson"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"
	"tutorplatform/internal/config"
	"tutorplatform/internal/storage"
)

func TestMongoSignupRequiresEmailVerification(t *testing.T) {
	uri := os.Getenv("TEST_MONGODB_URI")
	if uri == "" {
		t.Skip("TEST_MONGODB_URI required")
	}
	ctx := context.Background()
	store, err := storage.Connect(ctx, uri, "tutor_test_signup_"+token()[:12])
	if err != nil {
		t.Fatal(err)
	}
	defer store.Client.Disconnect(ctx)
	if err = store.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	a := New(store, config.Config{Env: "test", AuthProvider: "password", Origin: "http://test.local", MailTokenKey: base64.StdEncoding.EncodeToString(make([]byte, 32))})
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
	input := func(email string) map[string]any {
		return map[string]any{"name": "Fictional signup adult", "email": email, "password": testPassword, "role": "parent", "adult": true}
	}
	call := func(c *testClient, body map[string]any, status int) map[string]any {
		clock.Add(int64(61 * time.Second))
		return c.ok("POST", "/auth/signup", body, status)
	}
	request := func(email string) map[string]any {
		clock.Add(int64(61 * time.Second))
		body := input(email)
		signupCode(t, a, email, body)
		return body
	}
	empty := func() {
		t.Helper()
		for _, collection := range []string{"users", "credentials", "sessions"} {
			count, e := store.C(collection).CountDocuments(ctx, bson.M{})
			if e != nil || count != 0 {
				t.Fatalf("premature %s created: %d %v", collection, count, e)
			}
		}
	}
	call(client(), input("first@example.test"), 422)
	empty()
	body := request("first@example.test")
	empty()
	c := client()
	c.ok("GET", "/account", nil, 401)
	if _, err = a.runEmailBatch(ctx, 25, true); err != nil {
		t.Fatal(err)
	}
	sender.mu.Lock()
	if len(sender.messages) != 1 || !strings.Contains(sender.messages[0].Content.Text, body["code"].(string)) || !strings.Contains(sender.messages[0].Content.HTML, "GoCoaching") || !strings.Contains(sender.messages[0].Content.Text, "only after") {
		t.Error("signup mail missing code, branding or instructions")
	}
	sender.mu.Unlock()
	wrongEmail := input("other@example.test")
	wrongEmail["challengeId"], wrongEmail["code"] = body["challengeId"], body["code"]
	call(c, wrongEmail, 401)
	call(c, map[string]any{"name": "Staff injection", "email": "first@example.test", "password": testPassword, "role": "admin", "adult": true, "challengeId": body["challengeId"], "code": body["code"]}, 422)
	c.ok("POST", "/auth/email/confirm", map[string]any{"challengeId": body["challengeId"], "code": body["code"]}, 401)
	empty()
	correct := body["code"]
	body["code"] = "000000"
	if correct == body["code"] {
		body["code"] = "111111"
	}
	call(c, body, 401)
	empty()
	body["code"] = correct
	auth := call(c, body, 201)
	if auth["user"].(map[string]any)["emailVerifiedAt"] == nil {
		t.Fatal("signup email not verified")
	}
	if auth["user"].(map[string]any)["guardianVerified"] == true {
		t.Fatal("OTP granted guardian verification")
	}
	c.csrf = auth["csrf"].(string)
	c.ok("GET", "/account", nil, 200)
	c.ok("POST", "/learners", map[string]any{"name": "Fictional child", "class": 8, "board": "CBSE", "language": "English", "kind": "minor", "consentId": ""}, 403)
	call(client(), body, 401)
	count, _ := store.C("sessions").CountDocuments(ctx, bson.M{})
	if count != 1 {
		t.Fatal("code replay created another session")
	}
	// Resend invalidates the old challenge, before any user exists.
	old := request("resend@example.test")
	fresh := request("resend@example.test")
	call(client(), old, 401)
	fresh["role"] = "tutor"
	result := call(client(), fresh, 201)
	if result["user"].(map[string]any)["role"] != "tutor" {
		t.Fatal("tutor role lost")
	}
	client().ok("GET", "/tutors/"+result["user"].(map[string]any)["id"].(string), nil, 404)
	expired := request("expired@example.test")
	clock.Add(int64(11 * time.Minute))
	call(client(), expired, 401)
	guesses := request("guesses@example.test")
	correct = guesses["code"]
	guesses["code"] = "000000"
	if correct == guesses["code"] {
		guesses["code"] = "111111"
	}
	for i := 0; i < 5; i++ {
		call(client(), guesses, 401)
	}
	guesses["code"] = correct
	call(client(), guesses, 401)
	for _, email := range []string{"expired@example.test", "guesses@example.test", "other@example.test"} {
		count, _ := store.C("users").CountDocuments(ctx, bson.M{"email": email})
		if count != 0 {
			t.Fatal("invalid code created user")
		}
	}
	// Existing addresses receive the same public response without a signup code.
	clock.Add(int64(61 * time.Second))
	response := client().ok("POST", "/auth/email/request", map[string]any{"email": "first@example.test", "purpose": "signup"}, 202)
	count, _ = store.C("outbox").CountDocuments(ctx, bson.M{"_id": "email-code:" + response["challengeId"].(string)})
	if count != 0 {
		t.Fatal("existing account queued signup code")
	}
	unconfigured := request("unconfigured@example.test")
	a.Mail = nil
	call(client(), unconfigured, 503)
	count, _ = store.C("users").CountDocuments(ctx, bson.M{"email": "unconfigured@example.test"})
	if count != 0 {
		t.Fatal("unconfigured mail bypassed verification")
	}
}
