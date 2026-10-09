package app

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"sync"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"tutorplatform/internal/config"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/payments"
	"tutorplatform/internal/storage"
)

func TestTomorrowBookingBoundary(t *testing.T) {
	now := time.Date(2030, 1, 2, 0, 1, 0, 0, mustLocation())
	for _, date := range []string{"2030-01-01", "2030-01-02"} {
		_, err := recurrence(RecurrenceInput{StartDate: date, Time: "23:00", Timezone: "Asia/Kolkata", Weekdays: []int{int(now.Weekday())}, Count: 1, Minutes: 60}, now, nil)
		if err == nil {
			t.Fatal("today/past date accepted", date)
		}
	}
	if _, err := recurrence(RecurrenceInput{StartDate: "2030-01-03", Time: "10:00", Timezone: "Asia/Kolkata", Weekdays: []int{4}, Count: 1, Minutes: 60}, now, nil); err != nil {
		t.Fatal(err)
	}
}

func TestMongoParentBookingFlow(t *testing.T) {
	uri := os.Getenv("TEST_MONGODB_URI")
	if uri == "" {
		t.Skip("TEST_MONGODB_URI required")
	}
	t.Setenv("SEED_PASSWORD", testPassword)
	ctx := context.Background()
	s, err := storage.Connect(ctx, uri, "tutor_test_parent_booking_"+token()[:12])
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
	cfg := config.Config{Env: "test", AuthProvider: "password", Origin: "http://test.local", RazorpaySecret: "test-booking-secret"}
	a := New(s, cfg)
	now := time.Now()
	a.Now = func() time.Time { return now }
	g := &paymentTestGateway{orders: map[string]payments.Order{}, payments: map[string]payments.Payment{}, refunds: map[string]payments.Refund{}}
	a.Payments = g
	srv := httptest.NewServer(a.Routes())
	defer srv.Close()
	a2 := New(s, cfg)
	a2.Now = a.Now
	srv2 := httptest.NewServer(a2.Routes())
	defer srv2.Close()
	client := func(id, base string) *testClient {
		jar, _ := cookiejar.New(nil)
		c := &testClient{t: t, http: &http.Client{Jar: jar, Timeout: 30 * time.Second}, base: base}
		c.login(id)
		return c
	}
	p, other, tutor, primary, mentor := client("parent-a", srv.URL), client("parent-b", srv.URL), client("tutor-meera", srv.URL), client("tutor-arjun", srv.URL), client("mentor-a", srv.URL)
	for _, fixture := range []struct {
		id       string
		min, max int
		subjects []string
	}{{"tutor-meera", 6, 12, []string{"Mathematics", "Science"}}, {"tutor-arjun", 1, 5, []string{domain.AllSubjects}}} {
		_, err = s.C("applications").UpdateOne(ctx, bson.M{"_id": fixture.id}, bson.M{"$set": bson.M{"scope": domain.Scope{Subject: fixture.subjects[0], Subjects: fixture.subjects, MinClass: fixture.min, MaxClass: fixture.max, Mode: "online", ExpiresAt: now.AddDate(0, 6, 0)}, "fees": domain.TutorFees{Version: 2, Plans: []domain.FeePlan{{Mode: "online", Period: "hour", Classes: 1, Minutes: 60, AmountPaise: 200000}}}}})
		if err != nil {
			t.Fatal(err)
		}
		av := defaultAvailability(fixture.id)
		av.Version = 1
		av.Windows = nil
		for day := 0; day < 7; day++ {
			av.Windows = append(av.Windows, domain.WeeklyWindow{Day: day, StartMinute: 0, EndMinute: 1440})
		}
		if _, err = s.C("availability").InsertOne(ctx, av); err != nil {
			t.Fatal(err)
		}
	}
	consent := p.ok("POST", "/consents", map[string]any{"relationship": "parent", "accepted": true}, 201)
	learner := func(class int) string {
		return p.ok("POST", "/learners", map[string]any{"name": "Fictional booking learner", "class": class, "board": "CBSE", "language": "English", "kind": "minor", "consentId": consent["id"]}, 201)["id"].(string)
	}
	older, younger := learner(6), learner(5)
	trial := func(id, tutorID string, subjects []string, hour int) domain.Trial {
		day := now.In(mustLocation()).AddDate(0, 0, 1)
		start := time.Date(day.Year(), day.Month(), day.Day(), 10+hour, 0, 0, 0, day.Location())
		status, _, raw := p.call("POST", "/trials", map[string]any{"learnerId": id, "subjects": subjects, "mode": "online", "tutorId": tutorID, "start": start, "termsAccepted": true}, map[string]string{"Idempotency-Key": token()})
		if status != 201 {
			t.Fatalf("trial %d %s", status, raw)
		}
		var result domain.Trial
		json.Unmarshal(raw, &result)
		return result
	}
	oldTrial, youngTrial := trial(older, "tutor-meera", []string{"Mathematics", "Science"}, 0), trial(younger, "tutor-arjun", []string{domain.AllSubjects}, 2)
	for _, fixture := range []struct {
		c     *testClient
		trial domain.Trial
	}{{tutor, oldTrial}, {primary, youngTrial}} {
		fixture.c.ok("POST", "/trials/"+fixture.trial.ID+"/action", map[string]any{"action": "accept"}, 200)
		fixture.c.ok("POST", "/trials/"+fixture.trial.ID+"/action", map[string]any{"action": "complete", "notes": "Worked through the learner's questions and examples.", "nextSteps": "Practise the examples before the next lesson.", "review": "Tutor feedback: the learner explained their reasoning clearly."}, 200)
	}
	t.Run("direct trials and immediate tutor feedback", func(t *testing.T) {
		n, _ := s.C("requirements").CountDocuments(ctx, bson.M{})
		if n != 0 {
			t.Fatal("direct trial created a learning need")
		}
		found := false
		for _, item := range p.ok("GET", "/dashboard", nil, 200)["trials"].([]any) {
			v := item.(map[string]any)
			if v["id"] == oldTrial.ID {
				found = v["status"] == "completed" && v["notes"] != "" && v["review"] != ""
			}
		}
		if !found {
			t.Fatal("feedback hidden")
		}
		mentor.ok("POST", "/trials/"+oldTrial.ID+"/action", map[string]any{"action": "review", "review": "Mentor feedback cannot override tutor feedback."}, 422)
		other.ok("GET", "/dashboard", nil, 200)
		status, _, _ := other.call("POST", "/trials", map[string]any{"learnerId": older, "subjects": []string{"Mathematics"}, "mode": "online", "tutorId": "tutor-meera", "start": now.AddDate(0, 0, 1), "termsAccepted": true}, map[string]string{"Idempotency-Key": token()})
		if status != 404 {
			t.Fatal("other household booked this learner", status)
		}
	})
	input := func(trialID string, subjects []string, days int, hour string) map[string]any {
		first := now.In(mustLocation()).AddDate(0, 0, days)
		return map[string]any{"trialId": trialID, "subjects": subjects, "packageMode": "online", "packagePeriod": "hour", "offeringVersion": 1, "feeVersion": 2, "accepted": true, "schedule": RecurrenceInput{StartDate: first.Format("2006-01-02"), Time: hour, Timezone: "Asia/Kolkata", Weekdays: []int{int(first.Weekday())}, Count: 1, Minutes: 60}}
	}
	book := func(c *testClient, body map[string]any, key string) domain.Enrollment {
		status, _, raw := c.call("POST", "/enrollments", body, map[string]string{"Idempotency-Key": key})
		if status != 201 {
			t.Fatalf("book %d %s", status, raw)
		}
		var result domain.Enrollment
		json.Unmarshal(raw, &result)
		return result
	}
	olderBody := input(oldTrial.ID, []string{"Mathematics", "Science"}, 3, "10:00")
	paid := book(p, olderBody, "parent-direct-multi-subject")
	t.Run("server price and no tutor acceptance", func(t *testing.T) {
		if paid.Status != "awaiting_payment" || paid.HoldUntil == nil || paid.Agreement.TotalPaise != 400000 || paid.Agreement.PackageFeePaise != 200000 {
			t.Fatal("incorrect direct booking", paid)
		}
		again := book(p, olderBody, "parent-direct-multi-subject")
		if again.ID != paid.ID {
			t.Fatal("retry duplicated booking")
		}
		tutor.ok("POST", "/enrollments/"+paid.ID+"/action", map[string]any{"action": "accept", "version": paid.Version}, 403)
		for _, item := range p.ok("GET", "/enrollments/"+paid.ID, nil, 200)["sessions"].([]any) {
			if item.(map[string]any)["status"] != "held" {
				t.Fatal("unpaid class scheduled")
			}
		}
		body := input(oldTrial.ID, []string{"English"}, 4, "10:00")
		status, _, _ := p.call("POST", "/enrollments", body, map[string]string{"Idempotency-Key": token()})
		if status != 409 {
			t.Fatal("unapproved subject accepted", status)
		}
		body = input(oldTrial.ID, []string{domain.AllSubjects}, 4, "10:00")
		status, _, _ = p.call("POST", "/enrollments", body, map[string]string{"Idempotency-Key": token()})
		if status != 422 {
			t.Fatal("All Subjects accepted for Class 6", status)
		}
	})
	t.Run("primary class charges once", func(t *testing.T) {
		v := book(p, input(youngTrial.ID, []string{domain.AllSubjects}, 3, "12:00"), token())
		if v.Agreement.TotalPaise != 200000 {
			t.Fatal("primary fee multiplied")
		}
	})
	t.Run("payment capture activates without acceptance", func(t *testing.T) {
		status, response, raw := p.call("POST", "/enrollments/"+paid.ID+"/payment", map[string]any{"retry": false}, map[string]string{"Idempotency-Key": token()})
		if status != 200 {
			t.Fatalf("payment %d %s", status, raw)
		}
		intent := response["intent"].(map[string]any)
		order := intent["orderId"].(string)
		payment := payments.Payment{ID: "pay_parent_booking", OrderID: order, Amount: 400000, Currency: "INR", Status: "captured", Captured: true}
		g.payments[payment.ID] = payment
		p.ok("POST", "/billing/"+intent["id"].(string)+"/verify", map[string]any{"paymentId": payment.ID, "signature": signed(cfg.RazorpaySecret, []byte(order+"|"+payment.ID))}, 200)
		v := p.ok("GET", "/enrollments/"+paid.ID, nil, 200)
		if v["enrollment"].(map[string]any)["status"] != "active" || v["sessions"].([]any)[0].(map[string]any)["status"] != "scheduled" {
			t.Fatal("payment did not schedule classes")
		}
	})
	t.Run("conflicting checkout holds are atomic across API instances", func(t *testing.T) {
		second := client("parent-a", srv2.URL)
		var wg sync.WaitGroup
		codes := make(chan int, 2)
		for _, c := range []*testClient{p, second} {
			wg.Add(1)
			go func(c *testClient) {
				defer wg.Done()
				status, _, _ := c.call("POST", "/enrollments", input(oldTrial.ID, []string{"Mathematics"}, 5, "14:00"), map[string]string{"Idempotency-Key": token()})
				codes <- status
			}(c)
		}
		wg.Wait()
		close(codes)
		ok, conflict := 0, 0
		for code := range codes {
			if code == 201 {
				ok++
			} else if code == 409 {
				conflict++
			} else {
				t.Fatal(code)
			}
		}
		if ok != 1 || conflict != 1 {
			t.Fatal("overlap accepted", ok, conflict)
		}
	})
	t.Run("regular notes complete without mentor review", func(t *testing.T) {
		d := p.ok("GET", "/enrollments/"+paid.ID, nil, 200)
		class := d["sessions"].([]any)[0].(map[string]any)
		tutor.ok("POST", "/classes/"+class["id"].(string)+"/action", map[string]any{"action": "record", "version": class["version"], "developmentRecord": true, "attendance": "present", "notes": "The learner completed examples in both selected subjects.", "homework": "Practise the worked examples again."}, 200)
		d = p.ok("GET", "/enrollments/"+paid.ID, nil, 200)
		if d["sessions"].([]any)[0].(map[string]any)["status"] != "completed" || d["delivered"] != float64(1) {
			t.Fatal("mentor review still required")
		}
	})
	t.Log("Isolated parent booking database retained:", s.DB.Name())
}
