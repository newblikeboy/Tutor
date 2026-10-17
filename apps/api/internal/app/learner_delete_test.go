package app

import (
	"context"
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

	"go.mongodb.org/mongo-driver/v2/bson"
)

func TestDeleteLearnerProfiles(t *testing.T) {
	uri := os.Getenv("TEST_MONGODB_URI")
	if uri == "" {
		t.Skip("TEST_MONGODB_URI required for learner deletion persistence tests")
	}
	t.Setenv("SEED_PASSWORD", testPassword)
	ctx := context.Background()
	s, err := storage.Connect(ctx, uri, "tutor_test_learner_delete_"+token()[:12])
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
	first := httptest.NewServer(New(s, cfg).Routes())
	defer first.Close()
	second := httptest.NewServer(New(s, cfg).Routes())
	defer second.Close()
	client := func(id, base string) *testClient {
		jar, _ := cookiejar.New(nil)
		c := &testClient{t: t, http: &http.Client{Jar: jar, Timeout: 20 * time.Second}, base: base}
		c.login(id)
		return c
	}
	parent, other, tutor := client("parent-a", first.URL), client("parent-b", first.URL), client("tutor-meera", first.URL)
	booking := client("parent-a", second.URL)
	create := func() string {
		return parent.ok("POST", "/learners", LearnerInput{Name: "Fictional removable learner", Class: 8, Board: "CBSE", Language: "English", Kind: "adult_self"}, 201)["id"].(string)
	}
	version := map[string]any{"expectedVersion": 1}
	count := func(collection string, filter bson.M) int64 {
		n, err := s.C(collection).CountDocuments(ctx, filter)
		if err != nil {
			t.Fatal(err)
		}
		return n
	}
	id := create()
	other.ok("DELETE", "/learners/"+id, version, 404)
	tutor.ok("DELETE", "/learners/"+id, version, 403)
	if status, _, _ := parent.call("DELETE", "/learners/"+id, version, map[string]string{"X-CSRF-Token": "invalid"}); status != 403 {
		t.Fatal("CSRF bypass", status)
	}
	parent.ok("DELETE", "/learners/"+id, map[string]any{}, 422)
	parent.ok("DELETE", "/learners/"+id, map[string]any{"expectedVersion": -1}, 422)
	if v := parent.ok("DELETE", "/learners/"+id, map[string]any{"expectedVersion": 0}, 409); v["code"] != "learner_delete_stale" {
		t.Fatal(v)
	}
	parent.ok("POST", "/requirements", map[string]any{"learnerId": id, "goal": "Fictional unbooked learning request", "locality": "Purnea"}, 201)
	parent.ok("PUT", "/draft", map[string]any{"step": 2, "learnerId": id, "goal": "Fictional matching draft", "locality": "Purnea"}, 200)
	parent.ok("DELETE", "/learners/"+id, version, 200)
	parent.ok("GET", "/learners/"+id, nil, 404)
	parent.ok("DELETE", "/learners/"+id, version, 404)
	for _, collection := range []string{"learners", "requirements", "drafts"} {
		filter := bson.M{"learnerId": id}
		if collection == "learners" {
			filter = bson.M{"_id": id}
		}
		if count(collection, filter) != 0 {
			t.Fatal("deleted learner setup remains", collection)
		}
	}
	if count("audit", bson.M{"action": "learner.deleted", "target": id}) != 1 {
		t.Fatal("deletion must audit once")
	}
	for _, status := range []string{"requested", "confirmed", "completed", "reviewed", "cancelled", "declined"} {
		id := create()
		trial := domain.Trial{ID: token(), OwnerID: "parent-a", LearnerID: id, TutorID: "tutor-meera", Status: status, Start: time.Now(), End: time.Now().Add(time.Hour)}
		if _, err := s.C("trials").InsertOne(ctx, trial); err != nil {
			t.Fatal(err)
		}
		if v := parent.ok("DELETE", "/learners/"+id, version, 409); v["code"] != "learner_in_use" {
			t.Fatal(v)
		}
		if count("learners", bson.M{"_id": id}) != 1 || count("trials", bson.M{"_id": trial.ID}) != 1 || count("audit", bson.M{"action": "learner.deleted", "target": id}) != 0 {
			t.Fatal("trial history changed", status)
		}
	}
	for _, status := range []string{"active", "paused", "awaiting_payment", "pending_tutor_acceptance", "completed", "cancelled", "expired"} {
		id := create()
		en := domain.Enrollment{ID: token(), OwnerID: "parent-a", LearnerID: id, TutorID: "tutor-meera", MentorID: "mentor-a", Status: status, Version: 1}
		if _, err := s.C("enrollments").InsertOne(ctx, en); err != nil {
			t.Fatal(err)
		}
		parent.ok("DELETE", "/learners/"+id, version, 409)
		if count("learners", bson.M{"_id": id}) != 1 || count("enrollments", bson.M{"_id": en.ID}) != 1 {
			t.Fatal("booking history changed", status)
		}
	}
	// Two independent API instances contend on the learner document. A committed
	// trial always retains its learner; a successful deletion prevents booking.
	bookedID := create()
	if status, _, raw := booking.call("POST", "/trials", map[string]any{"learnerId": bookedID, "tutorId": "tutor-meera", "subjects": []string{"Mathematics"}, "mode": "online", "start": time.Now().Add(2 * 24 * time.Hour), "termsAccepted": true}, map[string]string{"Idempotency-Key": token()}); status != 201 {
		t.Fatalf("trial prerequisite: %d %s", status, raw)
	}
	parent.ok("DELETE", "/learners/"+bookedID, version, 409)
	for i := 0; i < 8; i++ {
		id := create()
		var wait sync.WaitGroup
		start := make(chan struct{})
		var deleted, booked int
		wait.Add(2)
		go func() {
			defer wait.Done()
			<-start
			deleted, _, _ = parent.call("DELETE", "/learners/"+id, version, nil)
		}()
		go func() {
			defer wait.Done()
			<-start
			booked, _, _ = booking.call("POST", "/trials", map[string]any{"learnerId": id, "tutorId": "tutor-meera", "subjects": []string{"Mathematics"}, "mode": "online", "start": time.Now().Add(time.Duration(3+i) * 24 * time.Hour), "termsAccepted": true}, map[string]string{"Idempotency-Key": token()})
		}()
		close(start)
		wait.Wait()
		learners, trials := count("learners", bson.M{"_id": id}), count("trials", bson.M{"learnerId": id})
		if !((deleted == 200 && booked == 404 && learners == 0 && trials == 0) || (deleted == 409 && booked == 201 && learners == 1 && trials == 1)) {
			t.Fatalf("delete/booking race: delete=%d book=%d learners=%d trials=%d", deleted, booked, learners, trials)
		}
	}
}
