package app

import (
	"context"
	"go.mongodb.org/mongo-driver/v2/bson"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"sync"
	"testing"
	"time"
	"tutorplatform/internal/config"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
)

func TestLearnerProfiles(t *testing.T) {
	uri := os.Getenv("TEST_MONGODB_URI")
	if uri == "" {
		t.Skip("TEST_MONGODB_URI required for learner persistence tests")
	}
	t.Setenv("SEED_PASSWORD", testPassword)
	ctx := context.Background()
	s, err := storage.Connect(ctx, uri, "tutor_test_learners_"+token()[:12])
	if err != nil {
		t.Fatal(err)
	}
	defer s.Client.Disconnect(ctx)
	if err = s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	if err = s.Seed(ctx, "test"); err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{Env: "test", AuthProvider: "password", Origin: "http://test.local"}
	a := New(s, cfg)
	server := httptest.NewServer(a.Routes())
	defer server.Close()
	second := httptest.NewServer(New(s, cfg).Routes())
	defer second.Close()
	client := func(id, base string) *testClient {
		jar, _ := cookiejar.New(nil)
		c := &testClient{t: t, http: &http.Client{Jar: jar, Timeout: 20 * time.Second}, base: base}
		c.login(id)
		return c
	}
	parent := client("parent-a", server.URL)
	other := client("parent-b", server.URL)
	tutor := client("tutor-meera", server.URL)
	retry := client("parent-a", second.URL)
	consent := parent.ok("POST", "/consents", map[string]any{"relationship": "legal_guardian", "accepted": true}, 201)
	body := LearnerInput{Name: " Fictional learner ", Class: 1, Board: "CBSE", Language: "English", Kind: "minor", ConsentID: consent["id"].(string)}
	parent.ok("POST", "/learners", LearnerInput{Name: "No consent", Class: 12, Board: "ICSE", Language: "English", Kind: "minor"}, 403)
	other.ok("POST", "/learners", body, 403)
	tutor.ok("POST", "/learners", body, 403)
	key := map[string]string{"Idempotency-Key": token()}
	var wait sync.WaitGroup
	ids := make(chan string, 2)
	for _, c := range []*testClient{parent, retry} {
		wait.Add(1)
		go func(c *testClient) {
			defer wait.Done()
			status, v, raw := c.call("POST", "/learners", body, key)
			if status != 201 {
				t.Errorf("concurrent create %d: %s", status, raw)
				return
			}
			ids <- v["id"].(string)
		}(c)
	}
	wait.Wait()
	close(ids)
	var id string
	for got := range ids {
		if id != "" && id != got {
			t.Fatal("retry created a second learner")
		}
		id = got
	}
	if id == "" {
		t.Fatal("create failed")
	}
	count, err := s.C("learners").CountDocuments(ctx, bson.M{"ownerId": "parent-a"})
	if err != nil || count != 1 {
		t.Fatalf("learner count %d: %v", count, err)
	}
	saved := parent.ok("GET", "/learners/"+id, nil, 200)
	if saved["name"] != "Fictional learner" {
		t.Fatal("name not normalized")
	}
	changed := body
	changed.Class = 12
	if status, _, _ := parent.call("POST", "/learners", changed, key); status != 409 {
		t.Fatal("changed retry accepted")
	}
	if status, _, _ := parent.call("POST", "/learners", body, map[string]string{"Idempotency-Key": ""}); status != 422 {
		t.Fatal("missing retry key accepted")
	}
	update := map[string]any{"name": "Corrected fictional learner", "class": 12, "board": "BSEB", "language": "Hindi", "expectedVersion": 1}
	other.ok("PUT", "/learners/"+id, update, 404)
	tutor.ok("PUT", "/learners/"+id, update, 403)
	parent.ok("PUT", "/learners/"+id, update, 200)
	parent.ok("PUT", "/learners/"+id, update, 409)
	saved = parent.ok("GET", "/learners/"+id, nil, 200)
	if saved["class"] != float64(12) || saved["kind"] != "minor" {
		t.Fatal("edit did not persist or changed relationship")
	}
	for _, class := range []int{0, 13} {
		invalid := body
		invalid.Class = class
		parent.ok("POST", "/learners", invalid, 422)
	}
	adult := body
	adult.Kind = "adult_self"
	adult.ConsentID = ""
	adult.Class = 12
	parent.ok("POST", "/learners", adult, 201)
	// Existing profiles without a version can be edited once using version zero.
	_, err = s.C("learners").UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$unset": bson.M{"version": ""}})
	if err != nil {
		t.Fatal(err)
	}
	update["expectedVersion"] = 0
	parent.ok("PUT", "/learners/"+id, update, 200)
	// Separate draft keys preserve a matching draft while a new learner is being entered.
	parent.ok("PUT", "/draft", map[string]any{"step": 2, "learnerId": id, "goal": "Existing learning request", "locality": "Purnea"}, 200)
	draft := learnerDraft{LearnerInput: body, Step: 2, RequestID: token(), Version: 0}
	first := parent.ok("PUT", "/learner-draft", draft, 200)
	replay := parent.ok("PUT", "/learner-draft", draft, 200)
	if first["version"] != replay["version"] {
		t.Fatal("draft retry changed version")
	}
	got := parent.ok("GET", "/learner-draft", nil, 200)
	if got["name"] != body.Name {
		t.Fatal("draft missing")
	}
	if status, _, raw := other.call("GET", "/learner-draft", nil, nil); status != 200 || string(raw) != "null\n" {
		t.Fatalf("other owner draft %s", raw)
	}
	other.ok("PUT", "/learner-draft", draft, 403)
	draft.Name = "Conflicting draft"
	parent.ok("PUT", "/learner-draft", draft, 409)
	parent.ok("DELETE", "/learner-draft", map[string]string{"requestId": "unrelated-key"}, 200)
	got = parent.ok("GET", "/learner-draft", nil, 200)
	if got["name"] != body.Name {
		t.Fatal("wrong draft discarded")
	}
	parent.ok("DELETE", "/learner-draft", map[string]string{"requestId": draft.RequestID}, 200)
	dashboard := parent.ok("GET", "/dashboard", nil, 200)
	if dashboard["draft"].(map[string]any)["goal"] != "Existing learning request" {
		t.Fatal("learner draft overwrote matching draft")
	}
	// Editing never rewrites saved trial or agreement snapshots.
	_, err = s.C("trials").InsertOne(ctx, domain.Trial{ID: token(), OwnerID: "parent-a", TutorID: "tutor-meera", LearnerID: id, LearnerName: "Original snapshot", Class: 8, Status: "reviewed", Start: time.Now(), End: time.Now().Add(time.Hour)})
	if err != nil {
		t.Fatal(err)
	}
	update["expectedVersion"] = 1
	update["class"] = 5
	parent.ok("PUT", "/learners/"+id, update, 200)
	trial, err := storage.One[domain.Trial](ctx, s, "trials", bson.M{"learnerId": id})
	if err != nil || trial.Class != 8 || trial.LearnerName != "Original snapshot" {
		t.Fatal("historical snapshot changed")
	}
}

func TestProductionLearnerConsentGate(t *testing.T) {
	a := New(nil, config.Config{Env: "production"})
	if err := a.checkLearnerConsent(context.Background(), "parent", LearnerInput{Kind: "minor"}); err == nil {
		t.Fatal("production guardian gate bypassed")
	}
	if err := a.checkLearnerConsent(context.Background(), "parent", LearnerInput{Kind: "adult_self"}); err != nil {
		t.Fatal(err)
	}
}
