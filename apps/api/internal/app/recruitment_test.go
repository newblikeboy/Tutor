package app

import (
	"context"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"go.mongodb.org/mongo-driver/v2/bson"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
	"tutorplatform/internal/config"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/meetings"
	"tutorplatform/internal/storage"
)

// Provider doubles are limited to tests; normal runtime always uses the HTTPS adapters.
type recruitmentMeetings struct {
	creates, updates, deletes int
	ambiguous, findAvailable  bool
}

func (g *recruitmentMeetings) Create(context.Context, string, time.Time, time.Time) (meetings.Meeting, error) {
	g.creates++
	if g.ambiguous {
		return meetings.Meeting{}, errors.New("test lost response")
	}
	return meetings.Meeting{ID: "12345678901", JoinURL: "https://zoom.us/j/12345678901?pwd=fixture"}, nil
}
func (g *recruitmentMeetings) Update(context.Context, string, time.Time, time.Time) (meetings.Meeting, error) {
	g.updates++
	return meetings.Meeting{ID: "12345678901", JoinURL: "https://zoom.us/j/12345678901?pwd=fixture"}, nil
}
func (g *recruitmentMeetings) Delete(context.Context, string) error { g.deletes++; return nil }
func (g *recruitmentMeetings) Find(context.Context, string) (meetings.Meeting, bool, error) {
	return meetings.Meeting{ID: "12345678901", JoinURL: "https://zoom.us/j/12345678901?pwd=fixture"}, g.findAvailable, nil
}

type recruitmentVideo struct{ data []byte }

