package app

import (
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
	"tutorplatform/internal/password"
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
	googleFixture := installGoogleFixture(t, a, "mentor-a", "mentor-b")
	server := httptest.NewServer(a.Routes())
	defer server.Close()
	s2, e := storage.Connect(ctx, uri, s.DB.Name())
	if e != nil {
		t.Fatal(e)
	}
	defer s2.Client.Disconnect(ctx)
	a2 := New(s2, c)
	a2.Now = func() time.Time { return now }
	a2.Google = a.Google
	a2.Config.InterviewProvider = "google"
	a2.Config.MeetingProvider = "google"
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
		_, err = s.C("applications").InsertOne(ctx, domain.Application{ID: id, Name: "Sample applicant " + id, Education: "Sample Mathematics degree", Approach: "Explain with worked examples and ask the learner to explain.", Language: "Hindi", Status: "submitted", AssessorID: "mentor-a", Sample: true, Scope: domain.Scope{Subject: "Mathematics", MinClass: 6, MaxClass: 10, Mode: "online"}, UpdatedAt: now})
		if err != nil {
			t.Fatal(err)
		}
	}
	interview := func(start time.Time) domain.Interview {
		return domain.Interview{Start: start, End: start.Add(30 * time.Minute), Timezone: "Asia/Kolkata", Status: "scheduled"}
	}
	t.Run("assigned mentor rejection persists feedback and releases scheduled Google Meet", func(t *testing.T) {
		for _, id := range []string{"reject-submitted", "reject-scheduled"} {
			makeApplicant(id)
		}
		reason := "The requested teaching scope is not suitable for this application."
		admin.decide("reject-submitted", map[string]any{"action": "decline", "reason": reason}, 403)
		if _, e := s.C("applications").UpdateOne(ctx, bson.M{"_id": "reject-submitted"}, bson.M{"$set": bson.M{"assessorId": "other-mentor"}}); e != nil {
			t.Fatal(e)
		}
		mentor.ok("POST", "/applications/reject-submitted/decision", map[string]any{"action": "decline", "version": 0, "reason": reason}, 403)
		if _, e := s.C("applications").UpdateOne(ctx, bson.M{"_id": "reject-submitted"}, bson.M{"$set": bson.M{"assessorId": "mentor-a"}}); e != nil {
			t.Fatal(e)
		}
		mentor.decide("reject-submitted", map[string]any{"action": "decline", "reason": "short"}, 422)
		mentor.decide("reject-submitted", map[string]any{"action": "decline", "reason": reason}, 200)
		mentor.ok("POST", "/applications/reject-submitted/decision", map[string]any{"action": "decline", "version": 0, "reason": reason}, 409)
		mentor.decide("reject-submitted", map[string]any{"action": "decline", "reason": reason}, 409)
		mentor.decide("reject-scheduled", map[string]any{"action": "schedule", "interview": interview(now.Add(4 * time.Hour))}, 200)
		finishTestInterview(t, a, "reject-scheduled")
		mentor.decide("reject-scheduled", map[string]any{"action": "decline", "reason": reason}, 200)
		pending, err := storage.One[domain.Application](ctx, s, "applications", bson.M{"_id": "reject-scheduled"})
		if err != nil || pending.Interview == nil || pending.Interview.Status != "cancelled" || pending.Interview.SyncStatus != "pending" {
			t.Fatalf("rejection did not queue Google Meet cancellation: %v", err)
		}
		deletesBefore := googleFixture.deletes.Load()
		finishTestInterview(t, a, "reject-scheduled")
		if googleFixture.deletes.Load() != deletesBefore+1 {
			t.Fatal("rejection did not delete the scheduled provider meeting")
		}
		for _, id := range []string{"reject-submitted", "reject-scheduled"} {
			v, err := storage.One[domain.Application](ctx, s, "applications", bson.M{"_id": id})
			if err != nil || v.Status != "declined" || v.Reason != reason || v.Fees != nil {
				t.Fatalf("rejection did not persist without fees: %v", err)
			}
			if count, err := s.C("audit").CountDocuments(ctx, bson.M{"target": id, "action": "application.decline", "actor": "mentor-a"}); err != nil || count != 1 {
				t.Fatalf("rejection audit missing: count=%d error=%v", count, err)
			}
			parent.ok("GET", "/tutors/"+id, nil, 404)
		}
		// The rejected appointment must not block another applicant at that time.
		makeApplicant("reject-released-slot")
		mentor.decide("reject-released-slot", map[string]any{"action": "schedule", "interview": interview(now.Add(4 * time.Hour))}, 200)
		finishTestInterview(t, a, "reject-released-slot")
		mentor.decide("reject-released-slot", map[string]any{"action": "decline", "reason": reason}, 200)
		finishTestInterview(t, a, "reject-released-slot")
	})
	tutor.ok("PUT", "/application", applicationTestInput(t, s, "tutor-a", "Sample staff workflow applicant", now), 200)
	t.Run("staff boundaries and required optimistic version", func(t *testing.T) {
		for _, tc := range []*testClient{parent, tutor, client("finance-a", server.URL), client("support-a", server.URL)} {
			tc.ok("POST", "/applications/tutor-a/decision", map[string]any{"action": "fees", "version": 1}, 403)
			for _, path := range []string{"/staff/overview", "/staff/applications", "/staff/applications/tutor-a", "/staff/members", "/staff/events", "/staff/followups"} {
				tc.ok("GET", path, nil, 403)
			}
			tc.ok("POST", "/staff/members", map[string]any{"name": "Denied Mentor", "email": "denied-mentor@example.test", "password": testPassword, "reason": "Only administrators can create mentor logins."}, 403)
		}
		mentor.ok("POST", "/applications/tutor-a/decision", map[string]any{"action": "fees"}, 422)
		admin.decide("tutor-a", map[string]any{"action": "approve"}, 403)
		mentor.ok("GET", "/staff/events", nil, 403)
	})
	t.Run("administrator provisions mentor login", func(t *testing.T) {
		email := "new.mentor@example.test"
		pass := "Mentor login passphrase 742!"
		body := map[string]any{
			"name":     "New Academic Mentor",
			"email":    "  NEW.MENTOR@example.test ",
			"password": pass,
			"reason":   "Create a mentor login for assigned academic reviews.",
		}
		v := admin.ok("POST", "/staff/members", body, 201)
		if v["email"] != email {
			t.Fatalf("expected normalized email, got %#v", v["email"])
		}
		member := v["member"].(map[string]any)
		if member["role"] != "mentor" || member["name"] != "New Academic Mentor" || member["id"] == "" {
			t.Fatalf("unexpected mentor response: %#v", member)
		}
		id := member["id"].(string)
		u, e := storage.One[domain.User](ctx, s, "users", bson.M{"_id": id})
		if e != nil || u.Role != "mentor" || u.Email != email || u.Sample {
			t.Fatalf("incorrect mentor account: %#v %v", u, e)
		}
		var credential struct {
			Hash string `bson:"passwordHash"`
		}
		if e = s.C("credentials").FindOne(ctx, bson.M{"_id": email}).Decode(&credential); e != nil || !password.Verify(credential.Hash, pass) {
			t.Fatalf("mentor credential was not protected or saved")
		}
		if n, e := s.C("audit").CountDocuments(ctx, bson.M{"target": id, "actor": "operator:admin-a", "action": "staff.provisioned", "role": "mentor"}); e != nil || n != 1 {
			t.Fatalf("missing mentor provisioning audit: %d %v", n, e)
		}
		fresh, _ := cookiejar.New(nil)
		created := &testClient{t: t, http: &http.Client{Jar: fresh, Timeout: 30 * time.Second}, base: server.URL}
		auth := created.ok("POST", "/auth/login", map[string]any{"email": email, "password": pass}, 200)
		created.csrf = auth["csrf"].(string)
		created.ok("GET", "/staff/overview", nil, 200)
		admin.ok("POST", "/staff/members/"+id+"/action", map[string]any{"action": "suspend", "reason": "Pause mentor access during founder review."}, 200)
		created.ok("GET", "/staff/overview", nil, 401)
		created.ok("POST", "/auth/login", map[string]any{"email": email, "password": pass}, 403)
		admin.ok("POST", "/staff/members/"+id+"/action", map[string]any{"action": "activate", "reason": "Founder review is complete; restore mentor access."}, 200)
		auth = created.ok("POST", "/auth/login", map[string]any{"email": email, "password": pass}, 200)
		created.csrf = auth["csrf"].(string)
		admin.ok("POST", "/staff/members/"+id+"/action", map[string]any{"action": "delete", "reason": "Deactivate mentor login while retaining historical audit records."}, 200)
		created.ok("POST", "/auth/login", map[string]any{"email": email, "password": pass}, 403)
		admin.ok("POST", "/staff/members", body, 409)
		mentor.ok("POST", "/staff/members", map[string]any{"name": "Peer Mentor", "email": "peer-mentor@example.test", "password": pass, "reason": "Mentors cannot provision other mentor logins."}, 403)
		mentor.ok("POST", "/staff/members/"+id+"/action", map[string]any{"action": "activate", "reason": "Mentors cannot restore staff accounts."}, 403)
	})
	t.Run("administrator sees founder report and family records", func(t *testing.T) {
		if _, e := s.C("learners").InsertOne(ctx, domain.Learner{ID: "founder-learner", OwnerID: "parent-a", Name: "Founder report learner", Class: 7, Board: "CBSE", Language: "English", Kind: "minor"}); e != nil {
			t.Fatal(e)
		}
		if _, e := s.C("applications").UpdateOne(ctx, bson.M{"_id": "tutor-meera"}, bson.M{"$set": bson.M{"mentorId": "mentor-a"}}); e != nil {
			t.Fatal(e)
		}
		if _, e := s.C("enrollments").InsertOne(ctx, domain.Enrollment{ID: "founder-enrollment", OwnerID: "parent-a", LearnerID: "founder-learner", LearnerName: "Founder report learner", Class: 7, TutorID: "tutor-meera", TutorName: "Meera sample", MentorID: "mentor-a", Status: "active", PaymentIntentID: "founder-payment", Agreement: domain.Agreement{ID: "founder-agreement", EnrollmentID: "founder-enrollment", Version: 1, TutorID: "tutor-meera", Subject: "Mathematics", Mode: "online", Timezone: "Asia/Kolkata", SessionCount: 8, Minutes: 60, FeePerSessionPaise: 50000, TotalPaise: 400000, Currency: "INR", CancellationHours: 24, Terms: "Founder report test agreement.", TermsVersion: "test", CreatedAt: now}, Version: 1, CreatedAt: now}); e != nil {
			t.Fatal(e)
		}
		if _, e := s.C("payment_intents").InsertOne(ctx, domain.PaymentIntent{ID: "founder-payment", OwnerID: "parent-a", EnrollmentID: "founder-enrollment", Amount: 400000, Currency: "INR", State: "captured", PaymentID: "pay_founder", Refunded: 50000, CreatedAt: now}); e != nil {
			t.Fatal(e)
		}
		if _, e := s.C("refunds").InsertOne(ctx, domain.RefundRequest{ID: "founder-refund", IntentID: "founder-payment", OwnerID: "parent-a", Amount: 50000, Reason: "Monthly finance report refund fixture.", Status: "requested", RequestedBy: "parent-a", CreatedAt: now}); e != nil {
			t.Fatal(e)
		}
		if _, e := s.C("classes").InsertMany(ctx, []any{
			domain.ClassSession{ID: "founder-enrollment:01", EnrollmentID: "founder-enrollment", TutorID: "tutor-meera", Start: now.Add(-48 * time.Hour), End: now.Add(-47 * time.Hour), Status: "reviewed", Timezone: "Asia/Kolkata", Version: 1},
			domain.ClassSession{ID: "founder-enrollment:02", EnrollmentID: "founder-enrollment", TutorID: "tutor-meera", Start: now.Add(-24 * time.Hour), End: now.Add(-23 * time.Hour), Status: "awaiting_review", Timezone: "Asia/Kolkata", Version: 1},
		}); e != nil {
			t.Fatal(e)
		}
		if _, e := s.C("learning_plans").InsertOne(ctx, domain.LearningPlan{ID: "founder-enrollment:0001", EnrollmentID: "founder-enrollment", Version: 1, StartingPoint: "Learner knows arithmetic basics.", Goals: "Strengthen fractions and algebra.", Topics: []domain.LearningTopic{{Title: "Fractions", Status: "practising", Evidence: "Class notes show partial confidence.", Practice: "Daily number-line practice."}}, NextSteps: "Review fraction operations.", ReviewDate: now.Add(-24 * time.Hour), AuthorID: "mentor-a", CreatedAt: now}); e != nil {
			t.Fatal(e)
		}
		report := admin.ok("GET", "/admin/founder", nil, 200)
		revenue := report["revenue"].(map[string]any)
		if revenue["grossPaise"].(float64) < 400000 || revenue["netPaise"].(float64) < 350000 {
			t.Fatalf("founder revenue missing payment: %#v", revenue)
		}
		if len(report["monthlyRevenue"].([]any)) == 0 || report["refundStatus"].(map[string]any)["requested"].(float64) < 1 {
			t.Fatalf("finance monthly/refund report missing: %#v", report)
		}
		metrics := report["metrics"].(map[string]any)
		if metrics["parents"].(float64) < 2 || metrics["learners"].(float64) < 1 || metrics["paidEnrollments"].(float64) < 1 {
			t.Fatalf("founder metrics missing records: %#v", metrics)
		}
		families := admin.ok("GET", "/admin/families", nil, 200)
		items := families["items"].([]any)
		found := false
		for _, raw := range items {
			item := raw.(map[string]any)
			if item["parentId"] == "parent-a" && len(item["learners"].([]any)) > 0 && item["paidEnrollments"].(float64) >= 1 && len(item["enrollments"].([]any)) > 0 {
				found = true
			}
		}
		if !found {
			t.Fatalf("parent and learner details missing: %#v", items)
		}
		searched := admin.ok("GET", "/admin/families?q=Founder", nil, 200)
		if len(searched["items"].([]any)) != 1 {
			t.Fatalf("family search by child name failed: %#v", searched)
		}
		academic := mentor.ok("GET", "/staff/academic", nil, 200)
		if academic["metrics"].(map[string]any)["awaitingReviews"].(float64) < 1 || len(academic["assignments"].([]any)) != 1 || len(academic["tutors"].([]any)) < 1 {
			t.Fatalf("mentor academic report missing assignment data: %#v", academic)
		}
		mentor.ok("GET", "/admin/founder", nil, 403)
		mentor.ok("GET", "/admin/families", nil, 403)
	})
	t.Run("only the assigned mentor manages the three approval features", func(t *testing.T) {
		for _, action := range []string{"schedule", "fees", "approve", "decline"} {
			admin.decide("tutor-a", map[string]any{"action": action}, 403)
		}
		admin.ok("POST", "/staff/applications/tutor-a/meeting/retry", map[string]any{"version": 1}, 403)
		for _, action := range []string{"review", "assess", "eligibility", "confirm_conflict", "note", "improve"} {
			mentor.decide("tutor-a", map[string]any{"action": action}, 422)
		}
		mentor.decide("tutor-a", map[string]any{"action": "approve", "subjects": []string{"Mathematics"}, "modes": []string{"online"}, "minClass": 6, "maxClass": 10}, 409)
		for _, link := range []string{"https://zoom.us.evil.test/j/12345678901", "http://zoom.us/j/12345678901", "https://user:secret@zoom.us/j/12345678901", "javascript:alert(1)", "https://zoom.us/j/12345678901"} {
			m := interview(now.Add(time.Hour))
			m.JoinURL = link
			mentor.decide("tutor-a", map[string]any{"action": "schedule", "interview": m}, 422)
		}
		mentor.decide("tutor-a", map[string]any{"action": "schedule", "interview": interview(now.Add(time.Hour))}, 200)
		mentor.setTestFees("tutor-a", 40000)
		mentor.decide("tutor-a", map[string]any{"action": "approve", "subjects": []string{"Mathematics"}, "modes": []string{"online"}, "minClass": 6, "maxClass": 10}, 409)
		finishTestInterview(t, a, "tutor-a")
		mentor.decide("tutor-a", map[string]any{"action": "approve", "subjects": []string{"Mathematics"}, "modes": []string{"online"}, "minClass": 6, "maxClass": 10}, 409)
		mentor.decide("tutor-a", map[string]any{"action": "no_show", "reason": "It is too early to mark non-attendance."}, 409)
	})
	t.Run("routing accepts active mentors and transfers reservations without an extra review step", func(t *testing.T) {
		for _, id := range []string{"parent-a", "admin-a"} {
			admin.decide("tutor-a", map[string]any{"action": "assign", "assessorId": id, "reason": "Only mentors may handle application approval."}, 422)
		}
		admin.decide("tutor-a", map[string]any{"action": "assign", "assessorId": "mentor-a", "reason": "Return the legacy interview to the assigned mentor."}, 200)
		finishTestInterview(t, a, "tutor-a")
		v := mentor.ok("GET", "/staff/applications/tutor-a", nil, 200)["application"].(map[string]any)
		if v["status"] != "submitted" || v["interview"].(map[string]any)["status"] != "cancelled" {
			t.Fatal("routing retained an active interview")
		}
		mentor.ok("POST", "/applications/tutor-a/decision", map[string]any{"action": "fees", "version": 0}, 409)
		mentor.decide("tutor-a", map[string]any{"action": "schedule", "interview": interview(now.Add(time.Minute))}, 200)
		now = now.Add(2 * time.Minute)
		finishTestInterview(t, a, "tutor-a")
		mentor.decide("tutor-a", map[string]any{"action": "fees", "feePlans": []domain.FeePlan{{Mode: "online", Period: "hour", AmountPaise: 40000, Classes: 1, Minutes: 60}}}, 422)
		mentor.setTestFees("tutor-a", 40000)
		mentor.decide("tutor-a", map[string]any{"action": "approve", "subjects": []string{"Mathematics"}, "minClass": 8, "maxClass": 8, "modes": []string{"online"}}, 200)
		mentor.decide("tutor-a", map[string]any{"action": "decline", "reason": "An approved tutor cannot be rejected as a pending application."}, 409)
		v = admin2.ok("GET", "/staff/applications/tutor-a", nil, 200)["application"].(map[string]any)
		if v["mentorId"] != "mentor-a" || v["conflictClear"] == true || v["scores"] != nil {
			t.Fatal("approval did not use the assigned mentor or fabricated removed assessment fields")
		}
		pub := parent.ok("GET", "/tutors/tutor-a", nil, 200)
		if len(pub["feePlans"].([]any)) != 1 || pub["fees"] != nil || pub["interview"] != nil {
			t.Fatal("unapproved fees or private details published")
		}
		mentor.decide("tutor-a", map[string]any{"action": "approve", "subjects": []string{"Mathematics"}, "minClass": 8, "maxClass": 8, "modes": []string{"online", "home"}}, 200)
		home := parent.ok("GET", "/tutors/tutor-a", nil, 200)
		if len(home["feePlans"].([]any)) != 3 || len(home["scope"].(map[string]any)["modes"].([]any)) != 2 {
			t.Fatal("dual-mode approval did not publish the confirmed packages")
		}
		tutor.ok("PUT", "/availability", map[string]any{"feePaise": 1}, 403)
		tutor.ok("PUT", "/availability", map[string]any{"feeVersion": 1}, 403)
		events := mentor.ok("GET", "/staff/events?application=tutor-a", nil, 200)["items"].([]any)
		found := false
		for _, raw := range events {
			event := raw.(map[string]any)
			if event["action"] == "application.approve" && event["actor"] == "mentor-a" {
				found = true
			}
		}
		if !found {
			t.Fatal("mentor approval audit missing")
		}
	})
	t.Run("two API instances cannot schedule overlapping mentor interviews", func(t *testing.T) {
		for _, id := range []string{"interview-one", "interview-two"} {
			makeApplicant(id)
		}
		mentor2 := client("mentor-a", server2.URL)
		statuses := make([]int, 2)
		var wg sync.WaitGroup
		for i, tc := range []*testClient{mentor, mentor2} {
			wg.Add(1)
			go func(i int, tc *testClient) {
				defer wg.Done()
				id := []string{"interview-one", "interview-two"}[i]
				statuses[i], _, _ = tc.call("POST", "/applications/"+id+"/decision", map[string]any{"action": "schedule", "version": 0, "interview": interview(now.Add(2 * time.Hour))}, nil)
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
		finishTestInterview(t, a, winner)
		mentor.decide(loser, map[string]any{"action": "schedule", "interview": interview(now.Add(3 * time.Hour))}, 200)
		finishTestInterview(t, a, loser)
		mentor.decide(loser, map[string]any{"action": "reschedule", "reason": "Conflicting reschedule must retain the previous slot.", "interview": interview(now.Add(2 * time.Hour))}, 409)
		v := mentor.ok("GET", "/staff/applications/"+loser, nil, 200)["application"].(map[string]any)
		if v["interview"].(map[string]any)["start"] != now.Add(3*time.Hour).Format(time.RFC3339) {
			t.Fatal("failed reschedule changed the meeting")
		}
		mentor.decide(winner, map[string]any{"action": "cancel_interview", "reason": "Release the interview reservation for another candidate."}, 200)
		finishTestInterview(t, a, winner)
		mentor.decide(loser, map[string]any{"action": "reschedule", "reason": "The conflicting interview is now cancelled.", "interview": interview(now.Add(2 * time.Hour))}, 200)
		finishTestInterview(t, a, loser)
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
