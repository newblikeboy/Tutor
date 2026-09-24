package meetings

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"
)

type Meeting struct {
	ID      string
	JoinURL string
}
type Gateway interface {
	Create(context.Context, string, time.Time, time.Time) (Meeting, error)
	Update(context.Context, string, time.Time, time.Time) (Meeting, error)
	Delete(context.Context, string) error
	Find(context.Context, string) (Meeting, bool, error)
}

// Definitive means a create request is known not to have created a meeting.
// Network/5xx failures after POST are ambiguous and must only be reconciled.
type Error struct{ Definitive bool }

func (e *Error) Error() string  { return "Zoom request could not be confirmed" }
func Definitive(err error) bool { var e *Error; return errors.As(err, &e) && e.Definitive }

var idPattern = regexp.MustCompile(`^[0-9]{6,15}$`)

func ValidJoinURL(value string) bool {
	u, e := url.Parse(value)
	if e != nil || u.Scheme != "https" || u.User != nil || u.Fragment != "" || u.Port() != "" || len(value) > 1000 {
		return false
	}
	host := strings.ToLower(u.Hostname())
	return (host == "zoom.us" || strings.HasSuffix(host, ".zoom.us") || host == "zoom.com" || strings.HasSuffix(host, ".zoom.com")) && strings.HasPrefix(u.Path, "/j/") && idPattern.MatchString(strings.TrimPrefix(u.Path, "/j/"))
}

type Zoom struct {
	account, clientID, secret, host, base, oauth string
	client                                       *http.Client
	mu                                           sync.Mutex
	token                                        string
	expires                                      time.Time
}

func New(account, clientID, secret, host string) *Zoom {
	return &Zoom{account: account, clientID: clientID, secret: secret, host: host, base: "https://api.zoom.us/v2", oauth: "https://zoom.us/oauth/token", client: &http.Client{Timeout: 10 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}
}

// UseTestEndpoint is only used by the explicitly configured loopback test harness.
// Runtime config rejects this override outside APP_ENV=test.
func (z *Zoom) UseTestEndpoint(endpoint string) {
	z.base = endpoint
	z.oauth = endpoint + "/oauth/token"
}
func (z *Zoom) accessToken(ctx context.Context) (string, error) {
	z.mu.Lock()
	defer z.mu.Unlock()
	if z.token != "" && time.Now().Before(z.expires) {
		return z.token, nil
	}
	p := url.Values{"grant_type": {"account_credentials"}, "account_id": {z.account}}
	req, e := http.NewRequestWithContext(ctx, http.MethodPost, z.oauth, strings.NewReader(p.Encode()))
	if e != nil {
		return "", &Error{true}
	}
	req.SetBasicAuth(z.clientID, z.secret)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	res, e := z.client.Do(req)
	if e != nil {
		return "", &Error{true}
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return "", &Error{true}
	}
	var v struct {
		Token   string `json:"access_token"`
		Expires int    `json:"expires_in"`
	}
	if json.NewDecoder(io.LimitReader(res.Body, 32*1024)).Decode(&v) != nil || v.Token == "" || v.Expires < 60 {
		return "", &Error{true}
	}
	z.token = v.Token
	z.expires = time.Now().Add(time.Duration(v.Expires-30) * time.Second)
	return z.token, nil
}
func (z *Zoom) request(ctx context.Context, method, path string, body any, out any) error {
	token, e := z.accessToken(ctx)
	if e != nil {
		return e
	}
	var b []byte
	if body != nil {
		b, e = json.Marshal(body)
		if e != nil {
			return &Error{true}
		}
	}
	req, e := http.NewRequestWithContext(ctx, method, z.base+path, bytes.NewReader(b))
	if e != nil {
		return &Error{true}
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	res, e := z.client.Do(req)
	if e != nil {
		return &Error{false}
	}
	defer res.Body.Close()
	if method == http.MethodDelete && res.StatusCode == 404 {
		return nil
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		if res.StatusCode == 401 {
			z.mu.Lock()
			z.token = ""
			z.mu.Unlock()
		}
		return &Error{res.StatusCode >= 400 && res.StatusCode < 500}
	}
	if out != nil && json.NewDecoder(io.LimitReader(res.Body, 2*1024*1024)).Decode(out) != nil {
		return &Error{false}
	}
	return nil
}

type response struct {
	ID      json.Number `json:"id"`
	JoinURL string      `json:"join_url"`
	Topic   string      `json:"topic"`
}

func (v response) meeting() (Meeting, error) {
	if !idPattern.MatchString(string(v.ID)) || !ValidJoinURL(v.JoinURL) {
		return Meeting{}, &Error{false}
	}
	return Meeting{string(v.ID), v.JoinURL}, nil
}
func details(start, end time.Time) map[string]any {
	return map[string]any{"start_time": start.UTC().Format(time.RFC3339), "duration": int(end.Sub(start) / time.Minute), "timezone": "Asia/Kolkata"}
}
func (z *Zoom) Create(ctx context.Context, topic string, start, end time.Time) (Meeting, error) {
	body := details(start, end)
	body["type"] = 2
	body["topic"] = topic
	body["settings"] = map[string]any{"waiting_room": true, "join_before_host": false, "use_pmi": false, "auto_recording": "none", "meeting_authentication": false}
	var v response
	if e := z.request(ctx, http.MethodPost, "/users/"+url.PathEscape(z.host)+"/meetings", body, &v); e != nil {
		return Meeting{}, e
	}
	return v.meeting()
}
func (z *Zoom) get(ctx context.Context, id string) (Meeting, error) {
	var v response
	if !idPattern.MatchString(id) {
		return Meeting{}, &Error{true}
	}
	if e := z.request(ctx, http.MethodGet, "/meetings/"+id, nil, &v); e != nil {
		return Meeting{}, e
	}
	return v.meeting()
}
func (z *Zoom) Update(ctx context.Context, id string, start, end time.Time) (Meeting, error) {
	if !idPattern.MatchString(id) {
		return Meeting{}, &Error{true}
	}
	if e := z.request(ctx, http.MethodPatch, "/meetings/"+id, details(start, end), nil); e != nil {
		return Meeting{}, e
	}
	return z.get(ctx, id)
}
func (z *Zoom) Delete(ctx context.Context, id string) error {
	if !idPattern.MatchString(id) {
		return &Error{true}
	}
	return z.request(ctx, http.MethodDelete, "/meetings/"+id, nil, nil)
}
func (z *Zoom) Find(ctx context.Context, topic string) (Meeting, bool, error) {
	next := ""
	var found string
	for page := 0; page < 20; page++ {
		p := url.Values{"type": {"scheduled"}, "page_size": {"100"}}
		if next != "" {
			p.Set("next_page_token", next)
		}
		var list struct {
			Meetings []response `json:"meetings"`
			Next     string     `json:"next_page_token"`
		}
		if e := z.request(ctx, http.MethodGet, "/users/"+url.PathEscape(z.host)+"/meetings?"+p.Encode(), nil, &list); e != nil {
			return Meeting{}, false, e
		}
		for _, v := range list.Meetings {
			if v.Topic == topic {
				if found != "" {
					return Meeting{}, false, &Error{false}
				}
				found = string(v.ID)
			}
		}
		next = list.Next
		if next == "" {
			if found == "" {
				return Meeting{}, false, nil
			}
			v, e := z.get(ctx, found)
			return v, e == nil, e
		}
	}
	return Meeting{}, false, &Error{false}
}
