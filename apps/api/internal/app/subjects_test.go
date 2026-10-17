package app

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"tutorplatform/internal/config"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
)

func TestSubjectMasterAcrossWorkflows(t *testing.T) {
	uri := os.Getenv("TEST_MONGODB_URI")
	if uri == "" {
		t.Skip("TEST_MONGODB_URI required")
	}
	t.Setenv("SEED_PASSWORD", testPassword)
	ctx := context.Background()
	s, err := storage.Connect(ctx, uri, "tutor_test_subject_master_"+token()[:12])
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
	cfg := config.Config{Env: "test", AuthProvider: "password", Origin: "http://test.local"}
	a, b := New(s, cfg), New(s, cfg)
	first, second := httptest.NewServer(a.Routes()), httptest.NewServer(b.Routes())
	defer first.Close()
	defer second.Close()
	client := func(id, base string) *testClient {
		jar, _ := cookiejar.New(nil)
		c := &testClient{t: t, http: &http.Client{Jar: jar, Timeout: 20 * time.Second}, base: base}
		c.login(id)
		return c
	}
	admin, admin2 := client("admin-a", first.URL), client("admin-a", second.URL)
	parent, tutor, mentor, finance := client("parent-a", first.URL), client("tutor-a", first.URL), client("mentor-a", first.URL), client("finance-a", first.URL)
	body := map[string]any{"name": "Computer Science", "active": true, "sortOrder": 5, "expectedVersion": 0}
	for _, c := range []*testClient{parent, tutor, mentor, finance} {
		c.ok("POST", "/admin/subjects", body, 403)
	}
	if status, _, _ := admin.call("POST", "/admin/subjects", body, map[string]string{"X-CSRF-Token": "bad"}); status != 403 {
		t.Fatal("subject CSRF bypass", status)
	}
	created := admin.ok("POST", "/admin/subjects", body, 201)
	id := created["id"].(string)
	path := "/admin/subjects/" + url.PathEscape(id)
	duplicate := map[string]any{"name": " computer   science ", "active": true, "sortOrder": 5, "expectedVersion": 0}
	admin.ok("POST", "/admin/subjects", duplicate, 409)
	admin.ok("POST", "/admin/subjects", map[string]any{"name": "invalid/subject", "active": true, "sortOrder": 0}, 422)
	zero := 0
	resource := map[string]any{"title": "Fictional computing quiz", "description": "", "kind": "quiz", "class": 8, "board": "CBSE", "subject": id, "status": "published", "fileId": "", "questions": []domain.StudyQuestion{{Prompt: "Which device accepts text input?", Options: []string{"Keyboard", "Screen"}, CorrectOption: &zero}}, "expectedVersion": 0}
	material := admin.ok("POST", "/admin/study-materials", resource, 201)
	// The new subject is valid for application drafts and remains mentor-only approval.
	profile := completeApplication("Fictional computing applicant", a.Now())
	installApplicationEvidence(t, s, "tutor-a", &profile)
	profile.TeachingAreas[0].Subject = id
	profile.Education.Specialisation = id
	tutor.ok("PUT", "/application", map[string]any{"version": 0, "step": 2, "submit": false, "profile": profile}, 200)
	if err = a.Store.Tx(ctx, func(ctx context.Context) error { _, err := a.bookingSubjects(ctx, 8, []string{id}); return err }); err != nil {
		t.Fatal("new master subject rejected by booking", err)
	}
	// A renamed display label keeps the exact original academic reference.
	rename := map[string]any{"name": "Computing", "active": true, "sortOrder": 2, "expectedVersion": 1}
	updated := admin.ok("PUT", path, rename, 200)
	if updated["id"] != id || updated["name"] != "Computing" {
		t.Fatal(updated)
	}
	stored, err := storage.One[domain.StudyMaterial](ctx, s, "study_materials", bson.M{"_id": material["id"]})
	if err != nil || stored.Subject != id {
		t.Fatal("renaming rewrote a resource", stored, err)
	}
	app, err := storage.One[domain.Application](ctx, s, "applications", bson.M{"_id": "tutor-a"})
	if err != nil || app.Profile.TeachingAreas[0].Subject != id {
		t.Fatal("renaming rewrote the application", err)
	}
	admin.ok("PUT", path, rename, 409)
	admin.ok("PUT", path, map[string]any{"name": "Computing", "sortOrder": 2, "expectedVersion": 2}, 422)
	// Separate API processes cannot overwrite the same version.
	var wg sync.WaitGroup
	statuses := make(chan int, 2)
	for i, c := range []*testClient{admin, admin2} {
		wg.Add(1)
		go func(i int, c *testClient) {
			defer wg.Done()
			status, _, _ := c.call("PUT", path, map[string]any{"name": "Computing", "active": false, "sortOrder": 3 + i, "expectedVersion": 2}, nil)
			statuses <- status
		}(i, c)
	}
	wg.Wait()
	close(statuses)
	ok, conflicts := 0, 0
	for status := range statuses {
		if status == 200 {
			ok++
		} else if status == 409 {
			conflicts++
		} else {
			t.Fatal("unexpected concurrent update", status)
		}
	}
	if ok != 1 || conflicts != 1 {
		t.Fatal(ok, conflicts)
	}
	if err = a.Store.Tx(ctx, func(ctx context.Context) error { _, err := a.bookingSubjects(ctx, 8, []string{id}); return err }); err == nil {
		t.Fatal("inactive subject accepted for a new booking")
	}
	admin.ok("POST", "/admin/study-materials", resource, 409)
	tutor.ok("PUT", "/application", map[string]any{"version": 1, "step": 2, "submit": false, "profile": profile}, 200)
	tutor.ok("PUT", "/application", map[string]any{"version": 2, "step": 6, "submit": true, "profile": profile}, 409)
	parent.ok("GET", "/tutors?subject="+url.QueryEscape(id), nil, 409)
	// Inactivation never makes paid historical subject reporting invalid.
	progress := tutorProgressFixture(id)
	enrollment := domain.Enrollment{Class: 8, Agreement: domain.Agreement{Subjects: []string{id}}}
	if err := a.validateClassProgress(ctx, progress, enrollment); err != nil {
		t.Fatal("inactive booked subject cannot be reported", err)
	}
	// Required primary package remains protected; subject limits remain unchanged.
	admin.ok("PUT", "/admin/subjects/All%20Subjects", map[string]any{"name": "All Subjects", "active": false, "sortOrder": 0, "expectedVersion": 1}, 409)
	admin.ok("PUT", "/admin/subjects/All%20Subjects", map[string]any{"name": "Custom package", "active": true, "sortOrder": 0, "expectedVersion": 1}, 409)
	if err = a.Store.Tx(ctx, func(ctx context.Context) error {
		_, err := a.bookingSubjects(ctx, 5, []string{domain.AllSubjects})
		return err
	}); err != nil {
		t.Fatal(err)
	}
	if err = a.Store.Tx(ctx, func(ctx context.Context) error {
		_, err := a.bookingSubjects(ctx, 8, []string{domain.AllSubjects})
		return err
	}); err == nil {
		t.Fatal("primary package widened")
	}
	// Migration is repeatable and cannot re-enable or rename administrator changes.
	if err = s.MigrateSubjects(ctx); err != nil {
		t.Fatal(err)
	}
	row, err := storage.One[domain.Subject](ctx, s, "subjects", bson.M{"_id": id})
	if err != nil || row.Active || row.Name != "Computing" || row.Version != 3 {
		t.Fatal("migration reset master data", row, err)
	}
	legacy := domain.StudyMaterial{ID: token(), Title: "Legacy computing notes", Subject: "Legacy/Computing", Class: 8, Board: "CBSE", Kind: "notes", Status: "draft", Version: 1, UpdatedAt: a.Now()}
	if _, err := s.C("study_materials").InsertOne(ctx, legacy); err != nil {
		t.Fatal(err)
	}
	if err := s.MigrateSubjects(ctx); err != nil {
		t.Fatal(err)
	}
	admin.ok("PUT", "/admin/subjects/Legacy%2FComputing", map[string]any{"name": "Legacy Computing", "active": true, "sortOrder": 90, "expectedVersion": 1}, 200)
	reactivate := map[string]any{"name": "Computing", "active": true, "sortOrder": 2, "expectedVersion": 3}
	admin.ok("PUT", path, reactivate, 200)
	if err := a.Store.Tx(ctx, func(ctx context.Context) error { _, err := a.bookingSubjects(ctx, 8, []string{id}); return err }); err != nil {
		t.Fatal("reactivated subject unavailable", err)
	}
	catalog := parent.ok("GET", "/subjects", nil, 200)
	raw, _ := json.Marshal(catalog)
	if !strings.Contains(string(raw), "Computing") || strings.Contains(string(raw), "normalizedName") || strings.Contains(string(raw), "useRevision") {
		t.Fatal("catalog DTO", string(raw))
	}
}
