package app

import (
	"context"
	"encoding/json"
	"go.mongodb.org/mongo-driver/v2/bson"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"
	"tutorplatform/internal/config"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/media"
	"tutorplatform/internal/storage"
)

func TestMongoDirectCloudinaryFiles(t *testing.T) {
	uri := os.Getenv("TEST_MONGODB_URI")
	if uri == "" {
		t.Skip("TEST_MONGODB_URI required")
	}
	t.Setenv("SEED_PASSWORD", testPassword)
	ctx := context.Background()
	s, e := storage.Connect(ctx, uri, "tutor_test_direct_"+token()[:12])
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
	var mu sync.Mutex
	assets := map[string]media.Asset{}
	cloud := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		key, secret, ok := r.BasicAuth()
		if !ok || key != "test-key" || secret != "test-secret" {
			w.WriteHeader(401)
			return
		}
		mu.Lock()
		defer mu.Unlock()
		asset, ok := assets[r.URL.Path]
		if !ok {
			w.WriteHeader(404)
			return
		}
		_ = json.NewEncoder(w).Encode(asset)
	}))
	defer cloud.Close()
	cfg := config.Config{Env: "test", AuthProvider: "password", Origin: "http://test.local", MediaProvider: "cloudinary", VideoProvider: "cloudinary", CloudinaryCloud: "test-cloud", CloudinaryKey: "test-key", CloudinarySecret: "test-secret", TestCloudinaryURL: cloud.URL}
	a := New(s, cfg)
	if e = a.ConfigureMedia(); e != nil {
		t.Fatal(e)
	}
	server := httptest.NewServer(a.Routes())
	defer server.Close()
	client := func(id string) *testClient {
		jar, _ := cookiejar.New(nil)
		c := &testClient{t: t, http: &http.Client{Jar: jar, Timeout: 20 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}, base: server.URL}
		c.login(id)
		return c
	}
	tutor, other, admin, mentor := client("tutor-a"), client("parent-b"), client("admin-a"), client("mentor-a")
	profile := completeApplication("Cloudinary direct applicant", time.Now())
	tutor.ok("PUT", "/application", map[string]any{"version": 0, "step": 0, "profile": profile, "submit": false}, 200)
	ids := []string{}
	for i, f := range []struct{ name, mime, format, resource string }{{"photo.png", "image/png", "png", "image"}, {"photo.jpg", "image/jpeg", "jpg", "image"}, {"resume.pdf", "application/pdf", "", "raw"}, {"intro.mp4", "video/mp4", "mp4", "video"}} {
		body := map[string]any{"name": f.name, "contentType": f.mime, "size": 50}
		headers := map[string]string{"Idempotency-Key": "direct-" + f.name}
		status, v, raw := tutor.call("POST", "/applications/tutor-a/files/upload-intent", body, headers)
		if status != 200 {
			t.Fatalf("intent %d: %s", status, raw)
		}
		file := v["file"].(map[string]any)
		id := file["id"].(string)
		ids = append(ids, id)
		grant := v["upload"].(map[string]any)
		fields := grant["fields"].(map[string]any)
		publicID := fields["public_id"].(string)
		if fields["type"] != "authenticated" || fields["overwrite"] != "false" || fields["signature"] == "" {
			t.Fatal("unrestricted grant")
		}
		tutor.ok("POST", "/files/"+id+"/complete", map[string]any{}, 503)
		other.ok("POST", "/files/"+id+"/complete", map[string]any{}, 404)
		tutor.ok("GET", "/files/"+id+"/view", nil, 503)
		asset := media.Asset{PublicID: publicID, ResourceType: f.resource, Type: "authenticated", Format: f.format, Bytes: 50, Version: 7, AssetID: "asset-" + id, ETag: "verified-etag"}
		path := "/resources/" + f.resource + "/authenticated/" + publicID
		mu.Lock()
		assets[path] = asset
		mu.Unlock()
		if i == 0 {
			tutor.ok("POST", "/files/"+id+"/complete", map[string]any{"url": "https://untrusted.invalid/file", "status": "ready"}, 422)
			mu.Lock()
			bad := asset
			bad.Bytes = 100
			assets[path] = bad
			mu.Unlock()
			tutor.ok("POST", "/files/"+id+"/complete", map[string]any{}, 422)
			mu.Lock()
			assets[path] = asset
			mu.Unlock()
		}
		ready := tutor.ok("POST", "/files/"+id+"/complete", map[string]any{}, 200)
		if ready["status"] != "ready" || ready["scannedAt"] != nil || ready["url"] != nil || ready["publicId"] != nil {
			t.Fatal("unscanned file misrepresented or private reference exposed")
		}
		tutor.ok("POST", "/files/"+id+"/complete", map[string]any{}, 200)
		stored, e := a.privateFile(ctx, id)
		if e != nil || stored.AssetID == "" || stored.AssetVersion != 7 || !strings.HasPrefix(stored.URL, "https://res.cloudinary.com/") {
			t.Fatal("provider reference not saved", e)
		}
		count, e := s.C("outbox").CountDocuments(ctx, bson.M{"_id": "scan:" + id})
		if e != nil || count != 0 {
			t.Fatal("Cloudinary queued a local scan")
		}
		for _, action := range []string{"view", "download"} {
			tutor.ok("GET", "/files/"+id+"/"+action, nil, 302)
			other.ok("GET", "/files/"+id+"/"+action, nil, 404)
			admin.ok("GET", "/files/"+id+"/"+action, nil, 302)
		}
		if i == 0 {
			_, again, _ := tutor.call("POST", "/applications/tutor-a/files/upload-intent", body, headers)
			if again["file"].(map[string]any)["id"] != id || again["upload"] != nil {
				t.Fatal("retry recreated upload")
			}
		}
	}
	profile.About.PhotoFileID = ids[0]
	profile.Education.ResumeFileID = ids[2]
	tutor.ok("PUT", "/application", map[string]any{"version": 1, "step": 1, "profile": profile, "submit": false}, 200)
	// Access is checked when a viewing link is requested, including after reassignment.
	if _, e = s.C("applications").UpdateOne(ctx, bson.M{"_id": "tutor-a"}, bson.M{"$set": bson.M{"assessorId": "mentor-a"}}); e != nil {
		t.Fatal(e)
	}
	mentor.ok("GET", "/files/"+ids[0]+"/view", nil, 302)
	if _, e = s.C("applications").UpdateOne(ctx, bson.M{"_id": "tutor-a"}, bson.M{"$set": bson.M{"assessorId": "mentor-b"}}); e != nil {
		t.Fatal(e)
	}
	mentor.ok("GET", "/files/"+ids[0]+"/view", nil, 404)
	// References survive a second API instance; an old signed link has a bounded TTL.
	b := New(s, cfg)
	if e = b.ConfigureMedia(); e != nil {
		t.Fatal(e)
	}
	srv2 := httptest.NewServer(b.Routes())
	defer srv2.Close()
	tutor.base = srv2.URL
	tutor.ok("GET", "/files/"+ids[0]+"/view", nil, 302)
	tutor.base = server.URL
	var raw bson.M
	if e = s.C("applications").FindOne(ctx, bson.M{"_id": "tutor-a"}).Decode(&raw); e != nil {
		t.Fatal(e)
	}
	stored, e := storage.One[domain.Application](ctx, s, "applications", bson.M{"_id": "tutor-a"})
	if e != nil || stored.Profile.About.PhotoFileID != ids[0] {
		t.Fatal("application selection lost")
	}
	// Expired capabilities are never extended, even on a retry with the same key.
	status, pending, _ := tutor.call("POST", "/applications/tutor-a/files/upload-intent", map[string]any{"name": "pending.pdf", "contentType": "application/pdf", "size": 20}, map[string]string{"Idempotency-Key": "pending-direct-file"})
	if status != 200 {
		t.Fatal("pending reservation failed", status)
	}
	pendingID := pending["file"].(map[string]any)["id"].(string)
	if _, e = a.updatePrivateFile(ctx, pendingID, "uploading", bson.M{"uploadExpiresAt": a.Now().Add(-time.Minute)}); e != nil {
		t.Fatal(e)
	}
	tutor.ok("POST", "/files/"+pendingID+"/complete", map[string]any{}, 409)
	status, _, _ = tutor.call("POST", "/applications/tutor-a/files/upload-intent", map[string]any{"name": "pending.pdf", "contentType": "application/pdf", "size": 20}, map[string]string{"Idempotency-Key": "pending-direct-file"})
	if status != 409 {
		t.Fatal("expired capability renewed", status)
	}
	// A completed application cannot accept a new upload capability.
	if _, e = s.C("applications").UpdateOne(ctx, bson.M{"_id": "tutor-a"}, bson.M{"$set": bson.M{"status": "submitted"}}); e != nil {
		t.Fatal(e)
	}
	status, _, _ = tutor.call("POST", "/applications/tutor-a/files/upload-intent", map[string]any{"name": "late.pdf", "contentType": "application/pdf", "size": 20}, map[string]string{"Idempotency-Key": "closed-draft"})
	if status != 409 {
		t.Fatal("closed draft granted upload", status)
	}
}
