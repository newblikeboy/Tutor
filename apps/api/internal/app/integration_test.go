package app

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"go.mongodb.org/mongo-driver/v2/bson"
	"io"
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

type testClient struct {
	t          *testing.T
	http       *http.Client
	base, csrf string
}

func (tc *testClient) call(method, path string, body any, headers map[string]string) (int, map[string]any, []byte) {
	tc.t.Helper()
	raw, _ := json.Marshal(body)
	r, _ := http.NewRequest(method, tc.base+"/api/v1"+path, bytes.NewReader(raw))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Origin", "http://test.local")
	if tc.csrf != "" {
		r.Header.Set("X-CSRF-Token", tc.csrf)
	}
	for k, v := range headers {
		r.Header.Set(k, v)
	}
	resp, e := tc.http.Do(r)
	if e != nil {
		tc.t.Fatal(e)
	}
	defer resp.Body.Close()
	data, e := io.ReadAll(resp.Body)
	if e != nil {
		tc.t.Fatal(e)
	}
	out := map[string]any{}
	_ = json.Unmarshal(data, &out)
	return resp.StatusCode, out, data
}
func (tc *testClient) ok(method, path string, body any, status int) map[string]any {
	tc.t.Helper()
	s, v, b := tc.call(method, path, body, nil)
	if s != status {
		tc.t.Fatalf("%s %s: expected %d got %d; %s", method, path, status, s, b)
	}
	return v
}
func (tc *testClient) login(id string) {
	tc.t.Helper()
	ch := tc.ok("POST", "/auth/challenges", map[string]any{"identity": id}, 201)
	v := tc.ok("POST", "/auth/verify", map[string]any{"challengeId": ch["challengeId"], "code": ch["developmentCode"]}, 200)
	tc.csrf = v["csrf"].(string)
}
func TestAtlasVerticalSliceAndSecurity(t *testing.T) {
	uri := os.Getenv("TEST_MONGODB_URI")
	if uri == "" {
		t.Skip("TEST_MONGODB_URI not set; replica-set integration unverified")
	}
	ctx := context.Background()
	name := "tutor_test_" + time.Now().UTC().Format("20060102_150405") + "_" + token()[:6]
	s, e := storage.Connect(ctx, uri, name)
	if e != nil {
		t.Fatal("test database connection failed")
	}
	defer s.Client.Disconnect(ctx)
	if e = s.Migrate(ctx); e != nil {
		t.Fatal(e)
	}
	if e = s.Seed(ctx, "test"); e != nil {
		t.Fatal(e)
	}
	t.Log("Created isolated database", name, "(retained for review; no existing database modified)")
	c := config.Config{Env: "test", Name: "Tutor Platform", Origin: "http://test.local", OTPSecret: token(), AuthProvider: "development"}
	a := New(s, c)
	server := httptest.NewServer(a.Routes())
	defer server.Close()
	s2, e := storage.Connect(ctx, uri, name)
	if e != nil {
		t.Fatal(e)
	}
	defer s2.Client.Disconnect(ctx)
	server2 := httptest.NewServer(New(s2, c).Routes())
	defer server2.Close()
	client := func(base string) *testClient {
		jar, _ := cookiejar.New(nil)
		return &testClient{t: t, http: &http.Client{Jar: jar, Timeout: 20 * time.Second}, base: base}
	}
	tutor := client(server.URL)
	tutor.login("tutor-a")
	mentor := client(server.URL)
	mentor.login("mentor-a")
	parent := client(server.URL)
	parent.login("parent-a")
	other := client(server.URL)
	other.login("parent-b")
	admin := client(server.URL)
	admin.login("admin-a")
	tutor2 := client(server2.URL)
	tutor2.login("tutor-a")
	t.Run("public DTO excludes private fields", func(t *testing.T) {
		status, _, raw := parent.call("GET", "/tutors", nil, nil)
		if status != 200 {
			t.Fatal(status)
		}
		for _, key := range []string{"education", "assessorId", "reason", "evidence", "ownerId"} {
			if bytes.Contains(raw, []byte(`"`+key+`"`)) {
				t.Fatal("private field", key)
			}
		}
	})
	t.Run("registration and application never approve", func(t *testing.T) {
		tutor.ok("PUT", "/application", map[string]any{"name": "Fictional assessed tutor", "education": "Fictional BSc for test", "approach": "Use concrete examples to explain fractions and check understanding.", "language": "Hindi", "experience": 3, "submit": true}, 200)
		_, _, raw := parent.call("GET", "/tutors", nil, nil)
		if bytes.Contains(raw, []byte("tutor-a\"")) {
			t.Fatal("unapproved tutor published")
		}
		tutor.ok("POST", "/applications/tutor-a/decision", map[string]any{"action": "approve"}, 403)
		mentor.ok("POST", "/applications/tutor-a/decision", map[string]any{"action": "approve", "reason": "Not assessed yet"}, 409)
	})
	t.Run("assigned evidence based approval", func(t *testing.T) {
		mentor.ok("POST", "/applications/tutor-a/decision", map[string]any{"action": "review"}, 200)
		mentor.ok("POST", "/applications/tutor-a/decision", map[string]any{"action": "schedule"}, 200)
		mentor.ok("POST", "/applications/tutor-a/decision", map[string]any{"action": "assess", "scores": []int{4, 4, 4, 4, 4, 4}, "evidence": "Explained equivalent fractions and identified denominator misconception."}, 200)
		mentor.ok("POST", "/applications/tutor-a/decision", map[string]any{"action": "approve", "minClass": 8, "maxClass": 8, "reason": "Observed subject explanation supports class eight online Mathematics."}, 200)
		v := parent.ok("GET", "/tutors/tutor-a", nil, 200)
		if v["scope"].(map[string]any)["minClass"] != float64(8) {
			t.Fatal("scope not persisted")
		}
	})
	var learnerID, otherLearnerID, reqID, otherReqID string
	t.Run("guardian gate and household isolation", func(t *testing.T) {
		body := map[string]any{"name": "Sample child", "class": 8, "board": "CBSE", "language": "Hindi", "kind": "minor", "consentId": ""}
		parent.ok("POST", "/learners", body, 403)
		consent := parent.ok("POST", "/consents", map[string]any{"relationship": "parent", "accepted": true}, 201)
		body["consentId"] = consent["id"]
		v := parent.ok("POST", "/learners", body, 201)
		learnerID = v["id"].(string)
		other.ok("GET", "/learners/"+learnerID, nil, 404)
		other.ok("POST", "/learners", body, 403)
		otherConsent := other.ok("POST", "/consents", map[string]any{"relationship": "legal_guardian", "accepted": true}, 201)
		body["consentId"] = otherConsent["id"]
		otherLearnerID = other.ok("POST", "/learners", body, 201)["id"].(string)
		parent.ok("POST", "/requirements", map[string]any{"learnerId": otherLearnerID, "goal": "Practise fractions with confidence", "locality": "Purnea"}, 404)
		reqID = parent.ok("POST", "/requirements", map[string]any{"learnerId": learnerID, "goal": "Practise fractions with confidence", "locality": "Purnea"}, 201)["id"].(string)
		otherReqID = other.ok("POST", "/requirements", map[string]any{"learnerId": otherLearnerID, "goal": "Practise fractions with confidence", "locality": "Purnia"}, 201)["id"].(string)
		tutor.ok("GET", "/learners/"+learnerID, nil, 403)
	})
	t.Run("adult self profile and multiple learners", func(t *testing.T) {
		body := map[string]any{"name": "Sample adult", "class": 8, "board": "BSEB", "language": "English", "kind": "adult_self", "consentId": ""}
		parent.ok("POST", "/learners", body, 201)
		dashboard := parent.ok("GET", "/dashboard", nil, 200)
		if len(dashboard["learners"].([]any)) != 2 {
			t.Fatal("multiple learners not persisted")
		}
	})
	t.Run("authenticated draft survives another API instance", func(t *testing.T) {
		parent.ok("PUT", "/draft", map[string]any{"step": 3, "learnerId": learnerID, "goal": "Continue work on equivalent fractions", "locality": "Purnea"}, 200)
		parent.base = server2.URL
		d := parent.ok("GET", "/dashboard", nil, 200)
		if d["draft"].(map[string]any)["step"] != float64(3) {
			t.Fatal("draft not persisted")
		}
		parent.base = server.URL
	})
	start := time.Now().UTC().Add(24 * time.Hour).Truncate(time.Minute)
	var trialID, otherTrialID string
	t.Run("idempotent trial requests with immutable terms", func(t *testing.T) {
		body := map[string]any{"requirementId": reqID, "tutorId": "tutor-a", "start": start, "termsAccepted": true}
		status, v, _ := parent.call("POST", "/trials", body, map[string]string{"Idempotency-Key": "test-request-one"})
		if status != 201 {
			t.Fatal(status, v)
		}
		trialID = v["id"].(string)
		_, repeated, _ := parent.call("POST", "/trials", body, map[string]string{"Idempotency-Key": "test-request-one"})
		if repeated["id"] != trialID {
			t.Fatal("duplicate request created another trial")
		}
		if v["feePaise"] != float64(0) || v["termsVersion"] != "development-trial-v1" {
			t.Fatal("missing price/terms snapshot")
		}
		body["start"] = start.Add(30 * time.Minute)
		status, _, _ = parent.call("POST", "/trials", body, map[string]string{"Idempotency-Key": "test-request-one"})
		if status != 409 {
			t.Fatal("changed body reused key", status)
		}
		body["requirementId"] = otherReqID
		status, v, _ = other.call("POST", "/trials", body, map[string]string{"Idempotency-Key": "test-request-two"})
		if status != 201 {
			t.Fatal(status, v)
		}
		otherTrialID = v["id"].(string)
		other.ok("POST", "/trials/"+trialID+"/action", map[string]any{"action": "accept"}, 404)
	})
	winner := ""
	winnerParent := parent
	t.Run("overlapping concurrent accept across API instances", func(t *testing.T) {
		statuses := make([]int, 2)
		var wg sync.WaitGroup
		for i, tc := range []*testClient{tutor, tutor2} {
			wg.Add(1)
			go func(i int, tc *testClient) {
				defer wg.Done()
				id := []string{trialID, otherTrialID}[i]
				statuses[i], _, _ = tc.call("POST", "/trials/"+id+"/action", map[string]any{"action": "accept"}, nil)
			}(i, tc)
		}
		wg.Wait()
		if !((statuses[0] == 200 && statuses[1] == 409) || (statuses[0] == 409 && statuses[1] == 200)) {
			t.Fatalf("expected one reservation, got %v", statuses)
		}
		if statuses[0] == 200 {
			winner = trialID
		} else {
			winner = otherTrialID
			winnerParent = other
		}
		n, e := s.C("trials").CountDocuments(ctx, bson.M{"status": "confirmed"})
		if e != nil || n != 1 {
			t.Fatal("invalid confirmed count", n, e)
		}
		tutor.ok("POST", "/trials/"+winner+"/action", map[string]any{"action": "accept"}, 200)
	})
	t.Run("lesson evidence reviewed before family visibility", func(t *testing.T) {
		if winner == "" {
			t.Fatal("no valid trial")
		}
		tutor.ok("POST", "/trials/"+winner+"/action", map[string]any{"action": "complete", "notes": "Learner used equivalent fractions in three worked examples.", "nextSteps": "Practise comparing denominators with a number line."}, 200)
		before := winnerParent.ok("GET", "/dashboard", nil, 200)
		for _, raw := range before["trials"].([]any) {
			v := raw.(map[string]any)
			if v["id"] == winner && v["notes"] != "" {
				t.Fatal("unreviewed evidence exposed")
			}
		}
		tutor.ok("POST", "/trials/"+winner+"/action", map[string]any{"action": "review", "review": "Self review should be prohibited"}, 403)
		mentor.ok("POST", "/trials/"+winner+"/action", map[string]any{"action": "review", "review": "Evidence supports practising equivalent fractions; use a number line next."}, 200)
		after := winnerParent.ok("GET", "/dashboard", nil, 200)
		found := false
		for _, raw := range after["trials"].([]any) {
			v := raw.(map[string]any)
			if v["id"] == winner && v["status"] == "reviewed" && v["notes"] != "" {
				found = true
			}
		}
		if !found {
			t.Fatal("reviewed progress missing")
		}
		tutor.ok("POST", "/trials/"+winner+"/action", map[string]any{"action": "complete", "notes": "Try changing an ended assignment", "nextSteps": "Should never be permitted"}, 409)
	})
	t.Run("cancellation releases resource guards and retry does not double release", func(t *testing.T) {
		body := map[string]any{"requirementId": reqID, "tutorId": "tutor-a", "start": start.Add(6 * time.Hour), "termsAccepted": true}
		status, created, _ := parent.call("POST", "/trials", body, map[string]string{"Idempotency-Key": "cancel-and-rebook-one"})
		if status != 201 {
			t.Fatal(status, created)
		}
		id := created["id"].(string)
		tutor.ok("POST", "/trials/"+id+"/action", map[string]any{"action": "accept"}, 200)
		tutor.ok("POST", "/trials/"+id+"/action", map[string]any{"action": "decline"}, 409)
		parent.ok("POST", "/trials/"+id+"/action", map[string]any{"action": "cancel"}, 200)
		parent.ok("POST", "/trials/"+id+"/action", map[string]any{"action": "cancel"}, 200)
		status, created, _ = parent.call("POST", "/trials", body, map[string]string{"Idempotency-Key": "cancel-and-rebook-two"})
		if status != 201 {
			t.Fatal(status, created)
		}
		id = created["id"].(string)
		tutor2.ok("POST", "/trials/"+id+"/action", map[string]any{"action": "accept"}, 200)
		parent.ok("POST", "/trials/"+id+"/action", map[string]any{"action": "cancel"}, 200)
	})
	t.Run("suspension removes discovery and new booking eligibility", func(t *testing.T) {
		admin.ok("POST", "/applications/tutor-a/decision", map[string]any{"action": "suspend", "reason": "Development suspension to review current teaching arrangements."}, 200)
		parent.ok("GET", "/tutors/tutor-a", nil, 404)
		status, _, _ := parent.call("POST", "/trials", map[string]any{"requirementId": reqID, "tutorId": "tutor-a", "start": start.Add(4 * time.Hour), "termsAccepted": true}, map[string]string{"Idempotency-Key": "suspended-request"})
		if status != 409 {
			t.Fatal("suspended tutor eligible", status)
		}
		n, e := s.C("outbox").CountDocuments(ctx, bson.M{"kind": "review_existing_arrangements", "tutorId": "tutor-a"})
		if e != nil || n != 1 {
			t.Fatal("missing operations task", n, e)
		}
	})
	t.Run("origin CSRF logout and privilege revocation", func(t *testing.T) {
		parent.ok("POST", "/auth/logout", map[string]any{}, 200)
		parent.ok("GET", "/dashboard", nil, 401)
		status, _, _ := other.call("POST", "/draft", map[string]any{}, map[string]string{"Origin": "https://hostile.invalid"})
		if status != 403 {
			t.Fatal("origin accepted", status)
		}
		status, _, _ = other.call("PUT", "/draft", map[string]any{}, map[string]string{"X-CSRF-Token": "invalid"})
		if status != 403 {
			t.Fatal("csrf accepted", status)
		}
		if _, e := s.C("users").UpdateOne(ctx, bson.M{"_id": "parent-b"}, bson.M{"$inc": bson.M{"authVersion": 1}}); e != nil {
			t.Fatal(e)
		}
		other.ok("GET", "/dashboard", nil, 401)
	})
	t.Run("least privilege staff", func(t *testing.T) {
		for _, id := range []string{"finance-a", "support-a"} {
			tc := client(server.URL)
			tc.login(id)
			tc.ok("GET", "/dashboard", nil, 403)
			tc.ok("GET", "/learners/"+learnerID, nil, 403)
			tc.ok("POST", "/applications/tutor-a/decision", map[string]any{"action": "approve"}, 403)
		}
	})
	t.Run("one time code reuse explicit expiry attempts and limits", func(t *testing.T) {
		tc := client(server.URL)
		ch := tc.ok("POST", "/auth/challenges", map[string]any{"identity": "adult-a"}, 201)
		body := map[string]any{"challengeId": ch["challengeId"], "code": ch["developmentCode"]}
		tc.ok("POST", "/auth/verify", body, 200)
		tc.ok("POST", "/auth/verify", body, 401)
		ch = tc.ok("POST", "/auth/challenges", map[string]any{"identity": "adult-a"}, 201)
		if _, e := s.C("challenges").UpdateOne(ctx, bson.M{"_id": ch["challengeId"]}, bson.M{"$set": bson.M{"expiresAt": time.Now().Add(-time.Second)}}); e != nil {
			t.Fatal(e)
		}
		tc.ok("POST", "/auth/verify", map[string]any{"challengeId": ch["challengeId"], "code": ch["developmentCode"]}, 401)
		ch = tc.ok("POST", "/auth/challenges", map[string]any{"identity": "adult-a"}, 201)
		for range 5 {
			tc.ok("POST", "/auth/verify", map[string]any{"challengeId": ch["challengeId"], "code": "not-a-code"}, 401)
		}
		tc.ok("POST", "/auth/verify", map[string]any{"challengeId": ch["challengeId"], "code": ch["developmentCode"]}, 401)
		tc.ok("POST", "/auth/challenges", map[string]any{"identity": "adult-a"}, 429)
	})
	t.Run("production rejects sample seed and sample discovery", func(t *testing.T) {
		if e = s.Seed(ctx, "production"); e == nil {
			t.Fatal("production seed allowed")
		}
		prodConfig := c
		prodConfig.Env = "production"
		prodConfig.AuthProvider = "disabled"
		prod := httptest.NewServer(New(s, prodConfig).Routes())
		defer prod.Close()
		tc := client(prod.URL)
		status, _, raw := tc.call("GET", "/tutors", nil, nil)
		if status != 200 || string(bytes.TrimSpace(raw)) != "[]" {
			t.Fatal("samples published", status, string(raw))
		}
		tc.ok("POST", "/auth/challenges", map[string]any{"identity": "admin-a"}, 503)
		tc.http.Jar = tutor.http.Jar
		tc.ok("GET", "/dashboard", nil, 503)
		status, _, raw = tc.call("GET", "/auth/session", nil, nil)
		if status != 200 || string(bytes.TrimSpace(raw)) != "null" {
			t.Fatal("production replayed a development session")
		}
	})
	t.Run("session expiry is enforced before TTL cleanup", func(t *testing.T) {
		if _, e := s.C("sessions").UpdateMany(ctx, bson.M{"userId": "admin-a"}, bson.M{"$set": bson.M{"expiresAt": time.Now().Add(-time.Second)}}); e != nil {
			t.Fatal(e)
		}
		admin.ok("GET", "/dashboard", nil, 401)
		status, _, raw := admin.call("GET", "/auth/session", nil, nil)
		if status != 200 || string(bytes.TrimSpace(raw)) != "null" {
			t.Fatal("expired session exposed user")
		}
	})
	t.Run("day boundary guard coverage", func(t *testing.T) {
		start := time.Date(2026, 10, 1, 23, 30, 0, 0, time.UTC)
		keys := guardKeys(domain.Trial{TutorID: "t", LearnerID: "l", Start: start, End: start.Add(time.Hour)})
		if len(keys) != 4 {
			t.Fatal(fmt.Sprint(keys))
		}
	})
	t.Run("reviewed progress survives stopped API and reopened database client", func(t *testing.T) {
		server.Close()
		if e := s.Client.Disconnect(ctx); e != nil {
			t.Fatal(e)
		}
		reopened, e := storage.Connect(ctx, uri, name)
		if e != nil {
			t.Fatal("database reopen failed")
		}
		defer reopened.Client.Disconnect(ctx)
		restarted := httptest.NewServer(New(reopened, c).Routes())
		defer restarted.Close()
		mentor.base = restarted.URL
		d := mentor.ok("GET", "/dashboard", nil, 200)
		found := false
		for _, raw := range d["trials"].([]any) {
			v := raw.(map[string]any)
			if v["id"] == winner && v["status"] == "reviewed" && v["review"] != "" {
				found = true
			}
		}
		if !found {
			t.Fatal("reviewed progress lost across API restart")
		}
	})
}
