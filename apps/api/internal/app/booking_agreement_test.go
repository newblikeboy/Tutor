package app

import (
	"context"
	"encoding/base64"
	"go.mongodb.org/mongo-driver/v2/bson"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
	"tutorplatform/internal/config"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
)

func testTeachingAgreementContent(mode string) domain.TeachingAgreementContent {
	return domain.TeachingAgreementContent{Title: "Fictional test " + mode + " agreement", Body: "Test agreement only: record the actual lesson and observe the saved teaching schedule.", Privacy: "Test privacy conditions: keep the child's records private.", Education: "Test education conditions: teach only the agreed subjects."}
}
func seedTestTeachingAgreements(t *testing.T, a *App) {
	t.Helper()
	a.Config.MailTokenKey = base64.StdEncoding.EncodeToString(make([]byte, 32))
	if a.Mail == nil {
		a.Mail = &testEmailSender{}
	}
	for _, mode := range []string{"online", "home"} {
		content := testTeachingAgreementContent(mode)
		d := domain.TeachingAgreementDraft{ID: mode, Mode: mode, Version: 1, Draft: content, Published: &domain.TeachingAgreementVersion{TeachingAgreementContent: content, Mode: mode, Version: 1, PublishedAt: a.Now()}}
		if _, err := a.Store.C("teaching_agreements").InsertOne(context.Background(), d); err != nil {
			t.Fatal(err)
		}
	}
}
func testBookingCode(t *testing.T, a *App, c *testClient, en domain.Enrollment) (string, string) {
	t.Helper()
	response := c.ok("POST", "/enrollments/"+en.ID+"/signing-code", map[string]any{"version": en.Version, "documentHash": en.TutorAgreement.DocumentHash, "accepted": true}, 202)
	id := response["challengeId"].(string)
	j, err := storage.One[job](context.Background(), a.Store, "outbox", bson.M{"_id": "email-code:" + id})
	if err != nil {
		t.Fatal(err)
	}
	code, err := a.protectCode(id, j.Payload["encryptedCode"], false)
	if err != nil {
		t.Fatal(err)
	}
	return id, code
}
func acceptTestBooking(t *testing.T, a *App, c *testClient, id string) {
	t.Helper()
	en, err := storage.One[domain.Enrollment](context.Background(), a.Store, "enrollments", bson.M{"_id": id})
	if err != nil {
		t.Fatal(err)
	}
	challenge, code := testBookingCode(t, a, c, en)
	c.ok("POST", "/enrollments/"+id+"/signature", map[string]any{"version": en.Version, "documentHash": en.TutorAgreement.DocumentHash, "accepted": true, "challengeId": challenge, "code": code}, 200)
	en, err = storage.One[domain.Enrollment](context.Background(), a.Store, "enrollments", bson.M{"_id": id})
	if err != nil {
		t.Fatal(err)
	}
	c.ok("POST", "/enrollments/"+id+"/action", map[string]any{"version": en.Version, "action": "accept_booking"}, 200)
}

