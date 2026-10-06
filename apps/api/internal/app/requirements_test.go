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

func TestDeleteLearningNeeds(t *testing.T) {
	uri := os.Getenv("TEST_MONGODB_URI")
	if uri == "" {
		t.Skip("TEST_MONGODB_URI required for learning need persistence tests")
	}
	t.Setenv("SEED_PASSWORD", testPassword)
	ctx := context.Background()
	s, err := storage.Connect(ctx, uri, "tutor_test_needs_"+token()[:12])
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
	server := httptest.NewServer(New(s, cfg).Routes())
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
	booking := client("parent-a", second.URL)
	learner := parent.ok("POST", "/learners", LearnerInput{Name: "Fictional adult learner", Class: 8, Board: "CBSE", Language: "English", Kind: "adult_self"}, 201)["id"].(string)
	create := func() string {
		return parent.ok("POST", "/requirements", map[string]any{"learnerId": learner, "goal": "Practise fractions with confidence", "locality": "Purnea"}, 201)["id"].(string)
	}
	count := func(collection string, filter bson.M) int64 {
		n, err := s.C(collection).CountDocuments(ctx, filter)
		if err != nil {
			t.Fatal(err)
		}
		return n
	}
	id := create()
	other.ok("DELETE", "/requirements/"+id, nil, 404)
	tutor.ok("DELETE", "/requirements/"+id, nil, 403)
	csrfStatus, _, _ := parent.call("DELETE", "/requirements/"+id, nil, map[string]string{"X-CSRF-Token": "invalid"})
	if csrfStatus != 403 {
		t.Fatal("missing CSRF enforcement", csrfStatus)
	}
	if count("requirements", bson.M{"_id": id}) != 1 {
		t.Fatal("unauthorised deletion")
	}
	parent.ok("DELETE", "/requirements/"+id, nil, 200)
	parent.ok("DELETE", "/requirements/"+id, nil, 404)
	if count("requirements", bson.M{"_id": id}) != 0 || count("audit", bson.M{"action": "requirement.deleted", "target": id}) != 1 {
		t.Fatal("delete and audit did not persist exactly once")
	}
	if count("learners", bson.M{"_id": learner}) != 1 {
		t.Fatal("learner was removed")
	}
	for _, status := range []string{"requested", "confirmed", "completed", "reviewed", "cancelled", "declined"} {
		id := create()
		trial := domain.Trial{ID: token(), OwnerID: "parent-a", LearnerID: learner, RequirementID: id, TutorID: "tutor-meera", Status: status, Start: time.Now(), End: time.Now().Add(time.Hour)}
		if _, err = s.C("trials").InsertOne(ctx, trial); err != nil {
			t.Fatal(err)
		}
		got := parent.ok("DELETE", "/requirements/"+id, nil, 409)
		if got["code"] != "requirement_in_use" {
			t.Fatal(got)
		}
		if count("requirements", bson.M{"_id": id}) != 1 || count("trials", bson.M{"_id": trial.ID}) != 1 || count("audit", bson.M{"action": "requirement.deleted", "target": id}) != 0 {
			t.Fatalf("%s history was changed", status)
		}
	}
	trialInput := func(id string) map[string]any {
		return map[string]any{"requirementId": id, "tutorId": "tutor-meera", "start": time.Now().Add(24 * time.Hour), "termsAccepted": true}
	}
	// Confirm the booking fixture is eligible before testing the race.
	booked := create()
	status, body, _ := booking.call("POST", "/trials", trialInput(booked), map[string]string{"Idempotency-Key": token()})
	if status != 201 {
		t.Fatal(status, body)
	}
	parent.ok("DELETE", "/requirements/"+booked, nil, 409)
	for i := 0; i < 10; i++ {
		id := create()
		var wait sync.WaitGroup
		start := make(chan struct{})
		var deleted, booked int
		wait.Add(2)
		go func() {
			defer wait.Done()
			<-start
			deleted, _, _ = parent.call("DELETE", "/requirements/"+id, nil, nil)
		}()
		go func() {
			defer wait.Done()
			<-start
			booked, _, _ = booking.call("POST", "/trials", trialInput(id), map[string]string{"Idempotency-Key": token()})
		}()
		close(start)
		wait.Wait()
		needs, trials := count("requirements", bson.M{"_id": id}), count("trials", bson.M{"requirementId": id})
		if !((deleted == 200 && booked == 404 && needs == 0 && trials == 0) || (deleted == 409 && booked == 201 && needs == 1 && trials == 1)) {
			t.Fatalf("race: delete=%d booking=%d needs=%d trials=%d", deleted, booked, needs, trials)
		}
	}
}
