package app

import (
	"context"
	"encoding/json"
	"go.mongodb.org/mongo-driver/v2/bson"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"
	"tutorplatform/internal/config"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
)

func TestUpdatesInbox(t *testing.T) {
	uri := os.Getenv("TEST_MONGODB_URI")
	if uri == "" {
		t.Skip("TEST_MONGODB_URI required for inbox integration")
	}
	t.Setenv("SEED_PASSWORD", testPassword)
	ctx := context.Background()
	s, err := storage.Connect(ctx, uri, "tutor_test_inbox_"+token()[:12])
	if err != nil {
		t.Fatal(err)
	}
	defer s.Client.Disconnect(ctx)
	if err = s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	if err = s.MigrateInbox(ctx); err != nil {
		t.Fatal(err)
	}
	if err = s.Seed(ctx, "test"); err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{Env: "test", AuthProvider: "password", Origin: "http://test.local"}
	a := New(s, cfg)
	srv := httptest.NewServer(a.Routes())
	defer srv.Close()
	srv2 := httptest.NewServer(New(s, cfg).Routes())
	defer srv2.Close()
	client := func(id, base string) *testClient {
		jar, _ := cookiejar.New(nil)
		c := &testClient{t: t, http: &http.Client{Jar: jar, Timeout: 30 * time.Second}, base: base}
		c.login(id)
		return c
	}
	admin := client("admin-a", srv.URL)
	admin2 := client("admin-a", srv2.URL)
	parent := client("parent-a", srv.URL)
	other := client("parent-b", srv.URL)
	tutor := client("tutor-meera", srv.URL)
	applicant := client("tutor-a", srv.URL)
	finance := client("finance-a", srv.URL)

	makeInput := func(to, enrollment string) domain.InboxInput {
		return domain.InboxInput{Nonce: token()[:32], RecipientID: to, EnrollmentID: enrollment, Subject: "Learning review", Body: "Fictional update: fractions are progressing."}
	}
	deliver := func(c *testClient, v domain.InboxInput, key string, want int) domain.InboxUpdate {
		t.Helper()
		status, _, raw := c.call("POST", "/inbox", v, map[string]string{"Idempotency-Key": key})
		if status != want {
			t.Fatalf("send expected %d got %d: %s", want, status, raw)
		}
		var result domain.InboxUpdate
		_ = json.Unmarshal(raw, &result)
		return result
	}
	t.Run("no activation required and retired crypto records remain untouched", func(t *testing.T) {
		if _, e := s.C("inbox_updates").InsertOne(ctx, bson.M{"_id": "legacy-ciphertext", "ciphertext": "retained encrypted fixture", "recipientId": "parent-a", "readAt": nil}); e != nil {
			t.Fatal(e)
		}
		if e := s.MigrateInbox(ctx); e != nil {
			t.Fatal(e)
		}
		n, e := s.C("inbox_updates").CountDocuments(ctx, bson.M{"_id": "legacy-ciphertext", "ciphertext": "retained encrypted fixture"})
		if e != nil || n != 1 {
			t.Fatal("legacy records altered")
		}
		if parent.ok("GET", "/inbox/status", nil, 200)["unreadCount"] != float64(0) {
			t.Fatal("legacy ciphertext mixed into new inbox")
		}
		admin.ok("GET", "/inbox/key", nil, 404)
		admin.ok("POST", "/inbox/key", map[string]any{}, 405)
		admin.ok("POST", "/inbox/devices/link", map[string]any{}, 404)
		finance.ok("GET", "/inbox", nil, 403)
		parent.ok("GET", "/inbox/recipients", nil, 403)
		list := admin.ok("GET", "/inbox/recipients?role=parent&search=Sample", nil, 200)
		if strings.Contains(toJSON(list), "email") || strings.Contains(toJSON(list), "ready") {
			t.Fatal("recipient directory leaked contact or activation fields")
		}
		deliver(admin, makeInput("parent-b", ""), "no-activation-needed", 201)
	})
	var update domain.InboxUpdate
	t.Run("cross-instance retries preserve one update and validate content", func(t *testing.T) {
		v := makeInput("parent-a", "")
		var results [2]domain.InboxUpdate
		var wg sync.WaitGroup
		wg.Add(2)
		for i, c := range []*testClient{admin, admin2} {
			go func(i int, c *testClient) { defer wg.Done(); results[i] = deliver(c, v, "same-plain-update", 201) }(i, c)
		}
		wg.Wait()
		if results[0].ID == "" || results[0].ID != results[1].ID {
			t.Fatal("duplicate update after retry")
		}
		update = results[0]
		if update.Subject != v.Subject || update.Body != v.Body {
			t.Fatal("message content not persisted")
		}
		v.Body = "Different message"
		deliver(admin, v, "same-plain-update", 409)
		v = makeInput("parent-a", "")
		v.Subject = "   "
		deliver(admin, v, "empty-subject-test", 422)
		v.Subject = strings.Repeat("a", 121)
		deliver(admin, v, "long-subject-test", 422)
		v.Subject = "valid"
		v.Body = strings.Repeat("a", 3001)
		deliver(admin, v, "long-body-test", 422)
		admin.ok("POST", "/inbox", map[string]any{"ciphertext": "obsolete protocol", "signature": "not accepted"}, 422)
		parent.ok("POST", "/inbox", makeInput("tutor-a", ""), 403)
		admin.ok("POST", "/inbox", makeInput("parent-a", ""), 422)
		status, _, _ := admin.call("POST", "/inbox", makeInput("parent-a", ""), map[string]string{"Idempotency-Key": "csrf-send-test", "X-CSRF-Token": "wrong"})
		if status != 403 {
			t.Fatal("send CSRF bypass")
		}
	})
	t.Run("only the recipient can mark read and reads are durable and idempotent", func(t *testing.T) {
		if parent.ok("GET", "/inbox/status", nil, 200)["unreadCount"] != float64(1) {
			t.Fatal("missing unread")
		}
		parent.ok("GET", "/inbox", nil, 200)
		parent.ok("GET", "/inbox/"+update.ID, nil, 200)
		if parent.ok("GET", "/inbox/status", nil, 200)["unreadCount"] != float64(1) {
			t.Fatal("fetch marked read")
		}
		path := "/inbox/" + update.ID + "/read"
		other.ok("GET", "/inbox/"+update.ID, nil, 404)
		other.ok("POST", path, map[string]any{}, 404)
		admin.ok("POST", path, map[string]any{}, 403)
		finance.ok("GET", "/inbox/"+update.ID, nil, 403)
		status, _, _ := parent.call("POST", path, map[string]any{}, map[string]string{"X-CSRF-Token": "wrong"})
		if status != 403 {
			t.Fatal("read CSRF bypass")
		}
		parent.ok("POST", path, map[string]any{"readAt": "forged"}, 422)
		parent.ok("POST", path, map[string]any{}, 200)
		first := parent.ok("GET", "/inbox/"+update.ID, nil, 200)["message"].(map[string]any)["readAt"]
		parent.ok("POST", path, map[string]any{}, 200)
		second := admin2.ok("GET", "/inbox/"+update.ID, nil, 200)["message"].(map[string]any)["readAt"]
		if first == nil || first != second {
			t.Fatal("read timestamp changed")
		}
		if parent.ok("GET", "/inbox/status", nil, 200)["unreadCount"] != float64(0) {
			t.Fatal("unread count not updated")
		}
	})
	t.Run("applicants receive administrative updates but cannot send family updates", func(t *testing.T) {
		v := deliver(admin, makeInput("tutor-a", ""), "admin-applicant-update", 201)
		applicant.ok("GET", "/inbox/"+v.ID, nil, 200)
		applicant.ok("POST", "/inbox/"+v.ID+"/read", map[string]any{}, 200)
		deliver(applicant, makeInput("parent-a", "absent"), "applicant-denied", 403)
	})
	t.Run("tutor assignment, revocation and suspension boundaries remain enforced", func(t *testing.T) {
		enrollment := domain.Enrollment{ID: "inbox-assignment", OwnerID: "parent-a", TutorID: "tutor-meera", MentorID: "mentor-a", LearnerID: "fictional-learner", Status: "active", Version: 1}
		if _, e := s.C("enrollments").InsertOne(ctx, enrollment); e != nil {
			t.Fatal(e)
		}
		deliver(tutor, makeInput("parent-b", enrollment.ID), "foreign-family-denied", 404)
		v := deliver(tutor, makeInput("parent-a", enrollment.ID), "assigned-family-update", 201)
		if _, e := s.C("enrollments").UpdateOne(ctx, bson.M{"_id": enrollment.ID}, bson.M{"$set": bson.M{"ownerId": "parent-b"}}); e != nil {
			t.Fatal(e)
		}
		tutor.ok("GET", "/inbox/"+v.ID, nil, 404)
		if len(tutor.ok("GET", "/inbox?folder=sent", nil, 200)["items"].([]any)) != 0 {
			t.Fatal("list exposed former owner's message content")
		}
		if _, e := s.C("enrollments").UpdateOne(ctx, bson.M{"_id": enrollment.ID}, bson.M{"$set": bson.M{"ownerId": "parent-a"}}); e != nil {
			t.Fatal(e)
		}
		if _, e := s.C("enrollments").UpdateOne(ctx, bson.M{"_id": enrollment.ID}, bson.M{"$set": bson.M{"tutorId": "tutor-arjun"}}); e != nil {
			t.Fatal(e)
		}
		tutor.ok("GET", "/inbox/"+v.ID, nil, 404)
		parent.ok("GET", "/inbox/"+v.ID, nil, 200)
		if len(tutor.ok("GET", "/inbox?folder=sent", nil, 200)["items"].([]any)) != 0 {
			t.Fatal("old tutor retained sent access")
		}
		deliver(tutor, makeInput("parent-a", enrollment.ID), "old-assignment-denied", 404)
		if _, e := s.C("enrollments").UpdateOne(ctx, bson.M{"_id": enrollment.ID}, bson.M{"$set": bson.M{"tutorId": "tutor-meera"}}); e != nil {
			t.Fatal(e)
		}
		if _, e := s.C("applications").UpdateOne(ctx, bson.M{"_id": "tutor-meera"}, bson.M{"$set": bson.M{"status": "suspended"}}); e != nil {
			t.Fatal(e)
		}
		tutor.ok("GET", "/inbox/"+v.ID, nil, 404)
		deliver(tutor, makeInput("parent-a", enrollment.ID), "suspended-denied", 403)
	})
	t.Run("bounded pagination and cross-household isolation", func(t *testing.T) {
		for i := 0; i < 28; i++ {
			v := update
			v.ID = a.chronologicalID()
			v.Nonce = token()[:32]
			if _, e := s.C("inbox_messages").InsertOne(ctx, v); e != nil {
				t.Fatal(e)
			}
		}
		page := parent.ok("GET", "/inbox", nil, 200)
		if len(page["items"].([]any)) != 25 || page["nextCursor"] == "" {
			t.Fatal("unbounded page")
		}
		next := parent.ok("GET", "/inbox?cursor="+page["nextCursor"].(string), nil, 200)
		if len(next["items"].([]any)) != 5 {
			t.Fatal("pagination lost updates")
		}
		if len(other.ok("GET", "/inbox", nil, 200)["items"].([]any)) != 1 {
			t.Fatal("foreign household leakage")
		}
	})
}
func toJSON(value any) string { b, _ := json.Marshal(value); return string(b) }
