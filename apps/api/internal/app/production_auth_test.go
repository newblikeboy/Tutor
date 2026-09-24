package app

import (
	"context"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"testing"
	"time"
	"tutorplatform/internal/config"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/staff"
	"tutorplatform/internal/storage"

	"go.mongodb.org/mongo-driver/v2/bson"
)

func TestProductionAuthProxyAndCookie(t *testing.T) {
	a := New(nil, config.Config{Env: "production"})
	for _, tc := range []struct{ peer, header, want string }{
		{"127.0.0.1:8080", "198.51.100.4", "198.51.100.4"},
		{"[::1]:8080", "2001:db8::4", "2001:db8::4"},
		{"192.0.2.1:5000", "198.51.100.4", "192.0.2.1"},
		{"127.0.0.1:8080", "198.51.100.4, 192.0.2.1", "127.0.0.1"},
		{"127.0.0.1:8080", "invalid", "127.0.0.1"},
	} {
		r := httptest.NewRequest("POST", "/", nil)
		r.RemoteAddr = tc.peer
		r.Header.Set("X-Forwarded-For", tc.header)
		if got := a.authClientIP(r); got != tc.want {
			t.Fatalf("peer %q: got %q want %q", tc.peer, got, tc.want)
		}
	}
	w := httptest.NewRecorder()
	a.authResponse(w, domain.User{}, "test-token", "test-csrf", 200)
	c := w.Result().Cookies()[0]
	if !c.Secure || !c.HttpOnly || c.SameSite != http.SameSiteLaxMode || c.Path != "/" || c.MaxAge != 28800 {
		t.Fatal("production cookie lacks required attributes")
	}
}

