package app

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"tutorplatform/internal/config"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
)

func TestClassProgressValidation(t *testing.T) {
	e := domain.Enrollment{Class: 8, Agreement: domain.Agreement{Subjects: []string{"Mathematics", "Science"}}}
	valid := domain.ClassProgress{Subject: "Science", Topics: []domain.LearningTopic{{Title: "Plants", Status: "practising", Evidence: "Identified leaf parts independently.", Practice: "Draw and label one leaf."}}, HomeworkStatus: "completed", Feedback: "Recognises the important leaf parts.", NextSteps: "Practise describing photosynthesis.", Test: &domain.TestResult{Title: "Plant quiz", Score: 0, Maximum: 20}}
	if err := validateClassProgress(&valid, e); err != nil {
		t.Fatal(err)
	}
	for name, change := range map[string]func(*domain.ClassProgress){
		"unbooked subject":     func(p *domain.ClassProgress) { p.Subject = "Hindi" },
		"no topics":            func(p *domain.ClassProgress) { p.Topics = nil },
		"duplicate topic":      func(p *domain.ClassProgress) { p.Topics = append(p.Topics, p.Topics[0]) },
		"bad homework":         func(p *domain.ClassProgress) { p.HomeworkStatus = "inferred" },
		"marks exceed maximum": func(p *domain.ClassProgress) { p.Test = &domain.TestResult{Title: "Quiz", Score: 21, Maximum: 20} },
		"zero maximum":         func(p *domain.ClassProgress) { p.Test = &domain.TestResult{Title: "Quiz", Score: 0, Maximum: 0} },
		"negative marks":       func(p *domain.ClassProgress) { p.Test = &domain.TestResult{Title: "Quiz", Score: -1, Maximum: 20} },
	} {
		t.Run(name, func(t *testing.T) {
			p := valid
			p.Topics = append([]domain.LearningTopic{}, valid.Topics...)
			change(&p)
			if validateClassProgress(&p, e) == nil {
				t.Fatal("invalid progress accepted")
			}
		})
	}
	e.Class = 5
	e.Agreement.Subjects = []string{domain.AllSubjects}
	if err := validateClassProgress(&valid, e); err != nil {
		t.Fatal("All Subjects must allow recorded subject detail", err)
	}
	e.Class = 6
	if validateClassProgress(&valid, e) == nil {
		t.Fatal("All Subjects widened upper-class coverage")
	}
}

