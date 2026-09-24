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
	"tutorplatform/internal/config"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
)

func TestRecurrenceAndAvailability(t *testing.T) {
	now := time.Date(2030, 1, 1, 0, 0, 0, 0, time.UTC)
	v, e := recurrence(RecurrenceInput{StartDate: "2030-01-02", Time: "10:00", Timezone: "Asia/Kolkata", Weekdays: []int{3, 5}, Count: 4, Minutes: 60}, now)
	if e != nil || len(v) != 4 || v[0].Format(time.RFC3339) != "2030-01-02T04:30:00Z" || v[3].In(mustLocation()).Weekday() != time.Friday {
		t.Fatalf("bad recurring schedule: %v %v", v, e)
	}
	for _, in := range []RecurrenceInput{{StartDate: "2030-01-02", Time: "10:00", Timezone: "Asia/Kolkata", Weekdays: []int{3, 3}, Count: 4, Minutes: 60}, {StartDate: "2030-01-02", Time: "10:00", Timezone: "Bad/Zone", Weekdays: []int{3}, Count: 4, Minutes: 60}, {StartDate: "2030-03-10", Time: "02:30", Timezone: "America/New_York", Weekdays: []int{0}, Count: 1, Minutes: 60}} {
		if _, e := recurrence(in, now); e == nil {
			t.Fatal("invalid recurrence accepted")
		}
	}
	av := defaultAvailability("t")
	av.Windows = []domain.WeeklyWindow{{Day: 3, StartMinute: 600, EndMinute: 720}}
	if !available(av, v[0], v[0].Add(time.Hour)) {
		t.Fatal("valid availability rejected")
	}
	av.LeaveDates = []string{"2030-01-02"}
	if available(av, v[0], v[0].Add(time.Hour)) {
		t.Fatal("leave ignored")
	}
}
func mustLocation() *time.Location { v, _ := time.LoadLocation("Asia/Kolkata"); return v }

func TestAvailabilityUsesWallClockOnClockChangeDays(t *testing.T) {
	for _, date := range []string{"2030-03-10", "2030-11-03"} {
		t.Run(date, func(t *testing.T) {
			loc, err := time.LoadLocation("America/New_York")
			if err != nil {
				t.Fatal(err)
			}
			start, err := time.ParseInLocation("2006-01-02 15:04", date+" 10:00", loc)
			if err != nil {
				t.Fatal(err)
			}
			av := domain.Availability{Timezone: loc.String(), Windows: []domain.WeeklyWindow{{Day: 0, StartMinute: 600, EndMinute: 660}}}
			if !available(av, start, start.Add(time.Hour)) {
				t.Fatal("10–11 local offering shifted after the clock change")
			}
			if available(av, start.Add(-time.Hour), start) || available(av, start.Add(time.Hour), start.Add(2*time.Hour)) {
				t.Fatal("accepted a class outside the local offering")
			}
		})
	}
	loc, _ := time.LoadLocation("America/New_York")
	day := time.Date(2030, 3, 10, 0, 0, 0, 0, loc)
	if _, ok := availabilityBoundary(day, 150); ok {
		t.Fatal("nonexistent spring-forward window boundary accepted")
	}
	day = time.Date(2030, 11, 3, 0, 0, 0, 0, loc)
	if _, ok := availabilityBoundary(day, 90); ok {
		t.Fatal("ambiguous fall-back window boundary accepted")
	}
	end, ok := availabilityBoundary(day, 1440)
	if !ok || end.Format("2006-01-02 15:04") != "2030-11-04 00:00" {
		t.Fatal("end-of-day boundary must remain local midnight")
	}
	_, err := recurrence(RecurrenceInput{StartDate: "2030-04-07", Time: "01:45", Timezone: "Australia/Lord_Howe", Weekdays: []int{0}, Count: 1, Minutes: 60}, time.Date(2030, 2, 1, 0, 0, 0, 0, time.UTC))
	if err == nil {
		t.Fatal("half-hour clock fold accepted as a unique recurring time")
	}
}

