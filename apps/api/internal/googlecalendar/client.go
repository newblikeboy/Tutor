// Package googlecalendar contains server-only Google OAuth and Calendar requests.
package googlecalendar

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

const EventsScope = "https://www.googleapis.com/auth/calendar.events"
const EmailScope = "https://www.googleapis.com/auth/userinfo.email"

type Error struct {
	Code                 string
	Permanent, Reconnect bool
}

func (e *Error) Error() string                             { return e.Code }
func Failure(code string, permanent, reconnect bool) error { return &Error{code, permanent, reconnect} }
func NeedsReconnect(e error) bool                          { var v *Error; return errors.As(e, &v) && v.Reconnect }
func Permanent(e error) bool                               { var v *Error; return errors.As(e, &v) && v.Permanent }

type Client struct {
	AuthURL                            string
	ID, Secret, Redirect               string
	HTTP                               *http.Client
	Base, TokenURL, UserURL, RevokeURL string
	aead                               cipher.AEAD
}

func New(id, secret, redirect, key string) (*Client, error) {
	b, e := base64.StdEncoding.DecodeString(key)
	if e != nil || len(b) != 32 {
		return nil, Failure("google_key_invalid", true, false)
	}
	block, e := aes.NewCipher(b)
	if e != nil {
		return nil, e
	}
	aead, e := cipher.NewGCM(block)
	if e != nil {
		return nil, e
	}
	return &Client{ID: id, Secret: secret, Redirect: redirect, aead: aead, HTTP: &http.Client{Timeout: 8 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}, AuthURL: "https://accounts.google.com/o/oauth2/v2/auth", Base: "https://www.googleapis.com/calendar/v3", TokenURL: "https://oauth2.googleapis.com/token", UserURL: "https://www.googleapis.com/oauth2/v2/userinfo", RevokeURL: "https://oauth2.googleapis.com/revoke"}, nil
}

// Encrypt binds ciphertext to the owning mentor and purpose, preventing token swaps.
func (c *Client) Encrypt(value, binding string) (string, error) {
	n := make([]byte, c.aead.NonceSize())
	if _, e := rand.Read(n); e != nil {
		return "", e
	}
	return base64.StdEncoding.EncodeToString(c.aead.Seal(n, n, []byte(value), []byte(binding))), nil
}
func (c *Client) Decrypt(value, binding string) (string, error) {
	b, e := base64.StdEncoding.DecodeString(value)
	if e != nil || len(b) < c.aead.NonceSize() {
		return "", Failure("google_token_invalid", true, true)
	}
	n := c.aead.NonceSize()
	p, e := c.aead.Open(nil, b[:n], b[n:], []byte(binding))
	if e != nil {
		return "", Failure("google_token_invalid", true, true)
	}
	return string(p), nil
}
func (c *Client) Authorization(state, verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	p := url.Values{"client_id": {c.ID}, "redirect_uri": {c.Redirect}, "response_type": {"code"}, "scope": {EventsScope + " " + EmailScope}, "access_type": {"offline"}, "prompt": {"consent select_account"}, "state": {state}, "code_challenge_method": {"S256"}, "code_challenge": {base64.RawURLEncoding.EncodeToString(sum[:])}}
	return c.AuthURL + "?" + p.Encode()
}

type Tokens struct {
	Access  string `json:"access_token"`
	Refresh string `json:"refresh_token"`
	Expires int    `json:"expires_in"`
	Scope   string `json:"scope"`
	Type    string `json:"token_type"`
}

