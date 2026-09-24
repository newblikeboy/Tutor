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

func TestMongoServiceCases(t *testing.T) {
	uri := os.Getenv("TEST_MONGODB_URI")
	if uri == "" {
		t.Skip("TEST_MONGODB_URI required")
	}
	t.Setenv("SEED_PASSWORD", testPassword)
	ctx := context.Background()
	s, e := storage.Connect(ctx, uri, "tutor_test_cases_"+token()[:12])
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
	a := New(s, config.Config{Env: "test", AuthProvider: "password", Origin: "http://test.local"})
	server := httptest.NewServer(a.Routes())
	defer server.Close()
	client := func(id string) *testClient {
		jar, _ := cookiejar.New(nil)
		c := &testClient{t: t, http: &http.Client{Jar: jar, Timeout: 30 * time.Second}, base: server.URL}
		c.login(id)
		return c
	}
	parent, other, support, admin, finance := client("parent-a"), client("parent-b"), client("support-a"), client("admin-a"), client("finance-a")
	create := func(kind, key string) map[string]any {
		status, v, raw := parent.call("POST", "/cases", map[string]any{"kind": kind, "title": "Private family request", "body": "Please help with this fictional private family concern."}, map[string]string{"Idempotency-Key": key})
		if status != 201 {
			t.Fatalf("create %d %s", status, raw)
		}
		return v
	}
	v := create("support", "case-support-request")
	t.Run("request idempotency and triage redact personal content", func(t *testing.T) {
		again := create("support", "case-support-request")
		if again["id"] != v["id"] {
			t.Fatal("duplicate request")
		}
		id := v["id"].(string)
		other.ok("GET", "/cases/"+id, nil, 404)
		finance.ok("GET", "/cases/"+id, nil, 404)
		triage := support.ok("GET", "/cases/"+id, nil, 200)["case"].(map[string]any)
		if triage["title"] != "" || triage["body"] != "" || triage["restricted"] != true {
			t.Fatal("unassigned details exposed")
		}
		parent.ok("POST", "/cases/"+id+"/action", map[string]any{"action": "claim", "version": 1, "body": ""}, 403)
		support.ok("POST", "/cases/"+id+"/action", map[string]any{"action": "claim", "version": 1, "body": ""}, 200)
		assigned := support.ok("GET", "/cases/"+id, nil, 200)["case"].(map[string]any)
		if assigned["body"] == "" || assigned["canManage"] != true {
			t.Fatal("claim did not grant assigned access")
		}
	})
	t.Run("assigned operator replies with stale-write protection and requester reopens", func(t *testing.T) {
		id := v["id"].(string)
		body := map[string]any{"action": "reply", "version": 2, "body": "We have reviewed this development request and need more detail."}
		support.ok("POST", "/cases/"+id+"/action", body, 200)
		support.ok("POST", "/cases/"+id+"/action", body, 409)
		detail := parent.ok("GET", "/cases/"+id, nil, 200)
		messages := detail["messages"].(map[string]any)["items"].([]any)
		if len(messages) != 1 {
			t.Fatal("reply missing")
		}
		support.ok("POST", "/cases/"+id+"/action", map[string]any{"action": "resolve", "version": 3, "body": "The requested guidance is recorded in this development response."}, 200)
		parent.ok("POST", "/cases/"+id+"/action", map[string]any{"action": "reply", "version": 4, "body": "Closed requests require reopening first."}, 403)
		parent.ok("POST", "/cases/"+id+"/action", map[string]any{"action": "reopen", "version": 4, "body": "The family needs an additional explanation before closure."}, 200)
	})
	t.Run("safeguarding cannot be browsed or claimed by ordinary support", func(t *testing.T) {
		safe := create("safeguarding", "case-safeguarding-request")
		id := safe["id"].(string)
		support.ok("GET", "/cases/"+id, nil, 404)
		support.ok("POST", "/cases/"+id+"/action", map[string]any{"action": "claim", "version": 1, "body": ""}, 404)
		page := support.ok("GET", "/cases", nil, 200)
		for _, raw := range page["items"].([]any) {
			if raw.(map[string]any)["id"] == id {
				t.Fatal("safeguarding leaked in support list")
			}
		}
		triage := admin.ok("GET", "/cases/"+id, nil, 200)["case"].(map[string]any)
		if triage["body"] != "" {
			t.Fatal("unclaimed safeguarding body exposed")
		}
		admin.ok("POST", "/cases/"+id+"/action", map[string]any{"action": "claim", "version": 1, "body": ""}, 200)
		admin.ok("POST", "/cases/"+id+"/action", map[string]any{"action": "reply", "version": 2, "body": "The assigned administrator has recorded this restricted development concern."}, 200)
		parent.ok("GET", "/cases/"+id, nil, 200)
	})
	t.Run("privacy request is persisted without claiming deletion", func(t *testing.T) {
		privacy := create("privacy_deletion", "privacy-delete-request")
		if privacy["status"] != "open" {
			t.Fatal("privacy request auto-completed")
		}
		parent.ok("GET", "/auth/session", nil, 200)
	})
}
