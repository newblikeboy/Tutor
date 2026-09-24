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
	"tutorplatform/internal/storage"
)

func TestMongoAccountSecurity(t *testing.T) {
	uri := os.Getenv("TEST_MONGODB_URI")
	if uri == "" {
		t.Skip("TEST_MONGODB_URI required")
	}
	t.Setenv("SEED_PASSWORD", testPassword)
	ctx := context.Background()
	s, e := storage.Connect(ctx, uri, "tutor_test_account_"+token()[:12])
	if e != nil {
		t.Fatal("database connection failed")
	}
	defer s.Client.Disconnect(ctx)
	if e = s.Migrate(ctx); e != nil {
		t.Fatal(e)
	}
	if e = s.Seed(ctx, "test"); e != nil {
		t.Fatal(e)
	}
	server := httptest.NewServer(New(s, config.Config{Env: "test", AuthProvider: "password", Origin: "http://test.local"}).Routes())
	defer server.Close()
	client := func(id string) *testClient {
		jar, _ := cookiejar.New(nil)
		c := &testClient{t: t, http: &http.Client{Jar: jar, Timeout: 30 * time.Second}, base: server.URL}
		c.login(id)
		return c
	}
	first, second, other := client("parent-a"), client("parent-a"), client("parent-b")
	t.Run("preferences are owned and stale writes rejected", func(t *testing.T) {
		first.ok("PUT", "/account", map[string]any{"name": "Updated family name", "language": "hi", "version": 0}, 200)
		first.ok("PUT", "/account", map[string]any{"name": "Stale family name", "language": "en", "version": 0}, 409)
		got := second.ok("GET", "/account", nil, 200)
		if got["name"] != "Updated family name" || got["preferences"].(map[string]any)["language"] != "hi" {
			t.Fatal("preferences not persisted")
		}
		if other.ok("GET", "/account", nil, 200)["name"] == got["name"] {
			t.Fatal("preferences leaked")
		}
		first.ok("PUT", "/account", map[string]any{"name": "Updated family name", "language": "hi", "version": 1, "role": "admin"}, 422)
	})
	t.Run("session list reveals no bearer or CSRF and revocation is owner scoped", func(t *testing.T) {
		sessions := first.ok("GET", "/account/sessions", nil, 200)["items"].([]any)
		if len(sessions) != 2 {
			t.Fatal("expected two sessions")
		}
		for _, raw := range sessions {
			v := raw.(map[string]any)
			if len(v) != 3 {
				t.Fatal("session secrets exposed")
			}
			if v["current"] == false {
				other.ok("POST", "/account/sessions/"+v["id"].(string)+"/revoke", map[string]any{}, 404)
				first.ok("POST", "/account/sessions/"+v["id"].(string)+"/revoke", map[string]any{}, 200)
			}
		}
		second.ok("GET", "/me", nil, 401)
		second.login("parent-a")
	})
	t.Run("password requires current secret and rotates all sessions atomically", func(t *testing.T) {
		next := "Next#739"
		first.ok("POST", "/account/password", map[string]any{"currentPassword": "Wrong current passphrase", "newPassword": next}, 401)
		second.ok("GET", "/me", nil, 200)
		changed := first.ok("POST", "/account/password", map[string]any{"currentPassword": testPassword, "newPassword": next}, 200)
		first.csrf = changed["csrf"].(string)
		first.ok("GET", "/me", nil, 200)
		second.ok("GET", "/me", nil, 401)
		first.ok("POST", "/auth/login", map[string]any{"email": "parent-a@example.test", "password": testPassword}, 401)
		other.ok("GET", "/me", nil, 200)
		got := second.ok("POST", "/auth/login", map[string]any{"email": "parent-a@example.test", "password": next}, 200)
		second.csrf = got["csrf"].(string)
		second.ok("GET", "/me", nil, 200)
	})
}
