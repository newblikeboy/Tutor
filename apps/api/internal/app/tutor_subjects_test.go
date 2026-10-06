package app

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"os"
	"reflect"
	"sort"
	"strings"
	"testing"
	"time"
	"tutorplatform/internal/config"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
)

func TestTutorSubjectFilters(t *testing.T) {
	uri := os.Getenv("TEST_MONGODB_URI")
	if uri == "" {
		t.Skip("TEST_MONGODB_URI required for discovery persistence tests")
	}
	ctx := context.Background()
	s, err := storage.Connect(ctx, uri, "tutor_test_subjects_"+token()[:12])
	if err != nil {
		t.Fatal(err)
	}
	defer s.Client.Disconnect(ctx)
	if err = s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	for _, fixture := range []struct {
		id, subject, mode, status string
		expired, paused           bool
	}{
		{"math", "Mathematics", "online", "approved", false, false},
		{"science", "Science", "online", "approved", false, false},
		{"english", "English", "online", "approved", false, false},
		{"home", "Science", "home", "approved", false, false},
		{"expired", "Science", "online", "approved", true, false},
		{"declined", "Science", "online", "declined", false, false},
		{"paused", "Science", "online", "approved", false, true},
	} {
		expires := time.Now().Add(24 * time.Hour)
		if fixture.expired {
			expires = time.Now().Add(-time.Hour)
		}
		application := domain.Application{ID: fixture.id, Name: "Sample " + fixture.id, Sample: true, Status: fixture.status, Language: "English", Scope: domain.Scope{Subject: fixture.subject, Mode: fixture.mode, MinClass: 6, MaxClass: 10, ExpiresAt: expires}}
		if _, err = s.C("applications").InsertOne(ctx, application); err != nil {
			t.Fatal(err)
		}
		if fixture.paused {
			if _, err = s.C("availability").InsertOne(ctx, domain.Availability{ID: fixture.id, Paused: true}); err != nil {
				t.Fatal(err)
			}
		}
	}
	router := New(s, config.Config{Env: "test", Origin: "http://test.local"}).Routes()
	for _, tc := range []struct {
		query string
		ids   []string
	}{
		{"subject=Mathematics", []string{"math"}},
		{"subject=Mathematics&subject=Science&mode=online&class=8", []string{"math", "science"}},
		{"subject=Science&subject=English&mode=home", []string{"home"}},
		{"subject=Science&subject=English&class=12", []string{}},
		{"subject=Hindi", []string{}},
		{"mode=online", []string{"english", "math", "science"}},
	} {
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, httptest.NewRequest("GET", "/api/v1/tutors?"+tc.query, nil))
		if rec.Code != 200 {
			t.Fatal(rec.Code, rec.Body.String())
		}
		var tutors []domain.PublicTutor
		if err = json.Unmarshal(rec.Body.Bytes(), &tutors); err != nil {
			t.Fatal(err)
		}
		ids := []string{}
		for _, tutor := range tutors {
			ids = append(ids, tutor.ID)
		}
		sort.Strings(ids)
		if !reflect.DeepEqual(ids, tc.ids) {
			t.Fatalf("%s: got %v want %v", tc.query, ids, tc.ids)
		}
	}
	for _, query := range []string{"subject=", "subject=" + strings.Repeat("a", 81), strings.Repeat("subject=Science&", 21)} {
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, httptest.NewRequest("GET", "/api/v1/tutors?"+query, nil))
		if rec.Code != 422 {
			t.Fatalf("invalid subject query returned %d", rec.Code)
		}
	}
}