func TestAtlasTuitionContinuity(t *testing.T) {
	uri := os.Getenv("TEST_MONGODB_URI")
	if uri == "" {
		t.Skip("TEST_MONGODB_URI required for Atlas tuition tests")
	}
	t.Setenv("SEED_PASSWORD", testPassword)
	ctx := context.Background()
	name := "tutor_test_tuition_" + token()[:12]
	s, e := storage.Connect(ctx, uri, name)
	if e != nil {
		t.Fatal("Atlas test connection failed")
	}
	defer s.Client.Disconnect(ctx)
	if e = s.Migrate(ctx); e != nil {
		t.Fatal(e)
	}
	if e = s.Seed(ctx, "test"); e != nil {
		t.Fatal(e)
	}
	cfg := config.Config{Env: "test", AuthProvider: "password", Origin: "http://test.local"}
	a := New(s, cfg)
	srv := httptest.NewServer(a.Routes())
	defer srv.Close()
	s2, e := storage.Connect(ctx, uri, name)
	if e != nil {
		t.Fatal(e)
	}
	defer s2.Client.Disconnect(ctx)
	srv2 := httptest.NewServer(New(s2, cfg).Routes())
	defer srv2.Close()
	client := func(id, base string) *testClient {
		jar, _ := cookiejar.New(nil)
		c := &testClient{t: t, http: &http.Client{Jar: jar, Timeout: 30 * time.Second}, base: base}
		c.login(id)
		return c
	}
	p := client("parent-a", srv.URL)
	other := client("parent-b", srv.URL)
	tutor := client("tutor-meera", srv.URL)
	replacement := client("tutor-arjun", srv.URL)
	mentor := client("mentor-a", srv.URL)
	finance := client("finance-a", srv.URL)
	consent := p.ok("POST", "/consents", map[string]any{"relationship": "parent", "accepted": true}, 201)
	learner := p.ok("POST", "/learners", map[string]any{"name": "Fictional tuition learner", "class": 8, "board": "CBSE", "language": "Hindi", "kind": "minor", "consentId": consent["id"]}, 201)
	trial := domain.Trial{ID: "reviewed-tuition-fixture", OwnerID: "parent-a", TutorID: "tutor-meera", MentorID: "mentor-a", LearnerID: learner["id"].(string), LearnerName: "Fictional tuition learner", Subject: "Mathematics", Class: 8, Status: "reviewed", Start: a.Now().Add(-48 * time.Hour), End: a.Now().Add(-47 * time.Hour)}
	if _, e = s.C("trials").InsertOne(ctx, trial); e != nil {
		t.Fatal(e)
	}
	windows := []domain.WeeklyWindow{}
	for d := 0; d < 7; d++ {
		windows = append(windows, domain.WeeklyWindow{Day: d, StartMinute: 0, EndMinute: 1440})
	}
	av := domain.Availability{Timezone: "Asia/Kolkata", Windows: windows, LeaveDates: []string{}, DailyCapacity: 4, BufferMinutes: 15, FeePaise: 0}
	tutor.ok("PUT", "/availability", av, 200)
	replacement.ok("PUT", "/availability", av, 200)
	first := time.Now().In(mustLocation()).AddDate(0, 0, 3)
	schedule := RecurrenceInput{StartDate: first.Format("2006-01-02"), Time: "10:00", Timezone: "Asia/Kolkata", Weekdays: []int{int(first.Weekday())}, Count: 3, Minutes: 60}
	create := func(tc *testClient, sch RecurrenceInput, key string) domain.Enrollment {
		t.Helper()
		status, _, raw := tc.call("POST", "/enrollments", map[string]any{"trialId": trial.ID, "schedule": sch, "offeringVersion": 1, "accepted": true}, map[string]string{"Idempotency-Key": key})
		if status != 201 {
			t.Fatalf("create tuition %d %s", status, raw)
		}
		var v domain.Enrollment
		if e := json.Unmarshal(raw, &v); e != nil {
			t.Fatal(e)
		}
		return v
	}
	v := create(p, schedule, "tuition-first-request")
	detail := func(tc *testClient, id string) domain.TuitionDetail {
		t.Helper()
		status, _, raw := tc.call("GET", "/enrollments/"+id, nil, nil)
		if status != 200 {
			t.Fatalf("detail %d %s", status, raw)
		}
		var d domain.TuitionDetail
		if e := json.Unmarshal(raw, &d); e != nil {
			t.Fatal(e)
		}
		return d
	}
	t.Run("immutable quote idempotency and permission boundaries", func(t *testing.T) {
		again := create(p, schedule, "tuition-first-request")
		if again.ID != v.ID || again.Agreement.TotalPaise != 0 || again.Status != "pending_agreement" {
			t.Fatal("bad quote or retry")
		}
		other.ok("GET", "/enrollments/"+v.ID, nil, 404)
		replacement.ok("GET", "/enrollments/"+v.ID, nil, 404)
		finance.ok("GET", "/enrollments/"+v.ID, nil, 403)
		p.ok("POST", "/enrollments/"+v.ID+"/action", map[string]any{"action": "accept", "version": 1}, 403)
		tutor.ok("POST", "/enrollments/"+v.ID+"/action", map[string]any{"action": "accept", "version": 1}, 200)
		d := detail(p, v.ID)
		if d.Enrollment.Status != "active" || len(d.Sessions) != 3 || d.Remaining != 3 {
			t.Fatal("agreement acceptance did not reserve package")
		}
	})
	t.Run("recurring conflict rolls back every reservation", func(t *testing.T) {
		conflict := create(p, schedule, "tuition-conflict-request")
		tutor.ok("POST", "/enrollments/"+conflict.ID+"/action", map[string]any{"action": "accept", "version": 1}, 409)
		d := detail(p, conflict.ID)
		if d.Enrollment.Status != "pending_agreement" || d.Sessions[0].Status != "planned" {
			t.Fatal("partial recurring commit")
		}
	})
	t.Run("family-visible conversation is idempotent and assignment-scoped", func(t *testing.T) {
		body := map[string]any{"body": "Could we practise thirds and sixths with a number line?"}
		var firstID string
		for n := 0; n < 2; n++ {
			status, response, raw := p.call("POST", "/enrollments/"+v.ID+"/messages", body, map[string]string{"Idempotency-Key": "conversation-retry-key"})
			if status != 201 {
				t.Fatalf("message %d %s", status, raw)
			}
			if n == 0 {
				firstID = response["id"].(string)
			} else if response["id"] != firstID {
				t.Fatal("duplicate message")
			}
		}
		for _, reader := range []*testClient{p, tutor, mentor} {
			page := reader.ok("GET", "/enrollments/"+v.ID+"/messages", nil, 200)
			if len(page["items"].([]any)) != 1 {
				t.Fatal("shared conversation missing")
			}
		}
		other.ok("GET", "/enrollments/"+v.ID+"/messages", nil, 404)
		finance.ok("GET", "/enrollments/"+v.ID+"/messages", nil, 403)
		notifications := tutor.ok("GET", "/notifications", nil, 200)
		items := notifications["items"].([]any)
		if len(items) != 1 {
			t.Fatal("notification not persisted")
		}
		notificationID := items[0].(map[string]any)["id"].(string)
		other.ok("POST", "/notifications/"+notificationID+"/read", map[string]any{}, 404)
		tutor.ok("POST", "/notifications/"+notificationID+"/read", map[string]any{}, 200)
	})
	t.Run("both parties agree reschedule and old time is released atomically", func(t *testing.T) {
		d := detail(p, v.ID)
		s := d.Sessions[0]
		next := s.Start.Add(2 * time.Hour)
		p.ok("POST", "/classes/"+s.ID+"/action", map[string]any{"action": "propose", "version": s.Version, "start": next, "reason": "Family needs another suitable time"}, 200)
		p.ok("POST", "/classes/"+s.ID+"/action", map[string]any{"action": "accept_change", "version": s.Version + 1}, 403)
		tutor.ok("POST", "/classes/"+s.ID+"/action", map[string]any{"action": "accept_change", "version": s.Version + 1}, 200)
		d = detail(p, v.ID)
		if !d.Sessions[0].Start.Equal(next) {
			t.Fatal("reschedule not persisted")
		}
	})
	t.Run("cancellation preserves makeup balance and supports agreed rebooking", func(t *testing.T) {
		d := detail(p, v.ID)
		s := d.Sessions[1]
		tutor.ok("POST", "/classes/"+s.ID+"/action", map[string]any{"action": "cancel", "version": s.Version, "reason": "Tutor requested personal leave"}, 200)
		d = detail(p, v.ID)
		s = d.Sessions[1]
		if s.Status != "makeup_due" || d.Remaining != 3 {
			t.Fatal("makeup balance lost")
		}
		tutor.ok("POST", "/classes/"+s.ID+"/action", map[string]any{"action": "propose", "version": s.Version, "start": s.Start.Add(2 * time.Hour), "reason": "Proposed makeup after the leave"}, 200)
		p.ok("POST", "/classes/"+s.ID+"/action", map[string]any{"action": "accept_change", "version": s.Version + 1}, 200)
	})
	t.Run("versioned plans are family-owned and stale edits cannot overwrite", func(t *testing.T) {
		body := map[string]any{"expectedVersion": 0, "startingPoint": "Learner compares halves using number lines.", "goals": "Explain equivalent fractions independently.", "topics": []domain.LearningTopic{{Title: "Equivalent fractions", Status: "practising", Evidence: "Explained one half and two quarters using a model.", Practice: "Compare thirds and sixths on a number line."}}, "nextSteps": "Continue with number lines before symbolic notation.", "reviewDate": a.Now().Add(30 * 24 * time.Hour)}
		p.ok("POST", "/enrollments/"+v.ID+"/plans", body, 403)
		mentor.ok("POST", "/enrollments/"+v.ID+"/plans", body, 201)
		mentor.ok("POST", "/enrollments/"+v.ID+"/plans", body, 409)
		body["expectedVersion"] = 1
		body["goals"] = "Explain equivalent fractions and compare thirds."
		mentor.ok("POST", "/enrollments/"+v.ID+"/plans", body, 201)
		if len(detail(p, v.ID).Plans) != 2 {
			t.Fatal("historical plan was overwritten")
		}
	})
	t.Run("family-authorised handover reserves replacement and revokes old tutor", func(t *testing.T) {
		h := p.ok("POST", "/enrollments/"+v.ID+"/handovers", map[string]any{"tutorId": "tutor-arjun", "reason": "Family requests supported tutor continuity", "consent": true}, 201)
		id := h["id"].(string)
		replacement.ok("GET", "/enrollments/"+v.ID, nil, 404)
		mentor.ok("POST", "/handovers/"+id+"/action", map[string]any{"action": "prepare", "nextSteps": "Preserve both plan versions and start with thirds on number lines."}, 200)
		replacement.ok("POST", "/handovers/"+id+"/action", map[string]any{"action": "accept"}, 200)
		tutor.ok("GET", "/enrollments/"+v.ID, nil, 404)
		tutor.ok("GET", "/enrollments/"+v.ID+"/messages", nil, 404)
		replacement.ok("GET", "/enrollments/"+v.ID+"/messages", nil, 200)
		d := detail(replacement, v.ID)
		if d.Enrollment.TutorID != "tutor-arjun" || len(d.Agreements) != 2 || len(d.Plans) != 2 {
			t.Fatal("handover lost family continuity")
		}
	})
	t.Run("lesson evidence requires explicit development timing and academic review", func(t *testing.T) {
		d := detail(p, v.ID)
		s := d.Sessions[0]
		body := map[string]any{"action": "record", "version": s.Version, "attendance": "present", "notes": "Explained equivalent fractions with two worked number lines.", "homework": "Compare thirds and sixths with a number line."}
		replacement.ok("POST", "/classes/"+s.ID+"/action", body, 409)
		body["developmentRecord"] = true
		replacement.ok("POST", "/classes/"+s.ID+"/action", body, 200)
		mentor.ok("POST", "/classes/"+s.ID+"/action", map[string]any{"action": "review", "version": s.Version + 1, "review": "Evidence supports continued practice; revisit the denominator misconception."}, 200)
		d = detail(p, v.ID)
		if d.Delivered != 1 || d.Remaining != 2 {
			t.Fatal("incorrect package balance")
		}
	})
	t.Run("overlap across two API instances permits one complete package", func(t *testing.T) {
		// A different future time, using the original approved tutor after handover.
		sch := schedule
		sch.Time = "16:00"
		sch.Count = 2
		one := create(p, sch, "parallel-tuition-one")
		two := create(p, sch, "parallel-tuition-two")
		second := client("tutor-meera", srv2.URL)
		var wg sync.WaitGroup
		codes := make(chan int, 2)
		for i, tc := range []*testClient{tutor, second} {
			id := []string{one.ID, two.ID}[i]
			wg.Add(1)
			go func(tc *testClient, id string) {
				defer wg.Done()
				status, _, _ := tc.call("POST", "/enrollments/"+id+"/action", map[string]any{"action": "accept", "version": 1}, nil)
				codes <- status
			}(tc, id)
		}
		wg.Wait()
		close(codes)
		ok, conflict := 0, 0
		for code := range codes {
			if code == 200 {
				ok++
			} else if code == 409 {
				conflict++
			} else {
				t.Fatalf("unexpected concurrent response %d", code)
			}
		}
		if ok != 1 || conflict != 1 {
			t.Fatal("overlapping packages both committed")
		}
	})
	t.Log("Isolated tuition database retained for review:", name)
}