func (s *recruitmentVideo) Put(_ context.Context, _ string, b []byte) error {
	s.data = append([]byte{}, b...)
	return nil
}
func (s *recruitmentVideo) Read(context.Context, string) ([]byte, error) { return s.data, nil }
func introductionMP4() []byte {
	box := func(kind string, data []byte) []byte {
		b := make([]byte, 8)
		binary.BigEndian.PutUint32(b, uint32(len(data)+8))
		copy(b[4:], kind)
		return append(b, data...)
	}
	b := box("ftyp", []byte("isom\x00\x00\x00\x00isommp42"))
	b = append(b, box("moov", make([]byte, 4))...)
	return append(b, box("mdat", make([]byte, 32))...)
}
func TestMongoRecruitmentProviders(t *testing.T) {
	uri := os.Getenv("TEST_MONGODB_URI")
	if uri == "" {
		t.Skip("TEST_MONGODB_URI required")
	}
	t.Setenv("SEED_PASSWORD", testPassword)
	ctx := context.Background()
	s, e := storage.Connect(ctx, uri, "tutor_test_recruitment_"+token()[:12])
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
	now := time.Now().UTC().Truncate(time.Minute)
	a := New(s, config.Config{Env: "test", AuthProvider: "password", Origin: "http://test.local", VideoProvider: "cloudinary", ZoomHostID: "fixture-host"})
	a.Now = func() time.Time { return now }
	gateway := &recruitmentMeetings{}
	a.Meetings = gateway
	a.Videos = &recruitmentVideo{}
	server := httptest.NewServer(a.Routes())
	defer server.Close()
	client := func(id string) *testClient {
		jar, _ := cookiejar.New(nil)
		c := &testClient{t: t, http: &http.Client{Jar: jar, Timeout: 30 * time.Second}, base: server.URL}
		c.login(id)
		return c
	}
	tutor, admin, mentor, parent := client("tutor-a"), client("admin-a"), client("mentor-a"), client("parent-a")
	current := func() domain.Application {
		v, err := storage.One[domain.Application](ctx, s, "applications", bson.M{"_id": "tutor-a"})
		if err != nil {
			t.Fatal(err)
		}
		return v
	}
	jobFor := func() job {
		v := current()
		j, err := storage.One[job](ctx, s, "outbox", bson.M{"_id": v.Interview.JobID})
		if err != nil {
			t.Fatal(err)
		}
		return j
	}
	p := completeApplication("Fictional recruitment applicant", now)
	t.Run("applicants cannot open teaching APIs", func(t *testing.T) {
		for _, path := range []string{"/availability", "/enrollments", "/billing", "/handovers/invitations", "/staff/overview"} {
			status, _, _ := tutor.call("GET", path, nil, nil)
			if status != 403 {
				t.Fatalf("applicant path %s returned %d", path, status)
			}
		}
		tutor.ok("GET", "/application", nil, 200)
		tutor.ok("GET", "/account", nil, 200)
		tutor.ok("PUT", "/application", map[string]any{"version": 0, "step": 4, "submit": false, "profile": p}, 200)
	})
	var fileID string
	t.Run("Cloudinary video metadata and scan gate persist", func(t *testing.T) {
		body := map[string]any{"name": "introduction.mp4", "content": base64.StdEncoding.EncodeToString(introductionMP4())}
		status, f, _ := tutor.call("POST", "/applications/tutor-a/files", body, map[string]string{"Idempotency-Key": "introduction-video-fixture"})
		if status != 201 || f["provider"] != "cloudinary" || f["status"] != "quarantined" {
			t.Fatalf("video upload status %d", status)
		}
		fileID = f["id"].(string)
		if len(current().Attachments) != 1 {
			t.Fatal("application attachment metadata was not persisted")
		}
		if n, err := s.C("files").CountDocuments(ctx, bson.M{"targetKind": "application"}); err != nil || n != 0 {
			t.Fatal("application uploads must not require a separate collection")
		}
		tutor.ok("GET", "/files/"+fileID+"/play", nil, 409)
		parent.ok("GET", "/files/"+fileID+"/play", nil, 404)
		mentor.ok("GET", "/files/"+fileID+"/play", nil, 404)
		a.Scanner = testScanner{clean: true}
		if e = a.scanFile(ctx, fileID); e != nil {
			t.Fatal(e)
		}
		req, _ := http.NewRequest("GET", server.URL+"/api/v1/files/"+fileID+"/play", nil)
		req.Header.Set("Range", "bytes=0-7")
		res, err := tutor.http.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		data, _ := io.ReadAll(res.Body)
		if res.StatusCode != 206 || res.Header.Get("Content-Type") != "video/mp4" || res.Header.Get("Cache-Control") != "no-store" || len(data) != 8 {
			t.Fatal("private video range playback failed")
		}
		p.Approach.Demonstration = "recorded"
		p.Approach.DemoAreaID = "math"
		p.Approach.DemoTopic = "Fractions"
		p.Approach.DemoFileID = fileID
		tutor.ok("PUT", "/application", map[string]any{"version": 1, "step": 6, "submit": true, "profile": p}, 200)
		status, _, _ = tutor.call("POST", "/applications/tutor-a/files", body, map[string]string{"Idempotency-Key": "submitted-upload-must-fail"})
		if status != 409 {
			t.Fatalf("submitted file changed: %d", status)
		}
	})
	t.Run("Zoom creation is queued and cannot approve a pending meeting", func(t *testing.T) {
		admin.decide("tutor-a", map[string]any{"action": "review", "conflictClear": true}, 200)
		in := map[string]any{"action": "schedule", "interview": domain.Interview{Start: now.Add(time.Hour), End: now.Add(90 * time.Minute), Timezone: "Asia/Kolkata"}}
		admin.decide("tutor-a", in, 200)
		v := current()
		if v.Interview.SyncStatus != "pending" || v.Interview.JoinURL != "" || gateway.creates != 0 {
			t.Fatal("meeting fabricated before provider confirmation")
		}
		admin.decide("tutor-a", map[string]any{"action": "approve", "reason": "Cannot approve before the final assessment.", "minClass": 6, "maxClass": 10, "mentorId": "mentor-a"}, 409)
		// Another reviewer sharing the same configured Zoom host cannot overlap.
		other := domain.Application{ID: "other-applicant", Name: "Fictional other applicant", Status: "under_review", AssessorID: "mentor-a", ConflictClear: true, Sample: true}
		if _, e = s.C("users").InsertOne(ctx, domain.User{ID: other.ID, Name: other.Name, Email: "other-applicant@example.test", Role: "tutor", Sample: true}); e != nil {
			t.Fatal(e)
		}
		if _, e = s.C("applications").InsertOne(ctx, other); e != nil {
			t.Fatal(e)
		}
		mentor.decide(other.ID, in, 409)
		j := jobFor()
		if e = a.processMeeting(ctx, j); e != nil {
			t.Fatal(e)
		}
		if e = a.processMeeting(ctx, j); e != nil {
			t.Fatal(e)
		}
		v = current()
		if gateway.creates != 1 || v.Interview.SyncStatus != "ready" || v.Interview.JoinURL == "" {
			t.Fatal("creation not persisted/idempotent")
		}
		_, own, raw := tutor.call("GET", "/application", nil, nil)
		if own["application"] == nil || bytesContainPrivateMeeting(raw) {
			t.Fatal("private Zoom metadata leaked")
		}
	})
	t.Run("reschedule and cancellation update Zoom outside the transaction", func(t *testing.T) {
		admin.decide("tutor-a", map[string]any{"action": "reschedule", "reason": "Applicant requested a different interview time.", "interview": domain.Interview{Start: now.Add(2 * time.Hour), End: now.Add(150 * time.Minute), Timezone: "Asia/Kolkata"}}, 200)
		if e = a.processMeeting(ctx, jobFor()); e != nil {
			t.Fatal(e)
		}
		if gateway.updates != 1 || gateway.creates != 1 {
			t.Fatal("reschedule recreated meeting")
		}
		admin.decide("tutor-a", map[string]any{"action": "cancel_interview", "reason": "Applicant requested cancellation for this date."}, 200)
		if e = a.processMeeting(ctx, jobFor()); e != nil {
			t.Fatal(e)
		}
		if gateway.deletes != 1 || current().Interview.JoinURL != "" {
			t.Fatal("cancellation did not remove meeting access")
		}
	})
	t.Run("lost create response reconciles without another create", func(t *testing.T) {
		gateway.ambiguous = true
		admin.decide("tutor-a", map[string]any{"action": "schedule", "interview": domain.Interview{Start: now.Add(3 * time.Hour), End: now.Add(210 * time.Minute), Timezone: "Asia/Kolkata"}}, 200)
		j := jobFor()
		if a.processMeeting(ctx, j) == nil {
			t.Fatal("lost response reported success")
		}
		if a.processMeeting(ctx, j) == nil {
			t.Fatal("unconfirmed meeting reported success")
		}
		if gateway.creates != 2 {
			t.Fatal("ambiguous create was repeated")
		}
		if _, e = s.C("outbox").UpdateOne(ctx, bson.M{"_id": j.ID}, bson.M{"$set": bson.M{"status": "failed"}}); e != nil {
			t.Fatal(e)
		}
		if _, e = s.C("applications").UpdateOne(ctx, bson.M{"_id": "tutor-a"}, bson.M{"$set": bson.M{"interview.syncStatus": "failed"}}); e != nil {
			t.Fatal(e)
		}
		version := current().Version
		mentor.ok("POST", "/staff/applications/tutor-a/meeting/retry", map[string]any{"version": version}, 403)
		parent.ok("POST", "/staff/applications/tutor-a/meeting/retry", map[string]any{"version": version}, 403)
		admin.ok("POST", "/staff/applications/tutor-a/meeting/retry", map[string]any{"version": version - 1}, 409)
		admin.ok("POST", "/staff/applications/tutor-a/meeting/retry", map[string]any{"version": version}, 200)
		if !jobFor().ZoomCreateAttempted {
			t.Fatal("retry lost ambiguous creation marker")
		}
		gateway.findAvailable = true
		if e = a.processMeeting(ctx, j); e != nil {
			t.Fatal(e)
		}
		if gateway.creates != 2 || current().Interview.SyncStatus != "ready" {
			t.Fatal("reconciliation failed")
		}
	})
	t.Run("approval opens teaching access and expiry closes it", func(t *testing.T) {
		now = now.Add(4 * time.Hour)
		admin.decide("tutor-a", map[string]any{"action": "assess", "scores": []int{4, 4, 4, 4, 4, 4}, "evidence": "Fictional assessment met the subject and teaching criteria."}, 200)
		admin.setTestFees("tutor-a", 0)
		admin.decide("tutor-a", map[string]any{"action": "approve", "reason": "Final interview and academic assessment passed.", "minClass": 6, "maxClass": 10, "mentorId": "mentor-a"}, 200)
		tutor.ok("GET", "/enrollments", nil, 200)
		if _, e = s.C("applications").UpdateOne(ctx, bson.M{"_id": "tutor-a"}, bson.M{"$set": bson.M{"scope.expiresAt": now.Add(-time.Minute)}}); e != nil {
			t.Fatal(e)
		}
		tutor.ok("GET", "/enrollments", nil, 403)
		d := tutor.ok("GET", "/dashboard", nil, 200)
		if len(d["trials"].([]any)) != 0 {
			t.Fatal("restricted dashboard exposed teaching records")
		}
	})
}
func bytesContainPrivateMeeting(b []byte) bool {
	return strings.Contains(string(b), "meetingId") || strings.Contains(string(b), "jobId") || strings.Contains(string(b), "hostKey") || strings.Contains(string(b), "start_url")
}
