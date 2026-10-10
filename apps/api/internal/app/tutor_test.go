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
	"testing"
	"time"
	"tutorplatform/internal/config"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
)

func tutorProgressFixture(subject string) *domain.ClassProgress {
	return &domain.ClassProgress{Subject: subject, Topics: []domain.LearningTopic{{Title: "Fractions", Status: "practising", Evidence: "Explained the worked examples independently.", Practice: "Complete the next worked examples."}}, HomeworkStatus: "not_checked", Feedback: "Can explain today's examples.", NextSteps: "Practise applying the method independently."}
}

func TestMongoTutorWorkspace(t *testing.T) {
	uri := os.Getenv("TEST_MONGODB_URI")
	if uri == "" {
		t.Skip("TEST_MONGODB_URI required")
	}
	t.Setenv("SEED_PASSWORD", testPassword)
	ctx := context.Background()
	name := "tutor_test_teaching_" + token()[:12]
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
	insert := func(col string, v any) {
		if _, e := s.C(col).InsertOne(ctx, v); e != nil {
			t.Fatal(e)
		}
	}
	update := func(col, id string, v bson.M) {
		if _, e := s.C(col).UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": v}); e != nil {
			t.Fatal(e)
		}
	}
	update("applications", "tutor-arjun", bson.M{"scope.subjects": []string{"Mathematics", "Science"}})
	tutor.ok("PUT", "/availability", defaultAvailability("tutor-arjun"), 200)
	l := domain.Learner{ID: "teaching-child", OwnerID: "parent-a", Name: "Fictional teaching learner", Class: 8, Board: "CBSE", Language: "English", Kind: "adult_self", Version: 1}
	insert("learners", l)
	en := domain.Enrollment{ID: "teaching-package", OwnerID: "parent-a", LearnerID: l.ID, LearnerName: l.Name, Class: 8, TutorID: "tutor-arjun", TutorName: "Arjun", Status: "active", Version: 1, Agreement: domain.Agreement{Subject: "Mathematics", Subjects: []string{"Mathematics", "Science"}, Mode: "online", Minutes: 60, SessionCount: 126}}
	insert("enrollments", en)
	// Older packages must not consume the page of current assignments.
	for i := 0; i < 30; i++ {
		archived := en
		archived.ID = fmt.Sprintf("archive-%03d", i)
		archived.LearnerID = "archived-fixture"
		archived.Status = "completed"
		insert("enrollments", archived)
	}
	currentPage := tutor.ok("GET", "/enrollments", nil, 200)
	if len(currentPage["items"].([]any)) != 1 || currentPage["nextCursor"] != "" {
		t.Fatal("archives hid the current assignment")
	}
	archivePage := tutor.ok("GET", "/enrollments?history=1", nil, 200)
	if len(archivePage["items"].([]any)) != 25 || archivePage["nextCursor"] == "" {
		t.Fatal("archive pagination missing")
	}
	archiveNext := tutor.ok("GET", "/enrollments?history=1&cursor="+archivePage["nextCursor"].(string), nil, 200)
	if len(archiveNext["items"].([]any)) != 5 {
		t.Fatal("archive continuation incomplete")
	}
	tutor.ok("GET", "/enrollments?history=invalid", nil, 422)
	for i := 0; i < 125; i++ {
		start := a.Now().AddDate(0, 0, i-125)
		insert("classes", domain.ClassSession{ID: fmt.Sprintf("teach-%03d", i), EnrollmentID: en.ID, TutorID: en.TutorID, Start: start, End: start.Add(time.Hour), Status: "completed", Attendance: "present", Version: 1})
	}
	start := a.Now().Add(10 * time.Minute)
	lesson := domain.ClassSession{ID: "teach-next", EnrollmentID: en.ID, TutorID: en.TutorID, Start: start, End: start.Add(time.Hour), Status: "scheduled", Version: 1}
	insert("classes", lesson)
	p.ok("GET", "/tutor/workspace", nil, 403)
	read := tutor.ok("GET", "/tutor/workspace", nil, 200)
	if len(read["sessions"].([]any)) != 126 || len(read["learners"].([]any)) != 1 {
		t.Fatal("incomplete tutor workspace")
	}
	old.ok("GET", "/tutor/learners/"+l.ID+"/progress", nil, 404)
	p.ok("GET", "/tutor/learners/"+l.ID+"/progress", nil, 403)
	tutor.ok("GET", "/tutor/learners/"+l.ID+"/progress", nil, 200)
	tutor.ok("POST", "/classes/teach-next/action", map[string]any{"action": "plan_subject", "subject": "Hindi", "version": 1}, 422)
	tutor.ok("POST", "/classes/teach-next/action", map[string]any{"action": "plan_subject", "subject": "Science", "version": 1}, 200)
	tutor.ok("POST", "/classes/teach-next/action", map[string]any{"action": "plan_subject", "subject": "Science", "version": 1}, 409)
	tutor.ok("POST", "/classes/teach-000/action", map[string]any{"action": "progress", "version": 1, "progress": tutorProgressFixture("Mathematics")}, 409)
	tutor.ok("POST", "/classes/teach-next/meeting", map[string]any{"version": 2}, 503)
	gateway := &recruitmentMeetings{ambiguous: true}
	a.Meetings = gateway
	other.ok("GET", "/classes/teach-next/meeting/join", nil, 404)
	p.ok("POST", "/classes/teach-next/meeting", map[string]any{"version": 2}, 403)
	tutor.ok("POST", "/classes/teach-next/meeting", map[string]any{"version": 2}, 200)
	current, err := storage.One[domain.ClassSession](ctx, s, "classes", bson.M{"_id": lesson.ID})
	if err != nil {
		t.Fatal(err)
	}
	j, err := storage.One[job](ctx, s, "outbox", bson.M{"_id": current.Meeting.JobID})
	if err != nil {
		t.Fatal(err)
	}
	if err = a.processMeeting(ctx, j); err == nil {
		t.Fatal("ambiguous provider result masked")
	}
	gateway.findAvailable = true
	if err = a.processMeeting(ctx, j); err != nil {
		t.Fatal(err)
	}
	if gateway.creates != 1 {
		t.Fatal("ambiguous create duplicated")
	}
	update("outbox", j.ID, bson.M{"status": "done"})
	if j.Payload["tutorEmail"] != "tutor-arjun@example.test" {
		t.Fatal("assigned host not attached")
	}
	conflicting := domain.Trial{ID: "host-conflict", OwnerID: "parent-b", LearnerID: l.ID, TutorID: en.TutorID, Class: 8, Subject: "Mathematics", Mode: "online", Status: "confirmed", Start: lesson.Start, End: lesson.End}
	insert("trials", conflicting)
	tutor.ok("POST", "/trials/host-conflict/meeting", map[string]any{"version": 0}, 409)
	cancelled := conflicting
	cancelled.ID = "cancel-before-provider"
	cancelled.Start = lesson.Start.Add(3 * time.Hour)
	cancelled.End = lesson.End.Add(3 * time.Hour)
	insert("trials", cancelled)
	tutor.ok("POST", "/trials/cancel-before-provider/meeting", map[string]any{"version": 0}, 200)
	queued, err := storage.One[domain.Trial](ctx, s, "trials", bson.M{"_id": cancelled.ID})
	if err != nil {
		t.Fatal(err)
	}
	queuedJob, err := storage.One[job](ctx, s, "outbox", bson.M{"_id": queued.Meeting.JobID})
	if err != nil {
		t.Fatal(err)
	}
	tutor.ok("POST", "/trials/cancel-before-provider/action", map[string]any{"action": "cancel"}, 200)
	if err = a.processMeeting(ctx, queuedJob); err != nil {
		t.Fatal(err)
	}
	if gateway.creates != 1 {
		t.Fatal("cancelled meeting created anyway")
	}
	update("outbox", queuedJob.ID, bson.M{"status": "done"})
	joined := p.ok("GET", "/classes/teach-next/meeting/join", nil, 200)
	if joined["joinUrl"] == "" {
		t.Fatal("missing authorized join")
	}
	raw, _ := json.Marshal(tutor.ok("GET", "/tutor/workspace", nil, 200))
	var state domain.TutorWorkspace
	if err = json.Unmarshal(raw, &state); err != nil {
		t.Fatal(err)
	}
	for _, ss := range state.Sessions {
		if ss.Meeting != nil && (ss.Meeting.JoinURL != "" || ss.Meeting.ID != "" || ss.Meeting.JobID != "") {
			t.Fatal("private provider data exposed")
		}
	}
	record := map[string]any{"action": "record", "version": 3, "developmentRecord": true, "attendance": "present", "notes": "Explained the worked examples independently.", "homework": "Complete the next worked examples."}
	tutor.ok("POST", "/classes/teach-next/action", record, 422)
	record["progress"] = tutorProgressFixture("Science")
	tutor.ok("POST", "/classes/teach-next/action", record, 200)
	tutor.ok("GET", "/enrollments/"+en.ID, nil, 200)
	tutor.ok("GET", "/tutor/learners/"+l.ID+"/progress", nil, 404)
	currentPage = tutor.ok("GET", "/enrollments", nil, 200)
	if len(currentPage["items"].([]any)) != 0 {
		t.Fatal("completed package remained a current assignment")
	}
	tutor.ok("POST", "/classes/teach-next/action", map[string]any{"action": "progress", "version": 4, "progress": tutorProgressFixture("Science")}, 200)
	tutor.ok("POST", "/classes/teach-next/action", map[string]any{"action": "propose", "version": 5, "start": a.Now().Add(time.Hour)}, 404)
	p.ok("GET", "/classes/teach-next/meeting/join", nil, 404)
	if _, err = a.runJobBatch(ctx, 10); err != nil {
		t.Fatal(err)
	}
	if gateway.deletes != 1 {
		t.Fatal("completed meeting not removed")
	}
	feedback := conflicting
	feedback.ID = "feedback-correction"
	feedback.Start = a.Now().Add(-2 * time.Hour)
	feedback.End = a.Now().Add(-time.Hour)
	insert("trials", feedback)
	tutor.ok("POST", "/trials/feedback-correction/action", map[string]any{"action": "complete", "notes": "Actual tutor evidence for the fictional trial.", "nextSteps": "Practise with five fraction examples.", "review": "Explains worked examples independently."}, 200)
	correction := map[string]any{"action": "feedback", "version": 0, "notes": "Corrected tutor evidence for the fictional trial.", "nextSteps": "Practise comparing fraction examples.", "review": "Corrected feedback with the actual observation."}
	tutor.ok("POST", "/trials/feedback-correction/action", correction, 409)
	correction["version"] = 1
	tutor.ok("POST", "/trials/feedback-correction/action", correction, 200)
	update("trials", feedback.ID, bson.M{"completedAt": a.Now().Add(-8 * 24 * time.Hour)})
	correction["version"] = 2
	tutor.ok("POST", "/trials/feedback-correction/action", correction, 409)
	unpaid := en
	unpaid.ID = "cancelled-unpaid"
	unpaid.Status = "cancelled"
	insert("enrollments", unpaid)
	tutor.ok("GET", "/enrollments/cancelled-unpaid", nil, 404)
	update("applications", "tutor-arjun", bson.M{"scope.modes": []string{"online", "home"}})
	currentHome := en
	currentHome.ID = "home-address"
	currentHome.Status = "active"
	currentHome.Agreement.Mode = "home"
	insert("enrollments", currentHome)
	insert("preferences", accountPreferences{ID: "parent-a", Language: "en", Location: &domain.LocationPoint{Address: "Fictional assigned home address"}})
	read = tutor.ok("GET", "/tutor/workspace", nil, 200)
	if len(read["briefs"].([]any)) != 1 {
		t.Fatal("assigned Home address not available")
	}
	update("enrollments", currentHome.ID, bson.M{"status": "completed"})
	read = tutor.ok("GET", "/tutor/workspace", nil, 200)
	if len(read["briefs"].([]any)) != 0 {
		t.Fatal("completed package exposed current home address")
	}
	if err = a.notifyActivity(ctx, en.TutorID, "booking_confirmed", en.ID); err != nil {
		t.Fatal(err)
	}
	notificationID := "booking_confirmed:" + en.ID + ":" + en.TutorID
	tutor.ok("POST", "/notifications/"+notificationID+"/read", map[string]any{}, 200)
	if err = a.notifyActivity(ctx, en.TutorID, "booking_confirmed", en.ID); err != nil {
		t.Fatal(err)
	}
	n, err := storage.One[domain.Notification](ctx, s, "notifications", bson.M{"_id": notificationID})
	if err != nil || !n.Read {
		t.Fatal("retry reset receipt", err)
	}
	tutor.ok("POST", "/notifications/"+notificationID+"/read", map[string]any{}, 200)
	repeated, err := storage.One[domain.Notification](ctx, s, "notifications", bson.M{"_id": notificationID})
	if err != nil || n.ReadAt == nil || repeated.ReadAt == nil || !n.ReadAt.Equal(*repeated.ReadAt) {
		t.Fatal("read receipt changed on retry")
	}
	update("enrollments", en.ID, bson.M{"tutorId": "tutor-meera"})
	update("enrollments", currentHome.ID, bson.M{"tutorId": "tutor-meera"})
	tutor.ok("GET", "/enrollments/"+en.ID, nil, 404)
	tutor.ok("GET", "/tutor/learners/"+l.ID+"/progress", nil, 404)
	t.Log("Isolated tutor workflow database retained:", name)
}
