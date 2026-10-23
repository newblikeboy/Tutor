package app

import (
	"context"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
)

func TestMongoAutomaticTrialCompletion(t *testing.T) {
	a, s, cfg := emailQueueFixture(t)
	ctx := context.Background()
	base := time.Now().UTC().Truncate(time.Millisecond)
	var clock atomic.Int64
	clock.Store(base.UnixMilli())
	a.Now = func() time.Time { return time.UnixMilli(clock.Load()).UTC() }
	a2 := New(s, cfg)
	a2.Now, a2.Mail = a.Now, a.Mail
	srv := httptest.NewServer(a.Routes())
	defer srv.Close()
	client := func(id string) *testClient {
		jar, _ := cookiejar.New(nil)
		c := &testClient{t: t, http: &http.Client{Jar: jar, Timeout: 30 * time.Second}, base: srv.URL}
		c.login(id)
		return c
	}
	parent, other, tutor, mentor := client("parent-a"), client("parent-b"), client("tutor-arjun"), client("mentor-a")
	put := func(id, status string, end time.Time) domain.Trial {
		v := domain.Trial{ID: id, OwnerID: "parent-a", TutorID: "tutor-arjun", MentorID: "mentor-a", LearnerID: "fictional-learner", LearnerName: "Fictional learner", Subject: "Mathematics", Subjects: []string{"Mathematics"}, Class: 8, Mode: "home", Status: status, Start: end.Add(-time.Hour), End: end, Version: 7}
		if _, err := s.C("trials").InsertOne(ctx, v); err != nil {
			t.Fatal(err)
		}
		return v
	}
	read := func(id string) domain.Trial {
		v, err := storage.One[domain.Trial](ctx, s, "trials", bson.M{"_id": id})
		if err != nil {
			t.Fatal(err)
		}
		return v
	}
	count := func(col string, filter bson.M) int64 {
		n, err := s.C(col).CountDocuments(ctx, filter)
		if err != nil {
			t.Fatal(err)
		}
		return n
	}
	boundary := put("boundary", "confirmed", base.Add(time.Second))
	if _, err := s.C("trials").UpdateOne(ctx, bson.M{"_id": boundary.ID}, bson.M{"$set": bson.M{"retainedMetadata": "keep"}}); err != nil {
		t.Fatal(err)
	}
	for _, status := range []string{"requested", "cancelled", "declined", "completed", "reviewed"} {
		put("retained-"+status, status, base.Add(-time.Hour))
	}
	if _, err := s.C("trials").UpdateOne(ctx, bson.M{"_id": "retained-reviewed"}, bson.M{"$set": bson.M{"notes": "Historical teaching notes", "review": "Historical mentor review", "nextSteps": "Historical practice"}}); err != nil {
		t.Fatal(err)
	}
	put("future", "confirmed", base.Add(time.Hour))
	parent.ok("GET", "/dashboard", nil, 200)
	if v := read(boundary.ID); v.Status != "confirmed" || v.CompletedAt != nil || v.Version != 7 {
		t.Fatal("trial completed before scheduled end")
	}
	for _, action := range []string{"complete", "feedback", "review"} {
		tutor.ok("POST", "/trials/boundary/action", map[string]any{"action": action}, 422)
		mentor.ok("POST", "/trials/boundary/action", map[string]any{"action": action}, 403)
	}
	other.ok("POST", "/trials/boundary/action", map[string]any{"action": "cancel"}, 404)
	if got := mentor.ok("GET", "/dashboard", nil, 200)["trials"].([]any); len(got) != 0 {
		t.Fatal("trials reached the mentor dashboard")
	}
	clock.Store(boundary.End.UnixMilli())
	var workers sync.WaitGroup
	errors := make(chan error, 2)
	for _, worker := range []*App{a, a2} {
		workers.Add(1)
		go func(worker *App) {
			defer workers.Done()
			errors <- worker.completeEndedTrials(ctx)
		}(worker)
	}
	workers.Wait()
	close(errors)
	for err := range errors {
		if err != nil {
			t.Fatal(err)
		}
	}
	v := read(boundary.ID)
	if v.Status != "completed" || v.CompletedAt == nil || !v.CompletedAt.Equal(boundary.End) || v.CompletionMethod != "scheduled_end" || v.Version != 8 || v.Notes != "" || v.Review != "" || v.NextSteps != "" {
		t.Fatal("incorrect scheduled closure or invented evidence", v)
	}
	var retained bson.M
	if err := s.C("trials").FindOne(ctx, bson.M{"_id": boundary.ID}).Decode(&retained); err != nil || retained["retainedMetadata"] != "keep" {
		t.Fatal("unrelated historical metadata changed", err)
	}
	if count("audit", bson.M{"target": boundary.ID, "action": "trial.auto_completed"}) != 1 || count("outbox", bson.M{"payload.targetId": boundary.ID, "payload.event": "trial_completed"}) != 2 {
		t.Fatal("duplicate or missing completion effects")
	}
	if count("outbox", bson.M{"payload.targetId": boundary.ID, "payload.recipientId": "mentor-a"}) != 0 {
		t.Fatal("completion was routed to a mentor")
	}
	if err := a2.completeEndedTrials(ctx); err != nil || read(boundary.ID).Version != 8 {
		t.Fatal("retry changed a completed record", err)
	}
	for _, status := range []string{"requested", "cancelled", "declined", "completed", "reviewed"} {
		if retained := read("retained-" + status); retained.Status != status || retained.Version != 7 || retained.CompletionMethod != "" {
			t.Fatal("retained status was rewritten", status)
		}
	}
	if read("future").Status != "confirmed" {
		t.Fatal("future trial completed")
	}
	if legacy := read("retained-reviewed"); legacy.Notes != "Historical teaching notes" || legacy.Review != "Historical mentor review" || legacy.NextSteps != "Historical practice" {
		t.Fatal("historical feedback was altered")
	}
	parent.ok("POST", "/trials/boundary/action", map[string]any{"action": "cancel"}, 409)

	// No running worker is needed for an authorised read to catch up.
	put("read-catchup", "confirmed", a.Now().Add(-time.Millisecond))
	parent.ok("GET", "/dashboard", nil, 200)
	if read("read-catchup").Status != "completed" {
		t.Fatal("parent read did not catch up after worker downtime")
	}
	put("tutor-catchup", "confirmed", a.Now().Add(-time.Millisecond))
	tutor.ok("GET", "/tutor/workspace", nil, 200)
	if read("tutor-catchup").Status != "completed" {
		t.Fatal("tutor read did not catch up")
	}
	if _, err := a.emailTemplate(ctx, job{Payload: map[string]string{"event": "trial_feedback"}}, domain.User{}); err == nil || !strings.Contains(err.Error(), "no longer applies") {
		t.Fatal("obsolete feedback email remained deliverable", err)
	}
	// A retained future-completed fixture must not unlock early paid bookings.
	put("future-completed", "completed", a.Now().Add(time.Hour))
	status, _, _ := parent.call("POST", "/enrollments", map[string]any{"trialId": "future-completed", "accepted": true}, map[string]string{"Idempotency-Key": token()})
	if status != 404 {
		t.Fatal("future completion unlocked a booking", status)
	}
}