func (c *Client) tokens(ctx context.Context, p url.Values) (Tokens, error) {
	p.Set("client_id", c.ID)
	p.Set("client_secret", c.Secret)
	var v Tokens
	e := c.request(ctx, http.MethodPost, c.TokenURL, "", p, nil, &v)
	if e != nil {
		return v, e
	}
	if v.Access == "" || v.Expires < 60 || !strings.EqualFold(v.Type, "Bearer") {
		return v, Failure("google_token_response_invalid", true, true)
	}
	return v, nil
}
func (c *Client) Exchange(ctx context.Context, code, verifier string) (Tokens, error) {
	return c.tokens(ctx, url.Values{"grant_type": {"authorization_code"}, "code": {code}, "redirect_uri": {c.Redirect}, "code_verifier": {verifier}})
}
func (c *Client) Refresh(ctx context.Context, refresh string) (Tokens, error) {
	return c.tokens(ctx, url.Values{"grant_type": {"refresh_token"}, "refresh_token": {refresh}})
}
func HasScopes(scopes string) bool {
	fields := strings.Fields(scopes)
	events, email := false, false
	for _, s := range fields {
		events = events || s == EventsScope
		email = email || s == EmailScope || s == "email"
	}
	return events && email
}
func (c *Client) Email(ctx context.Context, access string) (string, error) {
	var v struct {
		Email    string `json:"email"`
		Verified bool   `json:"verified_email"`
	}
	e := c.request(ctx, "GET", c.UserURL, access, nil, nil, &v)
	if e != nil {
		return "", e
	}
	if !v.Verified || v.Email == "" {
		return "", Failure("google_email_unverified", true, true)
	}
	return strings.ToLower(v.Email), nil
}
func (c *Client) Revoke(ctx context.Context, refresh string) error {
	return c.request(ctx, "POST", c.RevokeURL, "", url.Values{"token": {refresh}}, nil, nil)
}
func (c *Client) request(ctx context.Context, method, endpoint, access string, body any, headers map[string]string, out any) error {
	var b []byte
	ct := "application/json"
	if form, ok := body.(url.Values); ok {
		b = []byte(form.Encode())
		ct = "application/x-www-form-urlencoded"
	} else if body != nil {
		var e error
		b, e = json.Marshal(body)
		if e != nil {
			return e
		}
	}
	req, e := http.NewRequestWithContext(ctx, method, endpoint, bytes.NewReader(b))
	if e != nil {
		return Failure("google_request_invalid", true, false)
	}
	req.Header.Set("Content-Type", ct)
	if access != "" {
		req.Header.Set("Authorization", "Bearer "+access)
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	res, e := c.HTTP.Do(req)
	if e != nil {
		return Failure("google_unavailable", false, false)
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		var detail struct {
			Error json.RawMessage `json:"error"`
		}
		_ = json.NewDecoder(io.LimitReader(res.Body, 16384)).Decode(&detail)
		if res.StatusCode == 401 || string(detail.Error) == `"invalid_grant"` {
			return Failure("google_reconnect_required", true, true)
		}
		if endpoint == c.RevokeURL && res.StatusCode == 400 && string(detail.Error) == `"invalid_token"` {
			return Failure("google_already_revoked", true, false)
		}
		if res.StatusCode == 404 || res.StatusCode == 410 {
			return Failure("google_event_missing", true, false)
		}
		if res.StatusCode == 409 {
			return Failure("google_event_exists", false, false)
		}
		if res.StatusCode == 412 {
			return Failure("google_calendar_conflict", true, false)
		}
		if res.StatusCode == 403 {
			var v struct {
				Errors []struct {
					Reason string `json:"reason"`
				} `json:"errors"`
			}
			_ = json.Unmarshal(detail.Error, &v)
			for _, r := range v.Errors {
				if r.Reason == "rateLimitExceeded" || r.Reason == "userRateLimitExceeded" || r.Reason == "quotaExceeded" {
					return Failure("google_rate_limited", false, false)
				}
			}
			return Failure("google_permission_required", true, true)
		}
		return Failure("google_request_failed", res.StatusCode >= 400 && res.StatusCode < 500 && res.StatusCode != 429, false)
	}
	if out != nil && json.NewDecoder(io.LimitReader(res.Body, 2*1024*1024)).Decode(out) != nil {
		return Failure("google_response_invalid", false, false)
	}
	return nil
}

type Instant struct {
	DateTime string `json:"dateTime"`
	Timezone string `json:"timeZone,omitempty"`
}
type Event struct {
	ID          string              `json:"id"`
	ETag        string              `json:"etag"`
	Status      string              `json:"status"`
	Summary     string              `json:"summary"`
	Description string              `json:"description,omitempty"`
	Start       Instant             `json:"start"`
	End         Instant             `json:"end"`
	HangoutLink string              `json:"hangoutLink"`
	Attendees   []map[string]string `json:"attendees,omitempty"`
	Extended    struct {
		Private map[string]string `json:"private"`
	} `json:"extendedProperties"`
	Conference struct {
		ID          string `json:"conferenceId"`
		EntryPoints []struct {
			Type string `json:"entryPointType"`
			URI  string `json:"uri"`
		} `json:"entryPoints"`
		CreateRequest struct {
			ID       string            `json:"requestId"`
			Solution map[string]string `json:"conferenceSolutionKey"`
			Status   struct {
				Code string `json:"statusCode"`
			} `json:"status"`
		} `json:"createRequest"`
	} `json:"conferenceData"`
}

var meetPath = regexp.MustCompile(`^/[a-z]{3}-[a-z]{4}-[a-z]{3}$`)

func ValidMeetURL(value string) bool {
	u, e := url.Parse(value)
	return e == nil && u.Scheme == "https" && u.Host == "meet.google.com" && u.User == nil && u.RawQuery == "" && u.Fragment == "" && meetPath.MatchString(u.Path)
}
func (e Event) Link() (string, error) {
	if e.Status == "cancelled" {
		return "", Failure("google_event_missing", true, false)
	}
	if e.Conference.CreateRequest.Status.Code == "pending" {
		return "", Failure("google_conference_pending", false, false)
	}
	if e.Conference.CreateRequest.Status.Code == "failure" {
		return "", Failure("google_conference_failed", true, false)
	}
	for _, p := range e.Conference.EntryPoints {
		if p.Type == "video" && ValidMeetURL(p.URI) {
			return p.URI, nil
		}
	}
	if ValidMeetURL(e.HangoutLink) {
		return e.HangoutLink, nil
	}
	return "", Failure("google_conference_pending", false, false)
}
func (c *Client) eventURL(id string) string {
	return c.Base + "/calendars/primary/events/" + url.PathEscape(id)
}
func (c *Client) Get(ctx context.Context, access, id string) (Event, error) {
	var v Event
	e := c.request(ctx, "GET", c.eventURL(id), access, nil, nil, &v)
	return v, e
}
func (c *Client) Probe(ctx context.Context, access string) error {
	var v any
	return c.request(ctx, "GET", c.Base+"/calendars/primary/events?maxResults=1&fields=kind", access, nil, nil, &v)
}

// Busy reads event intervals with the already-consented events scope; freebusy's additional scope is unnecessary.
func (c *Client) Busy(ctx context.Context, access string, start, end time.Time, exclude string) error {
	q := url.Values{"timeMin": {start.UTC().Format(time.RFC3339Nano)}, "timeMax": {end.UTC().Format(time.RFC3339Nano)}, "singleEvents": {"true"}, "maxResults": {"250"}}
	for page := 0; page < 20; page++ {
		var v struct {
			Items []struct{ ID, Status, Transparency string } `json:"items"`
			Next  string                                      `json:"nextPageToken"`
		}
		if e := c.request(ctx, "GET", c.Base+"/calendars/primary/events?"+q.Encode(), access, nil, nil, &v); e != nil {
			return e
		}
		for _, item := range v.Items {
			if item.ID != exclude && item.Status != "cancelled" && item.Transparency != "transparent" {
				return Failure("google_calendar_busy", true, false)
			}
		}
		if v.Next == "" {
			return nil
		}
		q.Set("pageToken", v.Next)
	}
	return Failure("google_calendar_scan_incomplete", true, false)
}
func (c *Client) Create(ctx context.Context, access, id, operation, application, email, notes string, start, end time.Time) (Event, error) {
	return c.create(ctx, access, id, operation, application, email, "GoCoaching - Tutor Verification Interview", notes, start, end)
}
func (c *Client) CreateLesson(ctx context.Context, access, id, operation, lesson, email string, start, end time.Time) (Event, error) {
	return c.create(ctx, access, id, operation, lesson, email, "GoCoaching - Online Lesson", "Join your scheduled GoCoaching lesson from your account.", start, end)
}
func (c *Client) create(ctx context.Context, access, id, operation, application, email, summary, notes string, start, end time.Time) (Event, error) {
	v, e := c.Get(ctx, access, id)
	if e == nil {
		if v.Extended.Private["application"] != application {
			return v, Failure("google_calendar_conflict", true, false)
		}
		return v, nil
	}
	var f *Error
	if !errors.As(e, &f) || f.Code != "google_event_missing" {
		return v, e
	}
	if e = c.Busy(ctx, access, start, end, ""); e != nil {
		return v, e
	}
	v = Event{ID: id, Summary: summary, Description: notes, Start: Instant{start.UTC().Format(time.RFC3339Nano), "Asia/Kolkata"}, End: Instant{end.UTC().Format(time.RFC3339Nano), "Asia/Kolkata"}}
	v.Extended.Private = map[string]string{"application": application, "operation": operation}
	v.Conference.CreateRequest.ID = operation
	v.Conference.CreateRequest.Solution = map[string]string{"type": "hangoutsMeet"}
	if email != "" {
		v.Attendees = []map[string]string{{"email": email}}
	}
	body := map[string]any{"id": v.ID, "summary": v.Summary, "description": v.Description, "start": v.Start, "end": v.End, "extendedProperties": v.Extended, "conferenceData": map[string]any{"createRequest": map[string]any{"requestId": operation, "conferenceSolutionKey": map[string]string{"type": "hangoutsMeet"}}}}
	if len(v.Attendees) > 0 {
		body["attendees"] = v.Attendees
	}
	e = c.request(ctx, "POST", c.Base+"/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all", access, body, nil, &v)
	if errors.As(e, &f) && f.Code == "google_event_exists" {
		return c.Get(ctx, access, id)
	}
	return v, e
}
func (c *Client) Update(ctx context.Context, access, id, etag, operation, notes string, start, end time.Time) (Event, error) {
	v, e := c.Get(ctx, access, id)
	if e != nil {
		return v, e
	}
	if v.Status == "cancelled" {
		return v, Failure("google_event_missing", true, false)
	}
	if v.Extended.Private["operation"] == operation {
		return v, nil
	}
	if etag == "" || v.ETag != etag {
		return v, Failure("google_calendar_conflict", true, false)
	}
	if v.Extended.Private == nil {
		return v, Failure("google_calendar_conflict", true, false)
	}
	if e = c.Busy(ctx, access, start, end, id); e != nil {
		return v, e
	}
	v.Extended.Private["operation"] = operation
	body := map[string]any{"start": Instant{start.UTC().Format(time.RFC3339Nano), "Asia/Kolkata"}, "end": Instant{end.UTC().Format(time.RFC3339Nano), "Asia/Kolkata"}, "description": notes, "extendedProperties": v.Extended}
	e = c.request(ctx, "PATCH", c.eventURL(id)+"?conferenceDataVersion=1&sendUpdates=all", access, body, map[string]string{"If-Match": etag}, &v)
	return v, e
}
func (c *Client) Delete(ctx context.Context, access, id, etag string) error {
	v, e := c.Get(ctx, access, id)
	var f *Error
	if errors.As(e, &f) && f.Code == "google_event_missing" {
		return nil
	}
	if e != nil {
		return e
	}
	if v.Status == "cancelled" {
		return nil
	}
	if etag == "" || v.ETag != etag {
		return Failure("google_calendar_conflict", true, false)
	}
	e = c.request(ctx, "DELETE", c.eventURL(id)+"?sendUpdates=all", access, nil, map[string]string{"If-Match": etag}, nil)
	if errors.As(e, &f) && f.Code == "google_event_missing" {
		return nil
	}
	return e
}
