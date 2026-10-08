package app

import (
	"context"
	"encoding/json"
	"fmt"
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

func TestMongoRepositoryImprovements(t *testing.T) {
	uri := os.Getenv("TEST_MONGODB_URI")
	if uri == "" {
		t.Skip("TEST_MONGODB_URI required")
	}
	ctx := context.Background()
	s, err := storage.Connect(ctx, uri, "tutor_test_optimization_"+token()[:12])
	if err != nil {
		t.Fatal(err)
	}
	defer s.Client.Disconnect(ctx)
	if err = s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	t.Setenv("SEED_PASSWORD", testPassword)
	if err = s.Seed(ctx, "test"); err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC().Truncate(time.Second)
	a := New(s, config.Config{Env: "test", AuthProvider: "password", Origin: "http://test.local"})
	a.Now = func() time.Time { return now }
	server := httptest.NewServer(a.Routes())
	defer server.Close()
	insert := func(t *testing.T, collection string, rows []any) {
		t.Helper()
		if _, err := s.C(collection).InsertMany(ctx, rows); err != nil {
			t.Fatal(err)
		}
	}

	t.Run("mentor dashboard excludes unassigned and other assessor applications", func(t *testing.T) {
		insert(t, "applications", []any{
			domain.Application{ID: "opt-assigned", Name: "Assigned sample", Status: "submitted", AssessorID: "mentor-a", Sample: true},
			domain.Application{ID: "opt-unassigned", Name: "Unassigned sample", Status: "submitted", Sample: true},
			domain.Application{ID: "opt-other", Name: "Other sample", Status: "submitted", AssessorID: "mentor-b", Sample: true},
		})
		jar, _ := cookiejar.New(nil)
		mentor := &testClient{t: t, http: &http.Client{Jar: jar, Timeout: 30 * time.Second}, base: server.URL}
		mentor.login("mentor-a")
		dashboard := mentor.ok("GET", "/dashboard", nil, 200)
		found := false
		for _, raw := range dashboard["applications"].([]any) {
			item := raw.(map[string]any)
			if item["id"] == "opt-assigned" {
				found = true
			}
			if item["id"] == "opt-unassigned" || item["id"] == "opt-other" {
				t.Fatal("unassigned application leaked")
			}
		}
		if !found {
			t.Fatal("assigned application missing")
		}
	})

	t.Run("search eligibility and distance precede pagination", func(t *testing.T) {
		rows, availability := []any{}, []any{}
		for i := 0; i < 205; i++ {
			id := fmt.Sprintf("opt-search-%03d", i)
			latitude := 25.78
			if i < 102 {
				latitude = 28.6
			}
			v := domain.Application{ID: id, Name: fmt.Sprintf("Tutor %03d", i), Status: "approved", Sample: true, Scope: domain.Scope{Subject: "Optimization", Mode: "home", MinClass: 1, MaxClass: 12, ExpiresAt: now.Add(time.Hour)}, AssessmentAt: now}
			profile := completeApplication(v.Name, now)
			v.Profile = &profile
			v.Profile.About.PhotoFileID = "photo"
			v.Profile.About.Location = &domain.LocationPoint{Latitude: latitude, Longitude: 87.47, Locality: "Purnea"}
			v.Profile.Availability.Home.TravelKM = 5
			v.Profile.Approach.DemoFileID = "demo"
			rows = append(rows, v)
			availability = append(availability, bson.M{"_id": id, "paused": i == 102, "timezone": "Asia/Kolkata", "windows": bson.A{}, "dailyCapacity": 1, "version": 1})
		}
		insert(t, "applications", rows)
		insert(t, "availability", availability)
		path := server.URL + "/api/v1/tutors?subject=Optimization&latitude=25.78&longitude=87.47&radiusKm=5"
		fetch := func(path string) ([]domain.PublicTutor, string) {
			t.Helper()
			res, err := http.Get(path)
			if err != nil {
				t.Fatal(err)
			}
			defer res.Body.Close()
			if res.StatusCode != 200 {
				t.Fatalf("search status %d", res.StatusCode)
			}
			var items []domain.PublicTutor
			if err = json.NewDecoder(res.Body).Decode(&items); err != nil {
				t.Fatal(err)
			}
			return items, res.Header.Get("X-Next-Cursor")
		}
		first, next := fetch(path)
		if len(first) != 100 || next == "" || first[0].ID != "opt-search-103" {
			t.Fatalf("incorrect eligible page: %d next=%t", len(first), next != "")
		}
		if first[0].PhotoURL == "" || first[0].IntroVideoURL == "" || !first[0].AssessmentAt.Equal(now) || first[0].ServiceRadiusKM != 5 {
			t.Fatal("projection lost public profile fields")
		}
		last, next := fetch(path + "&cursor=" + next)
		if len(last) != 2 || next != "" || last[0].ID != "opt-search-203" {
			t.Fatal("second page missing or duplicated")
		}
		first, next = fetch(server.URL + "/api/v1/tutors?subject=Optimization")
		if len(first) != 100 || next == "" {
			t.Fatal("nongeographic first page incorrect")
		}
		last, _ = fetch(server.URL + "/api/v1/tutors?subject=Optimization&cursor=" + next)
		if len(last) != 100 || last[0].ID != "opt-search-100" {
			t.Fatal("name pagination incorrect")
		}
		res, err := http.Get(path + "&cursor=invalid!")
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != 422 {
			t.Fatal("malformed cursor accepted")
		}
		for _, query := range []string{"latitude=NaN&longitude=87.47", "latitude=wrong&longitude=wrong", "radiusKm=NaN"} {
			res, err := http.Get(server.URL + "/api/v1/tutors?" + query)
			if err != nil {
				t.Fatal(err)
			}
			res.Body.Close()
			if res.StatusCode != 422 {
				t.Fatal("invalid location silently accepted")
			}
		}
	})

	t.Run("reports count all classes and plans beyond one hundred", func(t *testing.T) {
		classes, plans := []any{}, []any{}
		for i := 0; i < 130; i++ {
			classes = append(classes, domain.ClassSession{ID: fmt.Sprintf("opt-class-%03d", i), EnrollmentID: "opt-enrollment", TutorID: "opt-tutor", Status: "reviewed", Start: now, End: now.Add(time.Hour), Version: 1})
			plans = append(plans, domain.LearningPlan{ID: fmt.Sprintf("opt-plan-%03d", i), EnrollmentID: "opt-enrollment", Version: i + 1, Topics: []domain.LearningTopic{}, AuthorID: "mentor-a", ReviewDate: now.Add(time.Duration(i) * time.Hour)})
		}
		insert(t, "classes", classes)
		insert(t, "learning_plans", plans)
		assignments := []domain.Enrollment{{ID: "opt-enrollment", TutorID: "opt-tutor", Status: "active", PlanVersion: 130}}
		reports, err := a.mentorAssignmentReports(ctx, assignments)
		if err != nil {
			t.Fatal(err)
		}
		if reports[0].DeliveredClasses != 130 || reports[0].NextReviewDate != now.Add(129*time.Hour).Format(time.RFC3339) {
			t.Fatal("report truncated")
		}
		tutors, err := a.mentorTutorReports(ctx, []domain.Application{{ID: "opt-tutor"}}, assignments)
		if err != nil {
			t.Fatal(err)
		}
		if tutors[0].ReviewedClasses != 130 || tutors[0].ActiveLearners != 1 {
			t.Fatal("tutor aggregates incorrect")
		}
	})

	t.Run("collection totals preserve exact paise refunds and UTC months", func(t *testing.T) {
		insert(t, "payment_intents", []any{
			domain.PaymentIntent{ID: "opt-pay-1", OwnerID: "parent-a", EnrollmentID: "opt-enrollment", Amount: 12345, Refunded: 2345, Currency: "INR", State: "captured", CreatedAt: time.Date(2020, 1, 31, 20, 0, 0, 0, time.UTC)},
			domain.PaymentIntent{ID: "opt-pay-2", OwnerID: "parent-a", EnrollmentID: "opt-enrollment", Amount: 6789, Refunded: 89, Currency: "INR", State: "refund_review", CreatedAt: time.Date(2020, 2, 1, 0, 0, 0, 0, time.UTC)},
			domain.PaymentIntent{ID: "opt-pay-3", OwnerID: "parent-a", EnrollmentID: "opt-enrollment", Amount: 999, Currency: "INR", State: "created", CreatedAt: now},
		})
		total, months, err := a.paymentCollections(ctx)
		if err != nil {
			t.Fatal(err)
		}
		if total.GrossPaise != 19134 || total.RefundedPaise != 2434 || total.NetPaise != 16700 || len(months) != 2 || months[0].Month != "2020-02" || months[1].NetPaise != 10000 {
			t.Fatalf("incorrect totals: %#v %#v", total, months)
		}
		insert(t, "payment_intents", []any{
			domain.PaymentIntent{ID: "opt-pay-zero-date", OwnerID: "parent-a", EnrollmentID: "opt-enrollment", Amount: 100, Currency: "INR", State: "captured"},
			bson.M{"_id": "opt-pay-missing-date", "ownerId": "parent-a", "enrollmentId": "opt-enrollment", "amountPaise": int64(200), "currency": "INR", "state": "captured"},
		})
		total, months, err = a.paymentCollections(ctx)
		if err != nil || len(months) != 3 || months[0].Month != "unknown" || months[0].Payments != 2 || months[0].GrossPaise != 300 || total.NetPaise != 17000 {
			t.Fatalf("unknown dates must share one bucket: %#v %v", months, err)
		}
	})

	t.Run("bounded concurrent batches retain retries and lease exclusivity", func(t *testing.T) {
		jobs := []any{}
		for i := 0; i < 8; i++ {
			jobs = append(jobs, job{ID: fmt.Sprintf("opt-job-%d", i), Kind: "finance_earning", Status: "pending", AvailableAt: now, Payload: map[string]string{"classId": "missing-fixture"}})
		}
		insert(t, "outbox", jobs)
		n, err := a.runJobBatch(ctx, 3)
		if err != nil || n != 3 {
			t.Fatalf("batch bound: %d %v", n, err)
		}
		var wg sync.WaitGroup
		for i := 0; i < 2; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				if _, err := a.runJobBatch(ctx, 10); err != nil {
					t.Error(err)
				}
			}()
		}
		wg.Wait()
		n, err = a.runJobBatch(ctx, 10)
		if err != nil || n != 0 {
			t.Fatal("retried before backoff")
		}
		count, err := s.C("outbox").CountDocuments(ctx, bson.M{"_id": bson.M{"$regex": "^opt-job-"}, "attempts": 1, "status": "pending", "lastError": "provider_or_record_unavailable", "leaseOwner": bson.M{"$exists": false}})
		if err != nil || count != 8 {
			t.Fatalf("lease/retry changed: %d %v", count, err)
		}
	})
}
