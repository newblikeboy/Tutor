package app

import (
	"context"
	"fmt"
	"go.mongodb.org/mongo-driver/v2/bson"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"testing"
	"time"
	"tutorplatform/internal/config"
	"tutorplatform/internal/domain"
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
		if triage["canClaim"] != true || triage["canReopen"] != false {
			t.Fatal("incorrect unassigned ticket actions")
		}
		privateSearch := support.ok("GET", "/cases?q=Private", nil, 200)
		if len(privateSearch["items"].([]any)) != 0 || privateSearch["counts"].(map[string]any)["all"] != float64(0) {
			t.Fatal("search exposed a redacted title")
		}
		owned := parent.ok("GET", "/cases?q=Private", nil, 200)
		if len(owned["items"].([]any)) != 1 || owned["counts"].(map[string]any)["all"] != float64(1) {
			t.Fatal("requester title search failed")
		}
		otherPage := other.ok("GET", "/cases?q=Private", nil, 200)
		if otherPage["counts"].(map[string]any)["all"] != float64(0) {
			t.Fatal("counts crossed requester boundary")
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
		support.ok("POST", "/cases/"+id+"/action", map[string]any{"action": "waiting_family", "version": 5, "body": "Please provide the specific class date so that we can help."}, 200)
		waiting := parent.ok("GET", "/cases?status=waiting_family", nil, 200)
		if waiting["counts"].(map[string]any)["waiting_family"] != float64(1) {
			t.Fatal("waiting count missing")
		}
		parent.ok("POST", "/cases/"+id+"/action", map[string]any{"action": "reply", "version": 6, "body": "The affected class is next Tuesday at the agreed time."}, 200)
		answered := parent.ok("GET", "/cases/"+id, nil, 200)
		if answered["case"].(map[string]any)["status"] != "assigned" {
			t.Fatal("answered ticket still waiting for requester")
		}
		replies := answered["messages"].(map[string]any)["items"].([]any)
		last := replies[len(replies)-1].(map[string]any)
		if last["fromRequester"] != true || last["action"] != "reply" {
			t.Fatal("response provenance missing")
		}
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
	t.Run("filters and latest-first pagination remain bounded and private", func(t *testing.T) {
		parent.ok("GET", "/cases?status=invalid", nil, 422)
		parent.ok("GET", "/cases?kind=invalid", nil, 422)
		parent.ok("GET", "/cases?cursor=invalid", nil, 422)
		var fixtures []any
		for i := 0; i < 32; i++ {
			fixtures = append(fixtures, domain.ServiceCase{ID: fmt.Sprintf("page-ticket-%03d", i), OwnerID: "parent-a", Kind: "support", Title: "Pagination fixture", Body: "Fictional pagination ticket details.", Status: "open", Version: 1, CreatedAt: a.Now(), UpdatedAt: time.Date(2030, 1, 1, 0, 0, 0, 0, time.UTC)})
		}
		if _, err := s.C("cases").InsertMany(ctx, fixtures); err != nil {
			t.Fatal(err)
		}
		first := parent.ok("GET", "/cases?q=Pagination&kind=support&status=active", nil, 200)
		items := first["items"].([]any)
		if len(items) != 25 || items[0].(map[string]any)["id"] != "page-ticket-031" || first["counts"].(map[string]any)["all"] != float64(32) {
			t.Fatal("first ticket page or global filtered counts incorrect")
		}
		second := parent.ok("GET", "/cases?q=Pagination&kind=support&status=active&cursor="+first["nextCursor"].(string), nil, 200)
		if len(second["items"].([]any)) != 7 || second["nextCursor"] != "" || second["items"].([]any)[0].(map[string]any)["id"] != "page-ticket-006" {
			t.Fatal("ticket cursor lost or duplicated records")
		}
		var messages []any
		for i := 0; i < 28; i++ {
			messages = append(messages, domain.CaseMessage{ID: fmt.Sprintf("page-reply-%03d", i), CaseID: "page-ticket-031", AuthorID: "parent-a", AuthorName: "Sample family A", AuthorRole: "parent", Body: "A fictional reply in the retained conversation.", CreatedAt: a.Now()})
		}
		if _, err := s.C("case_messages").InsertMany(ctx, messages); err != nil {
			t.Fatal(err)
		}
		latest := parent.ok("GET", "/cases/page-ticket-031", nil, 200)["messages"].(map[string]any)
		replies := latest["items"].([]any)
		if len(replies) != 25 || replies[0].(map[string]any)["id"] != "page-reply-003" || replies[24].(map[string]any)["id"] != "page-reply-027" {
			t.Fatal("latest replies not shown chronologically")
		}
		older := parent.ok("GET", "/cases/page-ticket-031?cursor="+latest["nextCursor"].(string), nil, 200)["messages"].(map[string]any)
		if len(older["items"].([]any)) != 3 || older["nextCursor"] != "" {
			t.Fatal("earlier replies missing")
		}
		other.ok("GET", "/cases/page-ticket-031", nil, 404)
		if n, err := s.C("case_messages").CountDocuments(ctx, bson.M{"caseId": "page-ticket-031"}); err != nil || n != 28 {
			t.Fatal("pagination mutated conversation", err)
		}
	})
}