func TestMongoProductionPasswordAccounts(t *testing.T) {
	const accountPassword = "Test#842" // Exactly eight characters, including staff provisioning.
	uri := os.Getenv("TEST_MONGODB_URI")
	if uri == "" {
		t.Skip("TEST_MONGODB_URI required for real replica-set verification")
	}
	ctx := context.Background()
	s, err := storage.Connect(ctx, uri, "tutor_test_prod_auth_"+token()[:12])
	if err != nil {
		t.Fatal(err)
	}
	defer s.Client.Disconnect(ctx)
	if err = s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{Env: "production", AuthProvider: "password", Origin: "https://test.local"}
	a := New(s, cfg)
	server := httptest.NewTLSServer(a.Routes())
	defer server.Close()
	newClient := func(server *httptest.Server) *testClient {
		jar, _ := cookiejar.New(nil)
		h := *server.Client()
		h.Jar = jar
		return &testClient{t: t, http: &h, base: server.URL}
	}
	call := func(c *testClient, method, path string, body any, want int) map[string]any {
		t.Helper()
		status, value, raw := c.call(method, path, body, map[string]string{"Origin": cfg.Origin})
		if status != want {
			t.Fatalf("%s %s: got %d want %d: %s", method, path, status, want, raw)
		}
		return value
	}
	parent, tutor := newClient(server), newClient(server)
	call(parent, "POST", "/auth/signup", map[string]any{"name": "Short password", "email": "short@example.test", "password": "Abcd!42", "role": "parent", "adult": true}, 422)
	if err := staff.Provision(ctx, s, staff.Input{Name: "Short staff", Email: "short-staff@example.test", Role: "admin", Password: "Abcd!42", Operator: "policy-test", Reason: "Reject passwords below the new minimum."}); err == nil {
		t.Fatal("staff provisioning accepted seven characters")
	}
	if v := call(parent, "GET", "/config", nil, 200); v["authEnabled"] != true || v["development"] != false {
		t.Fatal("production forms remain disabled")
	}
	for i, c := range []*testClient{parent, tutor} {
		role := []string{"parent", "tutor"}[i]
		v := call(c, "POST", "/auth/signup", map[string]any{"name": "Production test adult", "email": role + "@example.test", "password": accountPassword, "role": role, "adult": true}, 201)
		c.csrf = v["csrf"].(string)
		if v["user"].(map[string]any)["sample"] != false {
			t.Fatal("signup created sample account")
		}
		call(c, "GET", "/auth/session", nil, 200)
		call(c, "GET", "/account", nil, 200)
		call(c, "GET", "/dashboard", nil, 200)
		call(c, "POST", "/auth/logout", map[string]any{}, 200)
		if v := call(c, "GET", "/auth/session", nil, 200); v != nil {
			t.Fatal("logout retained session")
		}
		v = call(c, "POST", "/auth/login", map[string]any{"email": role + "@example.test", "password": accountPassword}, 200)
		c.csrf = v["csrf"].(string)
	}
	call(tutor, "GET", "/staff/overview", nil, 403)
	for _, role := range []string{"admin", "mentor", "support", "finance"} {
		call(parent, "POST", "/auth/signup", map[string]any{"name": "Injected staff", "email": role + "@example.test", "password": accountPassword, "role": role, "adult": true}, 422)
		if err := staff.Provision(ctx, s, staff.Input{Name: "Fictional " + role, Email: role + "@example.test", Role: role, Password: accountPassword, Operator: "production-auth-test", Reason: "Verify explicitly provisioned staff password access."}); err != nil {
			t.Fatal(err)
		}
		c := newClient(server)
		call(c, "POST", "/auth/login", map[string]any{"email": role + "@example.test", "password": "wrong test password"}, 401)
		v := call(c, "POST", "/auth/login", map[string]any{"email": role + "@example.test", "password": accountPassword}, 200)
		c.csrf = v["csrf"].(string)
		if v["user"].(map[string]any)["role"] != role {
			t.Fatal("staff role changed at login")
		}
		call(c, "GET", "/account", nil, 200)
		if call(c, "GET", "/auth/session", nil, 200)["user"].(map[string]any)["role"] != role {
			t.Fatal("staff session did not persist")
		}
		want := 403
		if role == "admin" || role == "mentor" {
			want = 200
		}
		call(c, "GET", "/dashboard", nil, want)
		call(c, "GET", "/staff/overview", nil, want)
		call(c, "GET", "/staff/applications", nil, want)
		call(c, "POST", "/auth/logout", map[string]any{}, 200)
		call(c, "GET", "/account", nil, 401)
	}
	call(parent, "POST", "/consents", map[string]any{"relationship": "parent", "accepted": true}, 503)
	if status, _, _ := parent.call("POST", "/auth/logout", map[string]any{}, map[string]string{"Origin": "https://attacker.invalid"}); status != 403 {
		t.Fatal("foreign origin accepted")
	}
	if status, _, _ := parent.call("POST", "/auth/logout", map[string]any{}, map[string]string{"Origin": cfg.Origin, "X-CSRF-Token": "wrong"}); status != 403 {
		t.Fatal("invalid CSRF accepted")
	}
	server2 := httptest.NewTLSServer(New(s, cfg).Routes())
	defer server2.Close()
	second := newClient(server2)
	second.http.Jar = parent.http.Jar
	second.csrf = parent.csrf
	call(second, "GET", "/account", nil, 200)
	// Password rotation must work with production sessions and revoke other sessions.
	other := newClient(server)
	v := call(other, "POST", "/auth/login", map[string]any{"email": "parent@example.test", "password": accountPassword}, 200)
	other.csrf = v["csrf"].(string)
	nextPassword := "Next#712"
	call(parent, "POST", "/account/password", map[string]any{"currentPassword": accountPassword, "newPassword": "Abcd!42"}, 422)
	v = call(parent, "POST", "/account/password", map[string]any{"currentPassword": accountPassword, "newPassword": nextPassword}, 200)
	parent.csrf = v["csrf"].(string)
	call(other, "GET", "/account", nil, 401)
	call(parent, "GET", "/account", nil, 200)
	call(other, "POST", "/auth/login", map[string]any{"email": "parent@example.test", "password": accountPassword}, 401)
	// A development session cannot be replayed, even against the same database.
	cred, err := storage.One[credential](ctx, s, "credentials", bson.M{"_id": "tutor@example.test"})
	if err != nil {
		t.Fatal(err)
	}
	updateUser := func(fields bson.M) {
		t.Helper()
		if _, e := s.C("users").UpdateOne(ctx, bson.M{"_id": cred.UserID}, bson.M{"$set": fields}); e != nil {
			t.Fatal(e)
		}
	}
	if _, err := s.C("sessions").UpdateMany(ctx, bson.M{"userId": cred.UserID}, bson.M{"$set": bson.M{"method": "password"}}); err != nil {
		t.Fatal(err)
	}
	call(tutor, "GET", "/account", nil, 401)
	if call(tutor, "GET", "/auth/session", nil, 200) != nil {
		t.Fatal("development session replayed")
	}
	login := map[string]any{"email": "tutor@example.test", "password": accountPassword}
	v = call(tutor, "POST", "/auth/login", login, 200)
	tutor.csrf = v["csrf"].(string)
	updateUser(bson.M{"sample": true})
	call(tutor, "POST", "/auth/login", login, 401)
	call(tutor, "GET", "/account", nil, 401)
	if call(tutor, "GET", "/auth/session", nil, 200) != nil {
		t.Fatal("sample session exposed")
	}
	updateUser(bson.M{"sample": false, "role": "unrecognised"})
	call(tutor, "POST", "/auth/login", login, 401)
	call(tutor, "GET", "/account", nil, 401)
	if call(tutor, "GET", "/auth/session", nil, 200) != nil {
		t.Fatal("unknown role session exposed")
	}
	updateUser(bson.M{"role": "tutor"})
	if _, err := s.C("sessions").UpdateMany(ctx, bson.M{"userId": cred.UserID}, bson.M{"$set": bson.M{"expiresAt": time.Now().Add(-time.Hour)}}); err != nil {
		t.Fatal(err)
	}
	call(tutor, "GET", "/account", nil, 401)
	// Rate limits distinguish clients behind the trusted proxy.
	fixedNow := time.Now().UTC()
	a.Now = func() time.Time { return fixedNow }
	for i := 0; i < 40; i++ {
		if err := a.rate(ctx, "auth:login:ip:198.51.100.77", 40); err != nil {
			t.Fatal(err)
		}
	}
	for _, tc := range []struct {
		ip   string
		want int
	}{{"198.51.100.77", 429}, {"198.51.100.78", 401}} {
		status, _, _ := other.call("POST", "/auth/login", map[string]any{"email": "unknown@example.test", "password": accountPassword}, map[string]string{"Origin": cfg.Origin, "X-Forwarded-For": tc.ip})
		if status != tc.want {
			t.Fatal("proxy-aware rate limit", status, tc.want)
		}
	}
	cfg.AuthProvider = "disabled"
	disabled := httptest.NewTLSServer(New(s, cfg).Routes())
	defer disabled.Close()
	dc := newClient(disabled)
	call(dc, "POST", "/auth/login", login, 503)
	if call(dc, "GET", "/config", nil, 200)["authEnabled"] != false {
		t.Fatal("disabled switch ignored")
	}
}
