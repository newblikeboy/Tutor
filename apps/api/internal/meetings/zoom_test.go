package meetings

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestZoomOAuthAndMeetingLifecycle(t *testing.T) {
	tokens, creates, updates, deletes := 0, 0, 0, 0
	start := time.Date(2030, 1, 2, 10, 0, 0, 0, time.UTC)
	topic := "Tutor assessment fixture-operation"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/oauth/token" {
			tokens++
			r.ParseForm()
			id, secret, ok := r.BasicAuth()
			if !ok || id != "client" || secret != "secret" || r.Form.Get("grant_type") != "account_credentials" || r.Form.Get("account_id") != "account" {
				t.Error("invalid OAuth request")
			}
			fmt.Fprint(w, `{"access_token":"fixture-access-token","expires_in":3600}`)
			return
		}
		if r.Header.Get("Authorization") != "Bearer fixture-access-token" {
			t.Error("missing access token")
		}
		switch r.Method + " " + r.URL.Path {
		case "POST /users/fixture-host/meetings":
			creates++
			var body map[string]any
			json.NewDecoder(r.Body).Decode(&body)
			if body["type"] != float64(2) || body["topic"] != topic || body["duration"] != float64(30) || body["start_time"] != start.Format(time.RFC3339) {
				t.Error("meeting fields incorrect")
			}
			settings := body["settings"].(map[string]any)
			if settings["waiting_room"] != true || settings["join_before_host"] != false || settings["auto_recording"] != "none" {
				t.Error("unsafe meeting defaults")
			}
			w.WriteHeader(201)
			fmt.Fprint(w, `{"id":12345678901,"join_url":"https://example.zoom.us/j/12345678901?pwd=fixture","start_url":"host-secret-must-not-be-stored"}`)
		case "PATCH /meetings/12345678901":
			updates++
			w.WriteHeader(204)
		case "GET /meetings/12345678901":
			fmt.Fprint(w, `{"id":12345678901,"join_url":"https://example.zoom.us/j/12345678901?pwd=fixture"}`)
		case "GET /users/fixture-host/meetings":
			fmt.Fprintf(w, `{"meetings":[{"id":12345678901,"topic":%q}],"next_page_token":""}`, topic)
		case "DELETE /meetings/12345678901":
			deletes++
			w.WriteHeader(404)
		default:
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
			w.WriteHeader(500)
		}
	}))
	defer server.Close()
	z := New("account", "client", "secret", "fixture-host")
	z.base = server.URL
	z.oauth = server.URL + "/oauth/token"
	ctx := context.Background()
	m, e := z.Create(ctx, topic, start, start.Add(30*time.Minute))
	if e != nil || m.ID != "12345678901" {
		t.Fatal("create failed", e)
	}
	if _, e = z.Update(ctx, m.ID, start.Add(time.Hour), start.Add(90*time.Minute)); e != nil {
		t.Fatal(e)
	}
	got, found, e := z.Find(ctx, topic)
	if e != nil || !found || got.ID != m.ID {
		t.Fatal("reconciliation failed")
	}
	if e = z.Delete(ctx, m.ID); e != nil {
		t.Fatal("404 deletion should be idempotent")
	}
	if tokens != 1 || creates != 1 || updates != 1 || deletes != 1 {
		t.Fatal("unexpected request count")
	}
}

func TestZoomCreateFailureClassification(t *testing.T) {
	for _, status := range []int{400, 401, 429, 500, 503} {
		t.Run(fmt.Sprint(status), func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(status) }))
			defer server.Close()
			z := New("account", "client", "secret", "host")
			z.base = server.URL
			z.token = "fixture"
			z.expires = time.Now().Add(time.Hour)
			_, e := z.Create(context.Background(), "topic", time.Now(), time.Now().Add(time.Hour))
			if e == nil || Definitive(e) != (status < 500) {
				t.Fatal("unsafe create retry classification")
			}
		})
	}
	if ValidJoinURL("https://zoom.us.attacker.test/j/12345678901") || ValidJoinURL("https://zoom.us@attacker.test/j/12345678901") || ValidJoinURL("http://zoom.us/j/12345678901") {
		t.Fatal("unsafe join URL")
	}
}
