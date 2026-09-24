package app

import (
	"context"
	"encoding/base64"
	"errors"
	"go.mongodb.org/mongo-driver/v2/bson"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"testing"
	"time"
	"tutorplatform/internal/config"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/media"
	"tutorplatform/internal/storage"
)

// Test seam only: runtime requires an actual configured ClamAV service.
type testScanner struct {
	clean bool
	err   error
}

func (s testScanner) Scan(context.Context, []byte) (bool, error) { return s.clean, s.err }
func TestMongoPrivateFiles(t *testing.T) {
	uri := os.Getenv("TEST_MONGODB_URI")
	if uri == "" {
		t.Skip("TEST_MONGODB_URI required")
	}
	t.Setenv("SEED_PASSWORD", testPassword)
	ctx := context.Background()
	s, e := storage.Connect(ctx, uri, "tutor_test_files_"+token()[:12])
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
	cfg := config.Config{Env: "test", AuthProvider: "password", Origin: "http://test.local", MediaProvider: "disk", MediaRoot: t.TempDir()}
	a := New(s, cfg)
	if e = a.ConfigureMedia(); e != nil {
		t.Fatal(e)
	}
	server := httptest.NewServer(a.Routes())
	defer server.Close()
	client := func(id string) *testClient {
		jar, _ := cookiejar.New(nil)
		c := &testClient{t: t, http: &http.Client{Jar: jar, Timeout: 30 * time.Second}, base: server.URL}
		c.login(id)
		return c
	}
	p, other, tutor, unassigned, mentor, finance := client("parent-a"), client("parent-b"), client("tutor-meera"), client("tutor-arjun"), client("mentor-a"), client("finance-a")
	v := domain.Enrollment{ID: "private-file-enrollment", OwnerID: "parent-a", LearnerID: "fictional-file-learner", TutorID: "tutor-meera", MentorID: "mentor-a", Status: "active", Version: 1}
	if _, e = s.C("enrollments").InsertOne(ctx, v); e != nil {
		t.Fatal(e)
	}
	path := "/enrollments/" + v.ID + "/files"
	body := map[string]any{"name": "../../lesson.pdf", "content": base64.StdEncoding.EncodeToString([]byte("%PDF-1.4\n1 0 obj <<>> endobj\n%%EOF"))}
	var fileID string
	t.Run("quarantine persists with idempotency and private metadata", func(t *testing.T) {
		status, f, raw := p.call("POST", path, body, map[string]string{"Idempotency-Key": "private-file-retry-key"})
		if status != 201 {
			t.Fatalf("upload %d %s", status, raw)
		}
		fileID = f["id"].(string)
		if f["name"] != "lesson.pdf" || f["status"] != "quarantined" || f["objectKey"] != nil || f["checksum"] != nil {
			t.Fatal("unsafe file metadata")
		}
		_, again, _ := p.call("POST", path, body, map[string]string{"Idempotency-Key": "private-file-retry-key"})
		if again["id"] != fileID {
			t.Fatal("duplicate file created")
		}
		p.ok("GET", "/files/"+fileID+"/download", nil, 409)
		p.ok("POST", "/files/"+fileID+"/scan", map[string]any{}, 503)
		if e = a.runOneJob(ctx); e != nil {
			t.Fatal(e)
		}
		p.ok("GET", "/files/"+fileID+"/download", nil, 409)
	})
	t.Run("every file read uses current ownership and assignment", func(t *testing.T) {
		other.ok("GET", path, nil, 404)
		unassigned.ok("GET", path, nil, 404)
		finance.ok("GET", path, nil, 403)
		other.ok("GET", "/files/"+fileID+"/download", nil, 404)
		tutor.ok("GET", path, nil, 200)
		mentor.ok("GET", path, nil, 200)
		status, _, _ := other.call("POST", path, body, map[string]string{"Idempotency-Key": "other-file-upload-key"})
		if status != 404 {
			t.Fatal("unrelated upload accepted")
		}
	})
	t.Run("scanner outage stays quarantined and verified scan enables bounded attachment", func(t *testing.T) {
		a.Scanner = testScanner{err: errors.New("scanner unavailable")}
		if e = a.scanFile(ctx, fileID); e == nil {
			t.Fatal("outage accepted")
		}
		p.ok("GET", "/files/"+fileID+"/download", nil, 409)
		a.Scanner = testScanner{clean: true}
		if e = a.scanFile(ctx, fileID); e != nil {
			t.Fatal(e)
		}
		response, e := p.http.Get(server.URL + "/api/v1/files/" + fileID + "/download")
		if e != nil {
			t.Fatal(e)
		}
		defer response.Body.Close()
		if response.StatusCode != 200 || response.Header.Get("Content-Type") != "application/octet-stream" || response.Header.Get("Content-Disposition") != "attachment; filename=lesson.pdf" || response.Header.Get("Cache-Control") != "no-store" {
			t.Fatal("private attachment headers incorrect")
		}
		// A new app/storage instance reads the same persisted object.
		a.Files, _ = media.NewDisk(cfg.MediaRoot)
		if status, _, _ := tutor.call("GET", "/files/"+fileID+"/download", nil, nil); status != 200 {
			t.Fatal("file not durable")
		}
	})
	t.Run("handover revokes old tutor file access without losing family evidence", func(t *testing.T) {
		if _, e = s.C("enrollments").UpdateOne(ctx, bson.M{"_id": v.ID}, bson.M{"$set": bson.M{"tutorId": "tutor-arjun"}}); e != nil {
			t.Fatal(e)
		}
		tutor.ok("GET", "/files/"+fileID+"/download", nil, 404)
		unassigned.ok("GET", "/files/"+fileID+"/download", nil, 200)
		p.ok("GET", "/files/"+fileID+"/download", nil, 200)
	})
	t.Run("scanner rejection never enables download", func(t *testing.T) {
		_, f, _ := p.call("POST", path, body, map[string]string{"Idempotency-Key": "rejected-file-request"})
		id := f["id"].(string)
		a.Scanner = testScanner{clean: false}
		if e = a.scanFile(ctx, id); e != nil {
			t.Fatal(e)
		}
		p.ok("GET", "/files/"+id+"/download", nil, 409)
	})
}
