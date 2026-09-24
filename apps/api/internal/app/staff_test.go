package app

import (
	"bytes"
	"context"
	"fmt"
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

func TestMongoStaffOperations(t *testing.T) {
	uri := os.Getenv("TEST_MONGODB_URI")
	if uri == "" {
		t.Skip("TEST_MONGODB_URI required")
	}
	t.Setenv("SEED_PASSWORD", testPassword)
	ctx := context.Background()
	s, e := storage.Connect(ctx, uri, "tutor_test_staff_"+token()[:12])
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
	now := time.Now().UTC().Truncate(time.Second)
	c := config.Config{Env: "test", AuthProvider: "password", Origin: "http://test.local"}
	a := New(s, c)
	a.Now = func() time.Time { return now }
	server := httptest.NewServer(a.Routes())
	defer server.Close()
	s2, e := storage.Connect(ctx, uri, s.DB.Name())
	if e != nil {
		t.Fatal(e)
	}
	defer s2.Client.Disconnect(ctx)
	a2 := New(s2, c)
	a2.Now = func() time.Time { return now }
	server2 := httptest.NewServer(a2.Routes())
	defer server2.Close()
	client := func(id, base string) *testClient {
		jar, _ := cookiejar.New(nil)
		v := &testClient{t: t, http: &http.Client{Jar: jar, Timeout: 30 * time.Second}, base: base}
		v.login(id)
		return v
	}
	admin, admin2, mentor, tutor, parent := client("admin-a", server.URL), client("admin-a", server2.URL), client("mentor-a", server.URL), client("tutor-a", server.URL), client("parent-a", server.URL)
	makeApplicant := func(id string) {
		t.Helper()
		_, err := s.C("users").InsertOne(ctx, domain.User{ID: id, Name: "Sample applicant " + id, Email: id + "@example.test", Role: "tutor", Sample: true})
		if err != nil {
			t.Fatal(err)
		}
		_, err = s.C("applications").InsertOne(ctx, domain.Application{ID: id, Name: "Sample applicant " + id, Education: "Sample Mathematics degree", Approach: "Explain with worked examples and ask the learner to explain.", Language: "Hindi", Status: "submitted", Sample: true, Scope: domain.Scope{Subject: "Mathematics", MinClass: 6, MaxClass: 10, Mode: "online"}, UpdatedAt: now})
		if err != nil {
			t.Fatal(err)
		}
	}
	interview := func(start time.Time) domain.Interview {
		return domain.Interview{Start: start, End: start.Add(30 * time.Minute), Timezone: "Asia/Kolkata", JoinURL: "https://us02web.zoom.us/j/12345678901?pwd=sample-only", Status: "scheduled"}
	}
	tutor.ok("PUT", "/application", applicationTestInput("Sample staff workflow applicant", now), 200)
	t.Run("staff boundaries and required optimistic version", func(t *testing.T) {
		for _, tc := range []*testClient{parent, tutor, client("finance-a", server.URL), client("support-a", server.URL)} {
			tc.ok("POST", "/applications/tutor-a/decision", map[string]any{"action": "fees", "version": 1}, 403)
			for _, path := range []string{"/staff/overview", "/staff/applications", "/staff/applications/tutor-a", "/staff/members", "/staff/events", "/staff/followups"} {
				tc.ok("GET", path, nil, 403)
			}
		}
		admin.ok("POST", "/applications/tutor-a/decision", map[string]any{"action": "review", "conflictClear": true}, 422)
		admin.decide("tutor-a", map[string]any{"action": "review"}, 422)
		mentor.ok("GET", "/staff/events", nil, 403)
	})
	t.Run("administrator review requires conflict declaration and a genuine scheduled interview", func(t *testing.T) {
		admin.decide("tutor-a", map[string]any{"action": "review", "conflictClear": true}, 200)
		admin.decide("tutor-a", map[string]any{"action": "approve", "reason": "This is not yet assessed.", "minClass": 6, "maxClass": 10, "mentorId": "mentor-a"}, 409)
		admin.ok("POST", "/applications/tutor-a/decision", map[string]any{"action": "note", "reason": "A stale action must not overwrite review.", "version": 0}, 409)
		for _, link := range []string{"https://zoom.us.evil.test/j/12345678901", "http://zoom.us/j/12345678901", "https://user:secret@zoom.us/j/12345678901", "javascript:alert(1)"} {
			m := interview(now.Add(time.Hour))
			m.JoinURL = link
			admin.decide("tutor-a", map[string]any{"action": "schedule", "interview": m}, 422)
		}
		m := interview(now.Add(time.Hour))
		admin.decide("tutor-a", map[string]any{"action": "schedule", "interview": m}, 200)
		persisted := admin2.ok("GET", "/staff/applications/tutor-a", nil, 200)["application"].(map[string]any)
		if persisted["interview"].(map[string]any)["joinUrl"] != m.JoinURL {
			t.Fatal("interview did not persist across instances")
		}
		mentor.ok("GET", "/staff/applications/tutor-a", nil, 404)
		mentor.ok("POST", "/applications/tutor-a/decision", map[string]any{"action": "cancel_interview", "version": persisted["version"], "reason": "An unrelated mentor cannot change this interview."}, 403)
		mentor.ok("POST", "/applications/tutor-a/decision", map[string]any{"action": "fees", "version": persisted["version"]}, 403)
		admin.decide("tutor-a", map[string]any{"action": "fees"}, 409)
		admin.decide("tutor-a", map[string]any{"action": "assess", "scores": []int{4, 4, 4, 4, 4, 4}, "evidence": "Future meetings cannot be recorded as already assessed."}, 409)
		admin.decide("tutor-a", map[string]any{"action": "no_show", "reason": "It is too early to mark non-attendance."}, 409)
	})
	t.Run("reviewer reassignment cancels old interview and requires new conflict confirmation", func(t *testing.T) {
		admin.decide("tutor-a", map[string]any{"action": "assign", "assessorId": "parent-a", "reason": "Public accounts cannot become reviewers."}, 422)
		admin.decide("tutor-a", map[string]any{"action": "assign", "assessorId": "mentor-a", "reason": "Assign the academic reviewer for this subject."}, 200)
		v := mentor.ok("GET", "/staff/applications/tutor-a", nil, 200)["application"].(map[string]any)
		if v["status"] != "under_review" || v["interview"].(map[string]any)["status"] != "cancelled" {
			t.Fatal("reassignment kept active meeting")
		}
		mentor.decide("tutor-a", map[string]any{"action": "schedule", "interview": interview(now.Add(-time.Minute))}, 403)
		mentor.decide("tutor-a", map[string]any{"action": "confirm_conflict", "conflictClear": true}, 200)
		mentor.decide("tutor-a", map[string]any{"action": "schedule", "interview": interview(now.Add(-time.Minute))}, 200)
		mentor.decide("tutor-a", map[string]any{"action": "assess", "scores": []int{4, 4}, "evidence": "Two scores are insufficient for approval."}, 422)
		mentor.decide("tutor-a", map[string]any{"action": "assess", "scores": []int{4, 4, 4, 4, 4, 4}, "evidence": "Observed explanation and misconception checks using a number line."}, 200)
		pending := mentor.decide("tutor-a", map[string]any{"action": "approve", "minClass": 8, "maxClass": 8, "reason": "Cannot publish a tutor before staff confirms fees."}, 409)
		if pending["code"] != "fees_pending" {
			t.Fatalf("wrong fee gate: %v", pending)
		}
		mentor.decide("tutor-a", map[string]any{"action": "fees", "feePlans": []domain.FeePlan{{Mode: "online", Period: "hour", AmountPaise: 40000, Classes: 1, Minutes: 60}}}, 422)
		mentor.setTestFees("tutor-a", 40000)
		persistedFees := admin2.ok("GET", "/staff/applications/tutor-a", nil, 200)["application"].(map[string]any)["fees"].(map[string]any)
		if len(persistedFees["plans"].([]any)) != 3 || persistedFees["setBy"] != "mentor-a" {
			t.Fatal("staff fees did not persist across API instances")
		}
		mentor.decide("tutor-a", map[string]any{"action": "approve", "minClass": 8, "maxClass": 8, "reason": "Observed teaching supports class eight online Mathematics."}, 200)
		pub := parent.ok("GET", "/tutors/tutor-a", nil, 200)
		published := pub["feePlans"].([]any)
		if len(published) != 1 || published[0].(map[string]any)["amountPaise"] != float64(40000) || pub["fees"] != nil {
			t.Fatal("wrong public prices or private fee metadata leaked")
		}
		tutor.ok("PUT", "/availability", map[string]any{"feePaise": 1}, 403)
		tutor.ok("PUT", "/availability", map[string]any{"feeVersion": 1}, 403)
		if pub["scope"].(map[string]any)["minClass"] != float64(8) || pub["interview"] != nil {
			t.Fatal("public scope or private meeting boundary")
		}
		mentor.decide("tutor-a", map[string]any{"action": "note", "reason": "Internal note: reassess complex fractions at next review."}, 200)
		_, _, raw := tutor.call("GET", "/dashboard", nil, nil)
		if bytes.Contains(raw, []byte("Internal note:")) {
			t.Fatal("staff note disclosed to applicant")
		}
		events := mentor.ok("GET", "/staff/events?application=tutor-a", nil, 200)["items"].([]any)
		found := false
		for _, raw := range events {
			event := raw.(map[string]any)
			if event["action"] == "application.assess" && len(event["scores"].([]any)) == 6 {
				found = true
			}
		}
		if !found {
			t.Fatal("immutable assessment evidence missing")
		}
	})
	t.Run("two API instances cannot schedule overlapping reviewer interviews", func(t *testing.T) {
		for _, id := range []string{"interview-one", "interview-two"} {
			makeApplicant(id)
			admin.decide(id, map[string]any{"action": "review", "conflictClear": true}, 200)
		}
		statuses := make([]int, 2)
		var wg sync.WaitGroup
		for i, tc := range []*testClient{admin, admin2} {
			wg.Add(1)
			go func(i int, tc *testClient) {
				defer wg.Done()
				id := []string{"interview-one", "interview-two"}[i]
				statuses[i], _, _ = tc.call("POST", "/applications/"+id+"/decision", map[string]any{"action": "schedule", "version": 1, "interview": interview(now.Add(2 * time.Hour))}, nil)
			}(i, tc)
		}
		wg.Wait()
		if !((statuses[0] == 200 && statuses[1] == 409) || (statuses[1] == 200 && statuses[0] == 409)) {
			t.Fatal("overlapping interviews", statuses)
		}
		winner, loser := "interview-one", "interview-two"
		if statuses[1] == 200 {
			winner, loser = loser, winner
		}
		admin.decide(loser, map[string]any{"action": "schedule", "interview": interview(now.Add(3 * time.Hour))}, 200)
		admin.decide(loser, map[string]any{"action": "reschedule", "reason": "Attempt a conflicting change without losing the old slot.", "interview": interview(now.Add(2 * time.Hour))}, 409)
		v := admin.ok("GET", "/staff/applications/"+loser, nil, 200)["application"].(map[string]any)
		if v["interview"].(map[string]any)["start"] != now.Add(3*time.Hour).Format(time.RFC3339) {
			t.Fatal("failed reschedule changed meeting")
		}
		admin.decide(winner, map[string]any{"action": "cancel_interview", "reason": "Release the reviewer reservation for another candidate."}, 200)
		admin.decide(loser, map[string]any{"action": "reschedule", "reason": "The old interview has now been cancelled.", "interview": interview(now.Add(2 * time.Hour))}, 200)
	})
	t.Run("admin can assess and approve with an explicit ongoing academic mentor", func(t *testing.T) {
		makeApplicant("admin-reviewed")
		admin.decide("admin-reviewed", map[string]any{"action": "review", "conflictClear": true}, 200)
		admin.decide("admin-reviewed", map[string]any{"action": "schedule", "interview": interview(now.Add(-time.Minute))}, 200)
		admin.decide("admin-reviewed", map[string]any{"action": "assess", "scores": []int{4, 5, 4, 5, 4, 5}, "evidence": "Administrator observed a complete explanation and learner checks."}, 200)
		admin.setTestFees("admin-reviewed", 0)
		admin.decide("admin-reviewed", map[string]any{"action": "approve", "minClass": 6, "maxClass": 10, "reason": "Approval must retain ongoing academic oversight."}, 422)
		admin.decide("admin-reviewed", map[string]any{"action": "approve", "minClass": 6, "maxClass": 10, "mentorId": "mentor-a", "reason": "Academic evidence supports this scope and mentor assignment."}, 200)
		v := admin.ok("GET", "/staff/applications/admin-reviewed", nil, 200)["application"].(map[string]any)
		if v["mentorId"] != "mentor-a" {
			t.Fatal("ongoing mentor was not saved")
		}
	})
	t.Run("suspension revokes sessions and teaching access while retaining bookings for followup", func(t *testing.T) {
		learner := parent.ok("POST", "/learners", map[string]any{"name": "Sample adult", "class": 8, "board": "CBSE", "language": "Hindi", "kind": "adult_self"}, 201)
		req := parent.ok("POST", "/requirements", map[string]any{"learnerId": learner["id"], "goal": "Review fractions carefully with structured examples.", "locality": "Purnea"}, 201)
		status, trial, _ := parent.call("POST", "/trials", map[string]any{"requirementId": req["id"], "tutorId": "tutor-a", "start": now.Add(24 * time.Hour), "termsAccepted": true}, map[string]string{"Idempotency-Key": "staff-suspension-trial"})
		if status != 201 {
			t.Fatal(status, trial)
		}
		admin.decide("tutor-a", map[string]any{"action": "suspend", "reason": "Review the concern before any further teaching access."}, 200)
		tutor.ok("GET", "/dashboard", nil, 401)
		tutor.login("tutor-a")
		d := tutor.ok("GET", "/dashboard", nil, 200)
		if len(d["trials"].([]any)) != 0 {
			t.Fatal("restricted tutor can read learner data")
		}
		tutor.ok("GET", "/enrollments", nil, 403)
		tutor.ok("POST", "/trials/"+trial["id"].(string)+"/action", map[string]any{"action": "accept"}, 403)
		parent.ok("GET", "/tutors/tutor-a", nil, 404)
		if n, e := s.C("trials").CountDocuments(ctx, bson.M{"_id": trial["id"], "status": "requested"}); e != nil || n != 1 {
			t.Fatal("suspension deleted or cancelled booking")
		}
		items := admin.ok("GET", "/staff/followups", nil, 200)["items"].([]any)
		if len(items) != 1 || items[0].(map[string]any)["trials"] != float64(1) {
			t.Fatal("missing affected-booking followup")
		}
		item := items[0].(map[string]any)
		path := "/staff/followups/" + strings.ReplaceAll(item["id"].(string), ":", "%3A") + "/resolve"
		admin.ok("POST", path, map[string]any{"version": 999, "confirmed": true, "reason": "Reviewed the existing arrangements and next steps."}, 409)
		admin.ok("POST", path, map[string]any{"version": item["version"], "confirmed": true, "reason": "Recorded mentor follow-up for the existing trial; no cancellation requested."}, 200)
		if n, _ := s.C("trials").CountDocuments(ctx, bson.M{"_id": trial["id"], "status": "requested"}); n != 1 {
			t.Fatal("followup fabricated a cancellation")
		}
		admin.decide("tutor-a", map[string]any{"action": "reinstate", "reason": "Review completed and the existing approval remains valid."}, 200)
		parent.ok("GET", "/tutors/tutor-a", nil, 200)
		admin.decide("tutor-a", map[string]any{"action": "terminate", "reason": "Operator ends future teaching access and retains the learning history."}, 200)
		admin.decide("tutor-a", map[string]any{"action": "reinstate", "reason": "Termination must not be reversible through reinstatement."}, 409)
		tutor.login("tutor-a")
		tutor.ok("GET", "/enrollments", nil, 403)
		tutor.ok("GET", "/account", nil, 200)
		parent.ok("GET", "/tutors/tutor-a", nil, 404)
		items = admin.ok("GET", "/staff/followups", nil, 200)["items"].([]any)
		if len(items) != 1 {
			t.Fatal("followup was duplicated or not reopened")
		}
	})
	t.Run("bounded queues and chronological history have usable cursors", func(t *testing.T) {
		for i := 0; i < 28; i++ {
			makeApplicant(fmt.Sprintf("paged-%02d", i))
		}
		first := admin.ok("GET", "/staff/applications?q=paged-", nil, 200)
		if len(first["items"].([]any)) != 25 || first["nextCursor"] == "" {
			t.Fatal("missing bounded cursor")
		}
		second := admin.ok("GET", "/staff/applications?q=paged-&cursor="+first["nextCursor"].(string), nil, 200)
		if len(second["items"].([]any)) != 3 {
			t.Fatal("incorrect continuation")
		}
		if len(admin.ok("GET", "/staff/applications?q=%2E%2A", nil, 200)["items"].([]any)) != 0 {
			t.Fatal("search interpreted regex syntax")
		}
		admin.ok("GET", "/staff/events?cursor=invalid", nil, 422)
		if admin.ok("GET", "/staff/overview", nil, 200)["counts"].(map[string]any)["submitted"] != float64(28) {
			t.Fatal("counts are not derived from all matching records")
		}
	})
}
