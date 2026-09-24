package app

import (
	"bytes"
	"context"
	"encoding/base64"
	"go.mongodb.org/mongo-driver/v2/bson"
	"image"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"slices"
	"strings"
	"testing"
	"time"
	"tutorplatform/internal/config"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
)

// In-memory provider double is test-only; runtime requires configured storage.
type documentTestStore struct{ objects map[string][]byte }

func (s *documentTestStore) Put(_ context.Context, key string, data []byte) error {
	s.objects[key] = append([]byte{}, data...)
	return nil
}
func (s *documentTestStore) Read(_ context.Context, key string) ([]byte, error) {
	return s.objects[key], nil
}

func TestMongoCloudinaryApplicationDocuments(t *testing.T) {
	uri := os.Getenv("TEST_MONGODB_URI")
	if uri == "" {
		t.Skip("TEST_MONGODB_URI required")
	}
	t.Setenv("SEED_PASSWORD", testPassword)
	ctx := context.Background()
	s, e := storage.Connect(ctx, uri, "tutor_test_documents_"+token()[:12])
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
	a := New(s, config.Config{Env: "test", AuthProvider: "password", Origin: "http://test.local", MediaProvider: "cloudinary", VideoProvider: "cloudinary"})
	docs, videos := &documentTestStore{objects: map[string][]byte{}}, &documentTestStore{objects: map[string][]byte{}}
	a.Files, a.Videos = docs, videos
	server := httptest.NewServer(a.Routes())
	defer server.Close()
	client := func(id string) *testClient {
		jar, _ := cookiejar.New(nil)
		c := &testClient{t: t, http: &http.Client{Jar: jar, Timeout: 30 * time.Second}, base: server.URL}
		c.login(id)
		return c
	}
	tutor, admin, parent := client("tutor-a"), client("admin-a"), client("parent-a")
	profile := completeApplication("Fictional document applicant", time.Now())
	tutor.ok("PUT", "/application", map[string]any{"version": 0, "step": 1, "profile": profile, "submit": false}, 200)
	var jpg, pngData bytes.Buffer
	if e := jpeg.Encode(&jpg, image.NewRGBA(image.Rect(0, 0, 2, 2)), nil); e != nil {
		t.Fatal(e)
	}
	if e := png.Encode(&pngData, image.NewRGBA(image.Rect(0, 0, 2, 2))); e != nil {
		t.Fatal(e)
	}
	fixtures := []struct {
		name, ext string
		data      []byte
	}{
		{"resume.pdf", ".pdf", []byte("%PDF-1.4\n1 0 obj <<>> endobj\n%%EOF")},
		{"degree.jpg", ".jpg", jpg.Bytes()},
		{"marksheet.png", ".png", pngData.Bytes()},
		{"intro.mp4", "", introductionMP4()},
		{"passport-photo.jpg", ".jpg", jpg.Bytes()},
	}
	ids := []string{}
	for _, fixture := range fixtures {
		body := map[string]any{"name": fixture.name, "content": base64.StdEncoding.EncodeToString(fixture.data)}
		status, f, raw := tutor.call("POST", "/applications/tutor-a/files", body, map[string]string{"Idempotency-Key": "cloudinary-document-" + fixture.name})
		if status != 201 {
			t.Fatalf("upload: %d %s", status, raw)
		}
		id := f["id"].(string)
		ids = append(ids, id)
		saved, e := a.privateFile(ctx, id)
		if e != nil || saved.Provider != "cloudinary" || !strings.HasSuffix(saved.ObjectKey, fixture.ext) || saved.Status != "quarantined" {
			t.Fatal("provider metadata incorrect")
		}
		selected := docs
		if fixture.name == "intro.mp4" {
			selected = videos
		}
		if !bytes.Equal(selected.objects[saved.ObjectKey], fixture.data) {
			t.Fatal("wrong storage or changed original bytes")
		}
		// Check a retry for each storage route without exhausting the upload rate limit.
		if fixture.name == "resume.pdf" || fixture.name == "intro.mp4" {
			_, again, _ := tutor.call("POST", "/applications/tutor-a/files", body, map[string]string{"Idempotency-Key": "cloudinary-document-" + fixture.name})
			if again["id"] != id {
				t.Fatal("retry duplicated upload")
			}
		}
		tutor.ok("GET", "/files/"+id+"/download", nil, 409)
		parent.ok("GET", "/files/"+id+"/download", nil, 404)
	}
	if len(docs.objects) != 4 || len(videos.objects) != 1 {
		t.Fatal("documents and videos not routed separately")
	}
	save := func(p domain.TutorApplication, status int) {
		tutor.ok("PUT", "/application", map[string]any{"version": 1, "step": 1, "profile": p, "submit": false}, status)
	}
	profile.Education.ResumeFileID = ids[0]
	profile.Education.EducationFileIDs = []string{ids[1], ids[2]}
	profile.Approach.DemoFileID = ids[3]
	profile.About.PhotoFileID = ids[4]
	for _, id := range []string{ids[0], ids[3], "missing-photo"} {
		badPhoto := profile
		badPhoto.About.PhotoFileID = id
		for _, submit := range []bool{false, true} {
			tutor.ok("PUT", "/application", map[string]any{"version": 1, "step": 0, "profile": badPhoto, "submit": submit}, 422)
		}
	}
	for _, invalid := range []bson.M{
		{"uploaderId": "another-tutor"},
		{"targetId": "another-application"},
		{"status": "rejected"},
	} {
		if _, e = a.updatePrivateFile(ctx, ids[4], "quarantined", invalid); e != nil {
			t.Fatal(e)
		}
		save(profile, 422)
		status := "quarantined"
		if invalid["status"] == "rejected" {
			status = "rejected"
		}
		if _, e = a.updatePrivateFile(ctx, ids[4], status, bson.M{"uploaderId": "tutor-a", "targetId": "tutor-a", "status": "quarantined"}); e != nil {
			t.Fatal(e)
		}
	}
	bad := profile
	bad.Education.EducationFileIDs = []string{ids[3]}
	save(bad, 422)
	bad.Education.EducationFileIDs = []string{"missing-private-file"}
	save(bad, 422)
	bad.Education.EducationFileIDs = []string{ids[1], ids[1]}
	save(bad, 422)
	// Every draft save verifies uploader ownership and scan status, not only submission.
	if _, e = a.updatePrivateFile(ctx, ids[1], "quarantined", bson.M{"uploaderId": "another-tutor"}); e != nil {
		t.Fatal(e)
	}
	save(profile, 422)
	if _, e = a.updatePrivateFile(ctx, ids[1], "quarantined", bson.M{"uploaderId": "tutor-a", "status": "rejected"}); e != nil {
		t.Fatal(e)
	}
	save(profile, 422)
	if _, e = a.updatePrivateFile(ctx, ids[1], "rejected", bson.M{"status": "quarantined"}); e != nil {
		t.Fatal(e)
	}
	save(profile, 200)
	stored, e := storage.One[domain.Application](ctx, s, "applications", bson.M{"_id": "tutor-a"})
	if e != nil || !slices.Equal(stored.Profile.Education.EducationFileIDs, ids[1:3]) || stored.Profile.Education.ResumeFileID != ids[0] || stored.Profile.About.PhotoFileID != ids[4] {
		t.Fatal("document links did not persist")
	}
	// A PNG photo is also valid, and the linked photo survives final submission.
	profile.About.PhotoFileID = ids[2]
	tutor.ok("PUT", "/application", map[string]any{"version": 2, "step": 6, "profile": profile, "submit": true}, 200)
	stored, e = storage.One[domain.Application](ctx, s, "applications", bson.M{"_id": "tutor-a"})
	if e != nil || stored.Status != "submitted" || stored.Profile.About.PhotoFileID != ids[2] {
		t.Fatal("photo did not persist on final submission")
	}
	admin.ok("GET", "/applications/tutor-a/files", nil, 200)
	a.Scanner = testScanner{clean: true}
	if e = a.scanFile(ctx, ids[1]); e != nil {
		t.Fatal(e)
	}
	response, e := admin.http.Get(server.URL + "/api/v1/files/" + ids[1] + "/download")
	if e != nil {
		t.Fatal(e)
	}
	defer response.Body.Close()
	original, _ := io.ReadAll(response.Body)
	if response.StatusCode != 200 || !bytes.Equal(original, jpg.Bytes()) {
		t.Fatal("staff could not retrieve scanned original")
	}
	a.Config.MediaProvider = "disabled"
	if f, e := a.privateFile(ctx, ids[1]); e != nil || a.fileStore(f) != nil {
		t.Fatal("disabled provider silently rerouted document")
	}
}
