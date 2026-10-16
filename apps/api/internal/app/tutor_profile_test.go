package app

import (
	"context"
	"encoding/json"
	"go.mongodb.org/mongo-driver/v2/bson"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"reflect"
	"sync"
	"testing"
	"time"
	"tutorplatform/internal/config"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
)

func TestApprovedTutorPublicProfile(t *testing.T) {
	uri := os.Getenv("TEST_MONGODB_URI")
	if uri == "" {
		t.Skip("TEST_MONGODB_URI required")
	}
	t.Setenv("SEED_PASSWORD", testPassword)
	ctx := context.Background()
	s, e := storage.Connect(ctx, uri, "tutor_test_public_profile_"+token()[:12])
	if e != nil {
		t.Fatal(e)
	}
	defer s.Client.Disconnect(ctx)
	if e = s.Migrate(ctx); e != nil {
		t.Fatal(e)
	}
	if e = s.Seed(ctx, "test"); e != nil {
		t.Fatal(e)
	}
	a := New(s, config.Config{Env: "test", Origin: "http://test.local", AuthProvider: "password", MeetingProvider: "google"})
	now := time.Date(2026, 10, 13, 3, 0, 0, 0, time.UTC)
	a.Now = func() time.Time { return now }
	installGoogleFixture(t, a, "tutor-meera")
	p := completeApplication("Sample profile tutor", now)
	p.Education.ExperienceYears = 3
	p.Education.ExperienceMonths = 4
	p.Education.NewToTutoring = false
	p.TeachingAreas[0].Languages = []string{"English", "Hindi"}
	p.Approach.DemoFileID = "private-demo"
	if _, e = s.C("applications").UpdateOne(ctx, bson.M{"_id": "tutor-meera"}, bson.M{"$set": bson.M{"profile": p}}); e != nil {
		t.Fatal(e)
	}
	for _, f := range []domain.PrivateFile{{ID: "private-demo", TargetKind: "application", TargetID: "tutor-meera", UploaderID: "tutor-meera", ContentType: "video/mp4", Status: "clean", ScannedAt: &now, CreatedAt: now}, {ID: "other-video", TargetKind: "application", TargetID: "tutor-arjun", UploaderID: "tutor-arjun", ContentType: "video/mp4", Status: "clean", ScannedAt: &now, CreatedAt: now}, {ID: "pending-photo", TargetKind: "public_profile", TargetID: "tutor-meera", UploaderID: "tutor-meera", ContentType: "image/png", Status: "uploading", CreatedAt: now}} {
		f.ObjectKey = f.ID
		if _, e = s.C("files").InsertOne(ctx, f); e != nil {
			t.Fatal(e)
		}
	}
	av := domain.Availability{ID: "tutor-meera", Timezone: "Asia/Kolkata", DailyCapacity: 6, Windows: []domain.WeeklyWindow{{Day: 2, StartMinute: 600, EndMinute: 840}}, LeaveDates: []string{}, BufferMinutes: 15}
	if _, e = s.C("availability").InsertOne(ctx, av); e != nil {
		t.Fatal(e)
	}
	server := httptest.NewServer(a.Routes())
	defer server.Close()
	client := func(id string) *testClient {
		jar, _ := cookiejar.New(nil)
		c := &testClient{t: t, http: &http.Client{Jar: jar}, base: server.URL}
		c.login(id)
		return c
	}
	tutor := client("tutor-meera")
	pending := client("tutor-a")
	parent := client("parent-a")
	parent.ok("GET", "/tutor-profile", nil, 403)
	pending.ok("PUT", "/tutor-profile", map[string]any{"version": 0, "introduction": p.Approach.Introduction, "photoFileId": "", "introVideoFileId": "", "publishVideo": false}, 403)
	before, e := storage.One[domain.Application](ctx, s, "applications", bson.M{"_id": "tutor-meera"})
	if e != nil {
		t.Fatal(e)
	}
	public := tutor.ok("GET", "/tutors/tutor-meera", nil, 200)
	if public["introVideoUrl"] != nil || public["experienceMonths"].(float64) != 40 || len(public["boards"].([]any)) != 1 || len(public["teachingLanguages"].([]any)) != 2 {
		t.Fatal("public projection lost facts or exposed private demo", public)
	}
	_, _, languageRaw := tutor.call("GET", "/tutors?language=English", nil, nil)
	var languageResults []domain.PublicTutor
	if e = json.Unmarshal(languageRaw, &languageResults); e != nil {
		t.Fatal(e)
	}
	found := false
	for _, row := range languageResults {
		if row.ID == "tutor-meera" {
			found = true
		}
	}
	if !found {
		t.Fatal("additional tutor-provided teaching language cannot be found")
	}
	tutor.ok("GET", "/tutors/tutor-meera/intro-video", nil, 404)
	input := map[string]any{"version": 0, "introduction": "I teach using worked examples, short practice and questions about each learner's reasoning.", "photoFileId": "", "introVideoFileId": "other-video", "publishVideo": true}
	tutor.ok("PUT", "/tutor-profile", input, 422)
	input["introVideoFileId"] = ""
	input["publishVideo"] = false
	input["photoFileId"] = "pending-photo"
	tutor.ok("PUT", "/tutor-profile", input, 422)
	input["photoFileId"] = ""
	input["scope"] = map[string]any{"subject": "Science"}
	tutor.ok("PUT", "/tutor-profile", input, 422)
	delete(input, "scope")
	csrf := tutor.csrf
	tutor.csrf = ""
	tutor.ok("PUT", "/tutor-profile", input, 403)
	tutor.csrf = csrf
	input["introVideoFileId"] = "private-demo"
	tutor.ok("PUT", "/tutor-profile", input, 200)
	public = tutor.ok("GET", "/tutors/tutor-meera", nil, 200)
	if public["introVideoUrl"] != nil {
		t.Fatal("selection without consent exposed video")
	}
	tutor.ok("PUT", "/tutor-profile", input, 409)
	input["version"] = 1
	input["publishVideo"] = true
	tutor.ok("PUT", "/tutor-profile", input, 200)
	public = tutor.ok("GET", "/tutors/tutor-meera", nil, 200)
	if public["introVideoUrl"] == nil {
		t.Fatal("explicit publication missing")
	}
	consentCount, e := s.C("audit").CountDocuments(ctx, bson.M{"target": "tutor-meera", "action": "tutor.public_profile_updated", "publicProfileVersion": 2, "introVideoFileId": "private-demo", "videoPublished": true})
	if e != nil || consentCount != 1 {
		t.Fatal("publication choice was not retained in its audit", e)
	}
	input["version"] = 2
	input["publishVideo"] = false
	tutor.ok("PUT", "/tutor-profile", input, 200)
	tutor.ok("GET", "/tutors/tutor-meera/intro-video", nil, 404)
	after, e := storage.One[domain.Application](ctx, s, "applications", bson.M{"_id": "tutor-meera"})
	if e != nil {
		t.Fatal(e)
	}
	if !reflect.DeepEqual(before.Profile, after.Profile) || !reflect.DeepEqual(before.Scope, after.Scope) || !reflect.DeepEqual(before.Fees, after.Fees) || before.AssessorID != after.AssessorID {
		t.Fatal("profile editing changed evidence or academic/fee controls")
	}
	input["version"] = 3
	var wg sync.WaitGroup
	statuses := make([]int, 2)
	for i := range statuses {
		wg.Add(1)
		go func(i int) { defer wg.Done(); statuses[i], _, _ = tutor.call("PUT", "/tutor-profile", input, nil) }(i)
	}
	wg.Wait()
	if !((statuses[0] == 200 && statuses[1] == 409) || (statuses[0] == 409 && statuses[1] == 200)) {
		t.Fatal("concurrent profile edits both committed", statuses)
	}
	times := func() []domain.PublicTrialTime {
		_, _, raw := tutor.call("GET", "/tutors/tutor-meera/trial-times?mode=online", nil, nil)
		var v struct {
			Slots []domain.PublicTrialTime `json:"slots"`
		}
		if e = json.Unmarshal(raw, &v); e != nil {
			t.Fatal(e)
		}
		return v.Slots
	}
	slots := times()
	if len(slots) == 0 {
		t.Fatal("ready teaching hours not offered")
	}
	occupied := slots[0]
	expired := now.Add(-time.Minute)
	active := now.Add(time.Hour)
	if _, e = s.C("guards").InsertOne(ctx, guard{ID: "t:tutor-meera:" + occupied.Start.UTC().Format("2006-01-02"), Intervals: []interval{{ID: "active-hold", Start: occupied.Start.Add(-15 * time.Minute), End: occupied.End.Add(15 * time.Minute), ExpiresAt: &active}, {ID: "expired-hold", Start: occupied.Start.Add(2 * time.Hour), End: occupied.End.Add(2 * time.Hour), ExpiresAt: &expired}}}); e != nil {
		t.Fatal(e)
	}
	slots = times()
	foundExpired := false
	for _, slot := range slots {
		if domain.Overlap(slot.Start.Add(-15*time.Minute), slot.End.Add(15*time.Minute), occupied.Start.Add(-15*time.Minute), occupied.End.Add(15*time.Minute)) {
			t.Fatal("reserved trial time exposed")
		}
		if slot.Start.Equal(occupied.Start.Add(2 * time.Hour)) {
			foundExpired = true
		}
	}
	if !foundExpired {
		t.Fatal("expired hold blocked time")
	}
	loc, _ := time.LoadLocation("Asia/Kolkata")
	date := occupied.Start.In(loc).Format("2006-01-02")
	if _, e = s.C("availability").UpdateOne(ctx, bson.M{"_id": "tutor-meera"}, bson.M{"$set": bson.M{"leaveDates": []string{date}}}); e != nil {
		t.Fatal(e)
	}
	for _, slot := range times() {
		if slot.Start.In(loc).Format("2006-01-02") == date {
			t.Fatal("planned leave exposed as a trial time")
		}
	}
	if _, e = s.C("availability").UpdateOne(ctx, bson.M{"_id": "tutor-meera"}, bson.M{"$set": bson.M{"leaveDates": []string{}, "dailyCapacity": 1}}); e != nil {
		t.Fatal(e)
	}
	for _, slot := range times() {
		if slot.Start.In(loc).Format("2006-01-02") == date {
			t.Fatal("daily capacity ignored")
		}
	}
	if _, e = s.C("google_connections").UpdateOne(ctx, bson.M{"_id": "tutor-meera"}, bson.M{"$set": bson.M{"status": "disconnected"}}); e != nil {
		t.Fatal(e)
	}
	if len(times()) != 0 {
		t.Fatal("unready online lessons offered")
	}
	if _, e = s.C("availability").UpdateOne(ctx, bson.M{"_id": "tutor-meera"}, bson.M{"$set": bson.M{"paused": true}}); e != nil {
		t.Fatal(e)
	}
	public = tutor.ok("GET", "/tutors/tutor-meera", nil, 200)
	if len(public["bookingModes"].([]any)) != 0 || public["teachingHoursSet"] != false {
		t.Fatal("paused tutor claims readiness")
	}
	if _, e = s.C("applications").UpdateOne(ctx, bson.M{"_id": "tutor-meera"}, bson.M{"$set": bson.M{"status": "suspended"}}); e != nil {
		t.Fatal(e)
	}
	input["version"] = 3
	tutor.ok("PUT", "/tutor-profile", input, 403)
}
