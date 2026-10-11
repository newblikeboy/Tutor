package app

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
	"tutorplatform/internal/googlecalendar"
)

// Wire responses are confined to httptest; production cannot select this helper.
type recruitmentGoogle struct {
	mu                        sync.Mutex
	creates, updates, deletes atomic.Int64
	ambiguous, findAvailable  atomic.Bool
	events                    map[string]googlecalendar.Event
}

func installGoogleFixture(t *testing.T, a *App, ids ...string) *recruitmentGoogle {
	t.Helper()
	g := &recruitmentGoogle{events: map[string]googlecalendar.Event{}}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		g.mu.Lock()
		defer g.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/token" {
			_ = json.NewEncoder(w).Encode(map[string]any{"access_token": "fixture-access", "refresh_token": "fixture-refresh", "expires_in": 3600, "token_type": "Bearer", "scope": googlecalendar.EventsScope + " " + googlecalendar.EmailScope})
			return
		}
		if r.URL.Path == "/revoke" {
			_, _ = w.Write([]byte(`{}`))
			return
		}
		if r.URL.Path == "/userinfo" {
			_, _ = w.Write([]byte(`{"email":"fixture-host@example.test","verified_email":true}`))
			return
		}
		root := "/calendars/primary/events"
		if r.URL.Path == root && r.Method == "GET" {
			_, _ = w.Write([]byte(`{"kind":"calendar#events","items":[]}`))
			return
		}
		if r.URL.Path == root && r.Method == "POST" {
			var e googlecalendar.Event
			_ = json.NewDecoder(r.Body).Decode(&e)
			if _, exists := g.events[e.ID]; exists {
				w.WriteHeader(409)
				return
			}
			g.creates.Add(1)
			e.ETag = "original"
			e.Status = "confirmed"
			e.Conference.CreateRequest.Status.Code = "success"
			e.HangoutLink = "https://meet.google.com/abc-defg-hij"
			g.events[e.ID] = e
			if g.ambiguous.Load() {
				w.WriteHeader(503)
				return
			}
			_ = json.NewEncoder(w).Encode(e)
			return
		}
		id := strings.TrimPrefix(r.URL.Path, root+"/")
		e, exists := g.events[id]
		if !exists || g.ambiguous.Load() && !g.findAvailable.Load() {
			w.WriteHeader(404)
			return
		}
		if r.Method == "PATCH" {
			if r.Header.Get("If-Match") != e.ETag {
				w.WriteHeader(412)
				return
			}
			var in googlecalendar.Event
			_ = json.NewDecoder(r.Body).Decode(&in)
			g.updates.Add(1)
			e.Start = in.Start
			e.End = in.End
			e.Description = in.Description
			e.Extended = in.Extended
			e.ETag = "updated"
			g.events[id] = e
		}
		if r.Method == "DELETE" {
			if r.Header.Get("If-Match") != e.ETag {
				w.WriteHeader(412)
				return
			}
			g.deletes.Add(1)
			delete(g.events, id)
			w.WriteHeader(204)
			return
		}
		_ = json.NewEncoder(w).Encode(e)
	}))
	t.Cleanup(srv.Close)
	var err error
	a.Google, err = googlecalendar.New("fixture-client", "fixture-secret", "https://example.test/api/integrations/google/callback", base64.StdEncoding.EncodeToString(make([]byte, 32)))
	if err != nil {
		t.Fatal(err)
	}
	a.Google.Base = srv.URL
	a.Google.TokenURL = srv.URL + "/token"
	a.Google.UserURL = srv.URL + "/userinfo"
	a.Google.RevokeURL = srv.URL + "/revoke"
	a.Config.MeetingProvider = "google"
	a.Config.InterviewProvider = "google"
	if len(ids) == 0 {
		ids = []string{"mentor-a"}
	}
	for _, id := range ids {
		access, e := a.Google.Encrypt("fixture-access", id+":access")
		if e != nil {
			t.Fatal(e)
		}
		refresh, e := a.Google.Encrypt("fixture-refresh", id+":refresh")
		if e != nil {
			t.Fatal(e)
		}
		email := id + "@example.test"
		if strings.HasPrefix(id, "mentor") {
			email = "shared-mentor@example.test"
		}
		_, e = a.Store.C("google_connections").ReplaceOne(context.Background(), bson.M{"_id": id}, googleConnection{ID: id, Generation: token(), Email: email, Status: "connected", Access: access, Refresh: refresh, ExpiresAt: a.Now().Add(24 * time.Hour), CheckedAt: a.Now()}, options.Replace().SetUpsert(true))
		if e != nil {
			t.Fatal(e)
		}
	}
	return g
}
