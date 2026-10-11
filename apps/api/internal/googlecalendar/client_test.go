package googlecalendar

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func testClient(t *testing.T) *Client {
	t.Helper()
	c, e := New("fixture-client", "fixture-secret", "https://example.test/api/integrations/google/callback", base64.StdEncoding.EncodeToString(make([]byte, 32)))
	if e != nil {
		t.Fatal(e)
	}
	return c
}
func TestTokenEncryptionAndOAuth(t *testing.T) {
	c := testClient(t)
	encrypted, e := c.Encrypt("fictional-refresh-token", "mentor-a:refresh")
	if e != nil || strings.Contains(encrypted, "fictional-refresh-token") {
		t.Fatal("refresh token unprotected")
	}
	if value, e := c.Decrypt(encrypted, "mentor-a:refresh"); e != nil || value != "fictional-refresh-token" {
		t.Fatal("token roundtrip failed")
	}
	if _, e := c.Decrypt(encrypted, "mentor-b:refresh"); e == nil {
		t.Fatal("cross-mentor ciphertext accepted")
	}
	if _, e := c.Decrypt(encrypted, "mentor-a:access"); e == nil {
		t.Fatal("cross-purpose ciphertext accepted")
	}
	u, _ := url.Parse(c.Authorization("fixture-state", "fixture-verifier"))
	q := u.Query()
	if q.Get("state") != "fixture-state" || q.Get("code_challenge_method") != "S256" || q.Get("code_challenge") == "" || q.Get("access_type") != "offline" || q.Get("scope") != EventsScope+" "+EmailScope {
		t.Fatal("OAuth protections missing")
	}
	if HasScopes(EventsScope) || HasScopes(EmailScope) || !HasScopes(EventsScope+" "+EmailScope) {
		t.Fatal("scope validation incorrect")
	}
}
func TestGoogleURLBoundaries(t *testing.T) {
	for _, value := range []string{"http://meet.google.com/abc-defg-hij", "https://meet.google.com.evil.test/abc-defg-hij", "https://evil@meet.google.com/abc-defg-hij", "https://meet.google.com:443/abc-defg-hij", "https://meet.google.com/abc-defg-hij?token=secret", "https://meet.google.com/abc-defg-hij#x", "https://meet.google.com/lookup/private"} {
		if ValidMeetURL(value) {
			t.Fatal("invalid Meet URL accepted")
		}
	}
	if !ValidMeetURL("https://meet.google.com/abc-defg-hij") {
		t.Fatal("valid URL rejected")
	}
}
func TestConferenceLifecycle(t *testing.T) {
	var event Event
	event.Status = "confirmed"
	event.Conference.CreateRequest.Status.Code = "pending"
	if _, e := event.Link(); e == nil || Permanent(e) {
		t.Fatal("pending conference treated as confirmed")
	}
	event.Conference.CreateRequest.Status.Code = "failure"
	if _, e := event.Link(); e == nil || !Permanent(e) {
		t.Fatal("conference failure ignored")
	}
	event.Conference.CreateRequest.Status.Code = "success"
	event.HangoutLink = "https://meet.google.com/abc-defg-hij"
	if _, e := event.Link(); e != nil {
		t.Fatal(e)
	}
	event.Status = "cancelled"
	if _, e := event.Link(); e == nil {
		t.Fatal("cancelled conference joinable")
	}
}
func TestRefreshAndRedactedFailures(t *testing.T) {
	ctx := context.Background()
	c := testClient(t)
	var revoked atomic.Bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		if r.Form.Get("grant_type") != "refresh_token" || r.Form.Get("refresh_token") != "fixture-refresh" || r.Form.Get("client_secret") != "fixture-secret" {
			t.Error("refresh parameters missing")
		}
		w.Header().Set("Content-Type", "application/json")
		if revoked.Load() {
			w.WriteHeader(400)
			_, _ = w.Write([]byte(`{"error":"invalid_grant","error_description":"fixture-sensitive"}`))
			return
		}
		_, _ = w.Write([]byte(`{"access_token":"fixture-access","expires_in":3600,"token_type":"Bearer"}`))
	}))
	defer server.Close()
	c.TokenURL = server.URL
	tokens, e := c.Refresh(ctx, "fixture-refresh")
	if e != nil || tokens.Access != "fixture-access" {
		t.Fatal("refresh failed")
	}
	revoked.Store(true)
	_, e = c.Refresh(ctx, "fixture-refresh")
	if !NeedsReconnect(e) || strings.Contains(e.Error(), "fixture-sensitive") {
		t.Fatal("revocation not handled safely")
	}
}
func TestIdempotentCalendarAndConflicts(t *testing.T) {
	ctx := context.Background()
	c := testClient(t)
	now := time.Now().UTC().Truncate(time.Second)
	var saved *Event
	var posts, patches, deletes atomic.Int32
	var busy atomic.Bool
	var mu sync.Mutex
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		if r.Header.Get("Authorization") != "Bearer fixture-access" {
			t.Error("missing server bearer token")
		}
		if strings.HasSuffix(r.URL.Path, "/events") && r.Method == "GET" {
			if busy.Load() {
				_ = json.NewEncoder(w).Encode(map[string]any{"items": []map[string]string{{"id": "other-event", "status": "confirmed"}}})
			} else {
				_, _ = w.Write([]byte(`{"items":[]}`))
			}
			return
		}
		if strings.HasSuffix(r.URL.Path, "/events") && r.Method == "POST" {
			posts.Add(1)
			if r.URL.Query().Get("conferenceDataVersion") != "1" || r.URL.Query().Get("sendUpdates") != "all" {
				t.Error("conference or notifications missing")
			}
			var event Event
			_ = json.NewDecoder(r.Body).Decode(&event)
			if event.Conference.CreateRequest.ID != "op1" || event.Conference.CreateRequest.Solution["type"] != "hangoutsMeet" || len(event.Attendees) != 1 {
				t.Error("conference request invalid")
			}
			event.ETag = "original"
			event.Status = "confirmed"
			event.HangoutLink = "https://meet.google.com/abc-defg-hij"
			saved = &event
			_ = json.NewEncoder(w).Encode(saved)
			return
		}
		if saved == nil {
			w.WriteHeader(404)
			_, _ = w.Write([]byte(`{"error":"not_found"}`))
			return
		}
		if r.Method == "PATCH" {
			patches.Add(1)
			if r.Header.Get("If-Match") != saved.ETag {
				t.Error("etag missing")
			}
			var event Event
			_ = json.NewDecoder(r.Body).Decode(&event)
			saved.Start = event.Start
			saved.End = event.End
			saved.Description = event.Description
			saved.Extended = event.Extended
			saved.ETag = "updated"
		}
		if r.Method == "DELETE" {
			deletes.Add(1)
			if r.Header.Get("If-Match") != saved.ETag {
				t.Error("delete etag missing")
			}
			saved = nil
			w.WriteHeader(204)
			return
		}
		_ = json.NewEncoder(w).Encode(saved)
	}))
	defer server.Close()
	c.Base = server.URL
	event, e := c.Create(ctx, "fixture-access", "event1", "op1", "app1", "tutor@example.test", "Discuss teaching", now, now.Add(time.Hour))
	if e != nil {
		t.Fatal(e)
	}
	if _, e = c.Create(ctx, "fixture-access", "event1", "op1", "app1", "tutor@example.test", "", now, now.Add(time.Hour)); e != nil || posts.Load() != 1 {
		t.Fatal("duplicate event created")
	}
	if _, e = c.Update(ctx, "fixture-access", event.ID, "wrong", "op2", "Changed interview details", now.Add(time.Hour), now.Add(2*time.Hour)); e == nil || patches.Load() != 0 {
		t.Fatal("manual modification overwritten")
	}
	updated, e := c.Update(ctx, "fixture-access", event.ID, event.ETag, "op2", "Changed interview details", now.Add(time.Hour), now.Add(2*time.Hour))
	if e != nil {
		t.Fatal(e)
	}
	if updated.Description != "Changed interview details" {
		t.Fatal("rescheduled interview notes not synchronized")
	}
	if _, e = c.Update(ctx, "fixture-access", event.ID, event.ETag, "op2", "Changed interview details", now.Add(time.Hour), now.Add(2*time.Hour)); e != nil || patches.Load() != 1 {
		t.Fatal("update retry not idempotent")
	}
	if e = c.Delete(ctx, "fixture-access", event.ID, updated.ETag); e != nil {
		t.Fatal(e)
	}
	if e = c.Delete(ctx, "fixture-access", event.ID, updated.ETag); e != nil || deletes.Load() != 1 {
		t.Fatal("delete retry not idempotent")
	}
	busy.Store(true)
	if _, e = c.Create(ctx, "fixture-access", "event2", "op3", "app2", "", "", now, now.Add(time.Hour)); e == nil || posts.Load() != 1 {
		t.Fatal("calendar conflict ignored")
	}
}