func TestMongoLearnerProgress(t *testing.T) {
	uri := os.Getenv("TEST_MONGODB_URI")
	if uri == "" {
		t.Skip("TEST_MONGODB_URI required")
	}
	t.Setenv("SEED_PASSWORD", testPassword)
	ctx := context.Background()
	name := "tutor_test_progress_" + token()[:12]
	s, err := storage.Connect(ctx, uri, name)
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
	a := New(s, config.Config{Env: "test", AuthProvider: "password", Origin: "http://test.local"})
	srv := httptest.NewServer(a.Routes())
	defer srv.Close()
	client := func(id string) *testClient {
		jar, _ := cookiejar.New(nil)
		c := &testClient{t: t, http: &http.Client{Jar: jar, Timeout: 30 * time.Second}, base: srv.URL}
		c.login(id)
		return c
	}
	p, other, tutor, old := client("parent-a"), client("parent-b"), client("tutor-arjun"), client("tutor-meera")
	tutor.ok("PUT", "/availability", domain.Availability{Timezone: "Asia/Kolkata", Windows: []domain.WeeklyWindow{{Day: 1, StartMinute: 540, EndMinute: 1020}}, LeaveDates: []string{}, DailyCapacity: 12}, 200)
	learner := domain.Learner{ID: "progress-child", OwnerID: "parent-a", Name: "Fictional progress learner", Class: 8, Board: "CBSE", Language: "English", Kind: "adult_self", Version: 1}
	if _, err = s.C("learners").InsertOne(ctx, learner); err != nil {
		t.Fatal(err)
	}
	enrollment := domain.Enrollment{ID: "progress-package", OwnerID: "parent-a", LearnerID: learner.ID, LearnerName: learner.Name, Class: 8, TutorID: "tutor-arjun", TutorName: "Arjun sample", MentorID: "mentor-a", Status: "active", Version: 1, Agreement: domain.Agreement{ID: "progress-package:1", EnrollmentID: "progress-package", Version: 1, Subject: "Mathematics", Subjects: []string{"Mathematics"}, Mode: "online", SessionCount: 125, Minutes: 60, TotalPaise: 125000, FeePerSessionPaise: 1000, Currency: "INR", TermsVersion: "test", Terms: "Fictional recorded-history fixture", Timezone: "Asia/Kolkata"}}
	if _, err = s.C("enrollments").InsertOne(ctx, enrollment); err != nil {
		t.Fatal(err)
	}
	rows := []any{}
	for i := 0; i < 125; i++ {
		start := a.Now().AddDate(0, 0, -125+i)
		tutorID := "tutor-arjun"
		if i == 0 {
			tutorID = "tutor-meera"
		}
		rows = append(rows, domain.ClassSession{ID: fmt.Sprintf("progress-class-%03d", i), EnrollmentID: enrollment.ID, TutorID: tutorID, Start: start, End: start.Add(time.Hour), Status: "completed", Attendance: "present", Notes: "Recorded fraction lesson evidence.", Homework: "Practise equivalent fractions.", Version: 1})
	}
	if _, err = s.C("classes").InsertMany(ctx, rows); err != nil {
		t.Fatal(err)
	}
	unpaid := enrollment
	unpaid.ID = "unpaid-package"
	unpaid.Status = "awaiting_payment"
	if _, err = s.C("enrollments").InsertOne(ctx, unpaid); err != nil {
		t.Fatal(err)
	}
	if _, err = s.C("classes").InsertOne(ctx, domain.ClassSession{ID: "held-class", EnrollmentID: unpaid.ID, TutorID: "tutor-arjun", Start: a.Now(), End: a.Now().Add(time.Hour), Status: "held", Version: 1}); err != nil {
		t.Fatal(err)
	}
	reportPath := "/learners/" + learner.ID + "/progress"
	cancelled := unpaid
	cancelled.ID = "cancelled-checkout"
	cancelled.Status = "cancelled"
	if _, err = s.C("enrollments").InsertOne(ctx, cancelled); err != nil {
		t.Fatal(err)
	}
	intent := domain.PaymentIntent{ID: "cancelled-order", OwnerID: "parent-a", EnrollmentID: cancelled.ID, State: "created", Amount: 60000, Currency: "INR"}
	if _, err = s.C("payment_intents").InsertOne(ctx, intent); err != nil {
		t.Fatal(err)
	}
	other.ok("GET", reportPath, nil, 404)
	tutor.ok("GET", reportPath, nil, 403)
	read := func() domain.LearnerProgress {
		raw, _ := json.Marshal(p.ok("GET", reportPath, nil, 200))
		var d domain.LearnerProgress
		if err := json.Unmarshal(raw, &d); err != nil {
			t.Fatal(err)
		}
		return d
	}
	d := read()
	if len(d.Sessions) != 125 || len(d.Enrollments) != 1 || d.Sessions[0].TutorName == "" {
		t.Fatal("complete family history missing", len(d.Sessions), len(d.Enrollments))
	}
	progress := domain.ClassProgress{Subject: "Mathematics", Topics: []domain.LearningTopic{{Title: "Fractions", Status: "independent", Evidence: "Explained equivalent fractions independently.", Practice: "Apply fractions to word problems."}}, HomeworkStatus: "completed", Feedback: "Now explains fractions independently.", NextSteps: "Apply the skill to word problems.", Test: &domain.TestResult{Title: "Fractions quiz", Score: 18, Maximum: 20}, RecordedAt: time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC)}
	if _, err = s.C("payment_intents").UpdateOne(ctx, bson.M{"_id": intent.ID}, bson.M{"$set": bson.M{"state": "captured"}}); err != nil {
		t.Fatal(err)
	}
	if len(read().Enrollments) != 2 {
		t.Fatal("cancelled captured package history lost")
	}
	if _, err = s.C("payment_intents").UpdateOne(ctx, bson.M{"_id": intent.ID}, bson.M{"$set": bson.M{"state": "created"}}); err != nil {
		t.Fatal(err)
	}
	path := "/classes/progress-class-124/action"
	body := map[string]any{"action": "progress", "version": 1, "progress": progress}
	p.ok("POST", path, body, 403)
	old.ok("POST", path, body, 404)
	tutor.ok("POST", "/classes/progress-class-000/action", body, 403)
	bad := progress
	bad.Subject = "Hindi"
	body["progress"] = bad
	tutor.ok("POST", path, body, 422)
	body["progress"] = progress
	tutor.ok("POST", path, body, 200)
	tutor.ok("POST", path, body, 409)
	d = read()
	recorded := d.Sessions[124]
	if recorded.Progress == nil || recorded.Progress.Test.Score != 18 || recorded.Progress.RecordedAt.Year() == 2000 || recorded.Status != "completed" || recorded.Notes != "Recorded fraction lesson evidence." {
		t.Fatal("progress changed historical attendance/notes or trusted timestamp", recorded)
	}
	if current, er := storage.One[domain.Enrollment](ctx, s, "enrollments", bson.M{"_id": enrollment.ID}); er != nil || current.Status != "active" {
		t.Fatal("progress edit changed package state", er)
	}
	if journals, er := s.C("ledger").CountDocuments(ctx, bson.M{}); er != nil || journals != 0 {
		t.Fatal("progress edit affected money", er)
	}
	if _, err = s.C("enrollments").UpdateOne(ctx, bson.M{"_id": enrollment.ID}, bson.M{"$set": bson.M{"tutorId": "tutor-meera"}}); err != nil {
		t.Fatal(err)
	}
	body["version"] = 2
	tutor.ok("POST", path, body, 404)
	if read().Sessions[124].Progress == nil {
		t.Fatal("family progress lost on handover")
	}
	t.Log("Isolated progress database retained:", name)
}