func TestMongoBookingAgreementsAndCompletion(t *testing.T) {
	uri := os.Getenv("TEST_MONGODB_URI")
	if uri == "" {
		t.Skip("TEST_MONGODB_URI required")
	}
	t.Setenv("SEED_PASSWORD", testPassword)
	ctx := context.Background()
	s, err := storage.Connect(ctx, uri, "tutor_test_booking_agreements_"+token()[:12])
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
	a := New(s, config.Config{Env: "test", AuthProvider: "password", Origin: "http://test.local", MailTokenKey: base64.StdEncoding.EncodeToString(make([]byte, 32))})
	a.Mail = &testEmailSender{}
	now := time.Now()
	a.Now = func() time.Time { return now }
	server := httptest.NewServer(a.Routes())
	defer server.Close()
	client := func(id string) *testClient {
		jar, _ := cookiejar.New(nil)
		c := &testClient{t: t, http: &http.Client{Jar: jar, Timeout: 30 * time.Second}, base: server.URL}
		c.login(id)
		return c
	}
	admin, parent, tutor, other, foreign := client("admin-a"), client("parent-a"), client("tutor-arjun"), client("parent-b"), client("tutor-meera")
	parent.ok("GET", "/admin/teaching-agreements", nil, 403)
	if _, err = a.bookingTeachingAgreement(ctx, "online", "unpublished", domain.Agreement{}); err == nil {
		t.Fatal("unpublished agreement accepted")
	}
	for _, mode := range []string{"online", "home"} {
		admin.ok("PUT", "/admin/teaching-agreements/"+mode, map[string]any{"version": 0, "action": "publish", "content": testTeachingAgreementContent(mode)}, 200)
	}
	admin.ok("PUT", "/admin/teaching-agreements/online", map[string]any{"version": 0, "action": "publish", "content": testTeachingAgreementContent("online")}, 409)
	var en domain.Enrollment
	start := now.Add(2 * time.Hour)
	ag := domain.Agreement{ID: "signed-booking:1", EnrollmentID: "signed-booking", TutorID: "tutor-arjun", Version: 1, Subject: "Mathematics", Subjects: []string{"Mathematics"}, Mode: "online", Minutes: 60, SessionCount: 2, Starts: []time.Time{start, start.Add(24 * time.Hour)}, TotalPaise: 10000, Currency: "INR", TermsVersion: "fixture", Timezone: "Asia/Kolkata"}
	var policy *domain.TutorBookingAgreement
	if err = s.Tx(ctx, func(ctx context.Context) error {
		var e error
		policy, e = a.bookingTeachingAgreement(ctx, "online", "signed-booking", ag)
		return e
	}); err != nil {
		t.Fatal(err)
	}
	en = domain.Enrollment{ID: "signed-booking", OwnerID: "parent-a", TutorID: "tutor-arjun", MentorID: "mentor-a", LearnerID: "fixture-student", LearnerName: "Fictional student", Class: 8, Status: "pending_tutor_acceptance", Version: 1, Agreement: ag, TutorAgreement: policy, PaymentIntentID: "signed-payment"}
	for col, v := range map[string]any{"enrollments": en, "payment_intents": domain.PaymentIntent{ID: "signed-payment", OwnerID: "parent-a", EnrollmentID: en.ID, State: "captured", Amount: 10000, Currency: "INR"}} {
		if _, err = s.C(col).InsertOne(ctx, v); err != nil {
			t.Fatal(err)
		}
	}
	av := defaultAvailability(en.TutorID)
	av.Windows = nil
	for day := 0; day < 7; day++ {
		av.Windows = append(av.Windows, domain.WeeklyWindow{Day: day, StartMinute: 0, EndMinute: 1440})
	}
	av.DailyCapacity = 20
	if _, err = s.C("availability").InsertOne(ctx, av); err != nil {
		t.Fatal(err)
	}
	for i, id := range []string{"signed-first", "signed-makeup"} {
		s0 := domain.ClassSession{ID: id, EnrollmentID: en.ID, TutorID: en.TutorID, Status: "scheduled", Version: 1, Start: ag.Starts[i], End: ag.Starts[i].Add(time.Hour), Timezone: "Asia/Kolkata"}
		if _, err = s.C("classes").InsertOne(ctx, s0); err != nil {
			t.Fatal(err)
		}
	}
	tutor.ok("POST", "/classes/signed-first/action", map[string]any{"action": "complete", "version": 1, "notes": "The actual fractions lesson was taught.", "homeworkGiven": false, "developmentRecord": true}, 409)
	tutor.ok("POST", "/enrollments/"+en.ID+"/action", map[string]any{"action": "accept_booking", "version": 1}, 403)
	foreign.ok("POST", "/enrollments/"+en.ID+"/signing-code", map[string]any{"version": 1, "documentHash": policy.DocumentHash, "accepted": true}, 404)
	tutor.ok("POST", "/enrollments/"+en.ID+"/signing-code", map[string]any{"version": 1, "documentHash": policy.DocumentHash, "accepted": false}, 422)
	challenge, code := testBookingCode(t, a, tutor, en)
	body := map[string]any{"version": 1, "documentHash": policy.DocumentHash, "accepted": true, "challengeId": challenge, "code": "99999x"}
	tutor.ok("POST", "/enrollments/"+en.ID+"/signature", body, 422)
	c, err := storage.One[emailChallenge](ctx, s, "email_challenges", bson.M{"_id": challenge})
	if err != nil || c.Attempts != 1 {
		t.Fatal("failed attempt did not commit", c.Attempts, err)
	}
	// A signing challenge cannot be reused for login or email verification.
	tutor.ok("POST", "/auth/email/confirm", map[string]any{"challengeId": challenge, "code": code}, 401)
	for i := 0; i < 4; i++ {
		tutor.ok("POST", "/enrollments/"+en.ID+"/signature", body, 422)
	}
	body["code"] = code
	tutor.ok("POST", "/enrollments/"+en.ID+"/signature", body, 422)
	now = now.Add(61 * time.Second)
	oldChallenge := challenge
	challenge, code = testBookingCode(t, a, tutor, en)
	body["challengeId"] = oldChallenge
	tutor.ok("POST", "/enrollments/"+en.ID+"/signature", body, 422)
	body["challengeId"] = challenge
	body["code"] = code
	if _, err = s.C("email_challenges").UpdateOne(ctx, bson.M{"_id": challenge}, bson.M{"$set": bson.M{"expiresAt": now.Add(-time.Second)}}); err != nil {
		t.Fatal(err)
	}
	tutor.ok("POST", "/enrollments/"+en.ID+"/signature", body, 422)
	now = now.Add(61 * time.Second)
	challenge, code = testBookingCode(t, a, tutor, en)
	body["challengeId"] = challenge
	body["code"] = code
	body["documentHash"] = "another-document"
	tutor.ok("POST", "/enrollments/"+en.ID+"/signature", body, 409)
	body["documentHash"] = policy.DocumentHash
	tutor.ok("POST", "/enrollments/"+en.ID+"/signature", body, 200)
	tutor.ok("POST", "/enrollments/"+en.ID+"/signature", body, 409)
	en, err = storage.One[domain.Enrollment](ctx, s, "enrollments", bson.M{"_id": en.ID})
	if err != nil {
		t.Fatal(err)
	}
	admin.ok("PUT", "/admin/teaching-agreements/online", map[string]any{"version": 1, "action": "publish", "content": testTeachingAgreementContent("replacement version")}, 200)
	if en.TutorAgreement.Version != 1 || en.TutorAgreement.Signature == nil || en.Status != "pending_tutor_acceptance" {
		t.Fatal("signing activated or rewrote the booking")
	}
	tutor.ok("POST", "/enrollments/"+en.ID+"/action", map[string]any{"action": "accept_booking", "version": en.Version}, 200)
	tutor.ok("POST", "/classes/signed-first/action", map[string]any{"action": "complete", "version": 1, "notes": "We practised comparing and adding fractions.", "homeworkGiven": false, "developmentRecord": true}, 200)
	tutor.ok("POST", "/classes/signed-first/action", map[string]any{"action": "complete", "version": 1, "notes": "We practised comparing and adding fractions.", "homeworkGiven": false, "developmentRecord": true}, 409)
	en, err = storage.One[domain.Enrollment](ctx, s, "enrollments", bson.M{"_id": en.ID})
	if err != nil || en.Status != "active" {
		t.Fatal("open classes disappeared from current bookings", err)
	}
	// A makeup class retains the booking even when its old scheduled date passes.
	if _, err = s.C("classes").UpdateOne(ctx, bson.M{"_id": "signed-makeup"}, bson.M{"$set": bson.M{"status": "makeup_due"}}); err != nil {
		t.Fatal(err)
	}
	now = now.Add(4 * time.Hour)
	current := tutor.ok("GET", "/enrollments", nil, 200)
	if len(current["items"].([]any)) != 1 {
		t.Fatal("makeup booking not current")
	}
	j, err := storage.One[job](ctx, s, "outbox", bson.M{"_id": "email:class-completed:signed-first:parent-a"})
	if err != nil {
		t.Fatal(err)
	}
	u, err := storage.One[domain.User](ctx, s, "users", bson.M{"_id": "parent-a"})
	if err != nil {
		t.Fatal(err)
	}
	mail, err := a.emailTemplate(ctx, j, u)
	if err != nil || !strings.Contains(mail.URL, "report=1") || !strings.Contains(mail.Intro, "mistake") {
		t.Fatal("completion report email missing", err)
	}
	other.ok("POST", "/classes/signed-first/report", map[string]any{"version": 2, "reason": "This is not my household class."}, 404)
	status, report, raw := parent.call("POST", "/classes/signed-first/report", map[string]any{"version": 2, "reason": "The class may have been marked completed by mistake."}, map[string]string{"Idempotency-Key": "class-report-retry"})
	if status != 201 {
		t.Fatalf("report %d %s", status, raw)
	}
	again := parent.ok("GET", "/cases/"+report["id"].(string), nil, 200)
	if again["case"].(map[string]any)["status"] != "open" {
		t.Fatal("report not saved")
	}
	if _, err = s.C("classes").UpdateOne(ctx, bson.M{"_id": "signed-makeup"}, bson.M{"$set": bson.M{"status": "scheduled", "start": now.Add(-2 * time.Hour), "end": now.Add(-time.Hour)}}); err != nil {
		t.Fatal(err)
	}
	tutor.ok("POST", "/classes/signed-makeup/action", map[string]any{"action": "complete", "version": 1, "notes": "We revised the remaining fraction exercises.", "homeworkGiven": true, "homework": "Practise the five fraction questions."}, 200)
	en, err = storage.One[domain.Enrollment](ctx, s, "enrollments", bson.M{"_id": en.ID})
	if err != nil || en.Status != "completed" {
		t.Fatal("closed booking did not become past", err)
	}
	past := tutor.ok("GET", "/enrollments?history=1", nil, 200)
	if len(past["items"].([]any)) != 1 {
		t.Fatal("past booking missing")
	}
}
