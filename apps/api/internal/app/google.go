package app

import (
	"context"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"net/http"
	"net/url"
	"strings"
	"time"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/googlecalendar"
	"tutorplatform/internal/storage"
)

type googleConnection struct {
	ID         string    `bson:"_id"`
	Generation string    `bson:"generation"`
	Email      string    `bson:"email"`
	Status     string    `bson:"status"`
	Access     string    `bson:"access"`
	Refresh    string    `bson:"refresh"`
	ExpiresAt  time.Time `bson:"expiresAt"`
	CheckedAt  time.Time `bson:"checkedAt"`
	Revision   int       `bson:"revision"`
}
type googleOAuthState struct {
	ID        string    `bson:"_id"`
	Hash      string    `bson:"hash"`
	Session   string    `bson:"session"`
	Verifier  string    `bson:"verifier"`
	ExpiresAt time.Time `bson:"expiresAt"`
}

func (a *App) googleAvailable(w http.ResponseWriter, r *http.Request) bool {
	if a.Google == nil {
		a.error(w, r, domain.Fail(503, "google_unconfigured", "Google meetings are not configured."))
		return false
	}
	return true
}
func (a *App) googleRevoking(ctx context.Context, id string) error {
	n, e := a.Store.C("outbox").CountDocuments(ctx, bson.M{"kind": "google_revoke", "payload.mentorId": id, "status": bson.M{"$ne": "done"}})
	if e != nil {
		return e
	}
	if n > 0 {
		return domain.Fail(409, "google_revocation_pending", "Google disconnection is still being confirmed. Try again after it finishes.")
	}
	return nil
}
func (a *App) googleConnect(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "mentor", "tutor") || !a.googleAvailable(w, r) {
		return
	}
	if err := a.googleOrganizerAllowed(r.Context(), user(r)); err != nil {
		a.error(w, r, err)
		return
	}
	if a.Config.Env == "development" {
		callback, _ := url.Parse(a.Google.Redirect)
		if callback.Scheme+"://"+callback.Host != a.Config.Origin {
			a.error(w, r, domain.Fail(503, "google_callback_unconfigured", "Google connection is not available at this local address. The administrator must configure its callback first."))
			return
		}
	}
	id := user(r).ID
	if e := a.rate(r.Context(), "google-connect:"+id, 5); e != nil {
		a.error(w, r, e)
		return
	}
	if e := a.googleRevoking(r.Context(), id); e != nil {
		a.error(w, r, e)
		return
	}
	state, verifier := token(), token()
	encrypted, e := a.Google.Encrypt(verifier, id+":pkce")
	if e != nil {
		a.error(w, r, e)
		return
	}
	cookie, _ := r.Cookie("session")
	_, e = a.Store.C("google_oauth_states").ReplaceOne(r.Context(), bson.M{"_id": id}, googleOAuthState{ID: id, Hash: digest(state), Session: digest(cookie.Value), Verifier: encrypted, ExpiresAt: a.Now().Add(10 * time.Minute)}, options.Replace().SetUpsert(true))
	if e != nil {
		a.error(w, r, e)
		return
	}
	authorization, _ := url.Parse(a.Google.Authorization(state, verifier))
	query := authorization.Query()
	query.Set("login_hint", user(r).Email)
	authorization.RawQuery = query.Encode()
	a.json(w, 200, map[string]string{"url": authorization.String()})
}
func (a *App) googleCallback(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Referrer-Policy", "no-referrer")
	if !a.role(w, r, "mentor", "tutor") || !a.googleAvailable(w, r) {
		return
	}
	if err := a.googleOrganizerAllowed(r.Context(), user(r)); err != nil {
		a.error(w, r, err)
		return
	}
	redirect := func(result string) {
		http.Redirect(w, r, a.Config.Origin+googleReturnPath(user(r))+"&google="+result, http.StatusSeeOther)
	}
	id := user(r).ID
	cookie, _ := r.Cookie("session")
	state := r.URL.Query().Get("state")
	var v googleOAuthState
	e := a.Store.C("google_oauth_states").FindOneAndDelete(r.Context(), bson.M{"_id": id, "hash": digest(state), "session": digest(cookie.Value), "expiresAt": bson.M{"$gt": a.Now()}}).Decode(&v)
	if e != nil || len(state) != 64 {
		redirect("invalid_state")
		return
	}
	if r.URL.Query().Get("error") != "" {
		redirect("denied")
		return
	}
	code := r.URL.Query().Get("code")
	if len(code) == 0 || len(code) > 4096 {
		redirect("failed")
		return
	}
	verifier, e := a.Google.Decrypt(v.Verifier, id+":pkce")
	if e != nil {
		redirect("failed")
		return
	}
	tokens, e := a.Google.Exchange(r.Context(), code, verifier)
	if e != nil {
		redirect("failed")
		return
	}
	if !googlecalendar.HasScopes(tokens.Scope) || tokens.Refresh == "" {
		redirect("consent_required")
		return
	}
	email, e := a.Google.Email(r.Context(), tokens.Access)
	if e != nil {
		redirect("failed")
		return
	}
	var validEmail bool
	email, validEmail = normalizeEmail(email)
	if !validEmail {
		redirect("failed")
		return
	}
	if e = a.Google.Probe(r.Context(), tokens.Access); e != nil {
		redirect("failed")
		return
	}
	connection := googleConnection{ID: id, Generation: token(), Email: email, Status: "connected", ExpiresAt: a.Now().Add(time.Duration(tokens.Expires-30) * time.Second), CheckedAt: a.Now()}
	connection.Access, e = a.Google.Encrypt(tokens.Access, id+":access")
	if e != nil {
		redirect("failed")
		return
	}
	connection.Refresh, e = a.Google.Encrypt(tokens.Refresh, id+":refresh")
	if e != nil {
		redirect("failed")
		return
	}
	e = a.Store.Tx(r.Context(), func(ctx context.Context) error {
		if err := a.googleRevoking(ctx, id); err != nil {
			return err
		}
		old, err := storage.One[googleConnection](ctx, a.Store, "google_connections", bson.M{"_id": id})
		if err != nil && err != mongo.ErrNoDocuments {
			return err
		}
		if err == nil && old.Email != "" && !strings.EqualFold(old.Email, email) {
			n, err := a.googleOutstanding(ctx, id)
			if err != nil {
				return err
			}
			if n > 0 {
				return domain.Fail(409, "google_account_conflict", "Reconnect the original Google account while meetings need synchronization.")
			}
		}
		connection.Revision = old.Revision + 1
		if _, err = a.Store.C("google_connections").ReplaceOne(ctx, bson.M{"_id": id}, connection, options.Replace().SetUpsert(true)); err != nil {
			return err
		}
		return a.audit(ctx, id, "google.connected", id)
	})
	if e != nil {
		redirect("account_conflict")
		return
	}
	redirect("connected")
}
func (a *App) googleAccess(ctx context.Context, id string) (string, error) {
	c, e := storage.One[googleConnection](ctx, a.Store, "google_connections", bson.M{"_id": id})
	if e != nil {
		if e != mongo.ErrNoDocuments {
			return "", e
		}
		return "", googlecalendar.Failure("google_reconnect_required", true, true)
	}
	if c.Status != "connected" {
		return "", googlecalendar.Failure("google_reconnect_required", true, true)
	}
	if c.ExpiresAt.After(a.Now()) {
		return a.Google.Decrypt(c.Access, id+":access")
	}
	refresh, e := a.Google.Decrypt(c.Refresh, id+":refresh")
	if e != nil {
		return "", e
	}
	tokens, e := a.Google.Refresh(ctx, refresh)
	if e != nil {
		a.googleRecordError(ctx, id, e)
		return "", e
	}
	access, e := a.Google.Encrypt(tokens.Access, id+":access")
	if e != nil {
		return "", e
	}
	if tokens.Refresh != "" {
		c.Refresh, e = a.Google.Encrypt(tokens.Refresh, id+":refresh")
		if e != nil {
			return "", e
		}
	}
	result, e := a.Store.C("google_connections").UpdateOne(ctx, bson.M{"_id": id, "generation": c.Generation, "revision": c.Revision, "status": "connected"}, bson.M{"$set": bson.M{"access": access, "refresh": c.Refresh, "expiresAt": a.Now().Add(time.Duration(tokens.Expires-30) * time.Second)}, "$inc": bson.M{"revision": 1}})
	if e != nil {
		return "", e
	}
	if result.ModifiedCount != 1 {
		return "", domain.Fail(409, "google_connection_changed", "Google connection changed. Retry the operation.")
	}
	return tokens.Access, nil
}
func (a *App) googleRecordError(ctx context.Context, id string, e error) {
	if googlecalendar.NeedsReconnect(e) {
		_, _ = a.Store.C("google_connections").UpdateOne(ctx, bson.M{"_id": id, "status": "connected"}, bson.M{"$set": bson.M{"status": "reconnect_required"}, "$inc": bson.M{"revision": 1}})
	}
}
func (a *App) googleStatus(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "mentor", "tutor") {
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	if a.Google == nil || user(r).Role == "tutor" && a.Config.MeetingProvider != "google" {
		a.json(w, 200, map[string]any{"enabled": false, "status": "unconfigured"})
		return
	}
	id := user(r).ID
	c, e := storage.One[googleConnection](r.Context(), a.Store, "google_connections", bson.M{"_id": id})
	if e == mongo.ErrNoDocuments {
		a.json(w, 200, map[string]any{"enabled": true, "status": "disconnected"})
		return
	}
	if e != nil {
		a.error(w, r, e)
		return
	}
	if c.Status == "connected" {
		access, err := a.googleAccess(r.Context(), id)
		if err == nil {
			err = a.Google.Probe(r.Context(), access)
		}
		if err != nil {
			a.googleRecordError(r.Context(), id, err)
			if googlecalendar.NeedsReconnect(err) {
				c.Status = "reconnect_required"
			} else {
				c.Status = "unavailable"
			}
		} else {
			c.CheckedAt = a.Now()
			_, _ = a.Store.C("google_connections").UpdateOne(r.Context(), bson.M{"_id": id, "generation": c.Generation, "status": "connected"}, bson.M{"$set": bson.M{"checkedAt": c.CheckedAt}})
		}
	}
	response := map[string]any{"enabled": true, "status": c.Status, "email": c.Email, "checkedAt": c.CheckedAt}
	if c.Status == "disconnected" {
		j, err := storage.One[job](r.Context(), a.Store, "outbox", bson.M{"kind": "google_revoke", "payload.mentorId": id, "status": bson.M{"$ne": "done"}})
		if err != nil && err != mongo.ErrNoDocuments {
			a.error(w, r, err)
			return
		}
		if err == nil {
			response["revocationStatus"] = j.Status
		}
	}
	a.json(w, 200, response)
}
func (a *App) googleDisconnect(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "mentor", "tutor") || !a.googleAvailable(w, r) {
		return
	}
	id := user(r).ID
	e := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		c, e := storage.One[googleConnection](ctx, a.Store, "google_connections", bson.M{"_id": id})
		if e == mongo.ErrNoDocuments {
			return nil
		}
		if e != nil {
			return e
		}
		if c.Status == "disconnected" {
			return nil
		}
		n, e := a.googleOutstanding(ctx, id)
		if e != nil {
			return e
		}
		if n > 0 {
			return domain.Fail(409, "google_interviews_active", "Cancel or finish your meetings and resolve synchronization before disconnecting.")
		}
		if c.Refresh != "" {
			if e = a.enqueue(ctx, "google-revoke:"+c.Generation, "google_revoke", bson.M{"mentorId": id, "encryptedRefresh": c.Refresh}, "pending"); e != nil {
				return e
			}
		}
		if _, e = a.Store.C("google_connections").UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"status": "disconnected", "email": ""}, "$unset": bson.M{"access": "", "refresh": ""}, "$inc": bson.M{"revision": 1}}); e != nil {
			return e
		}
		if _, e = a.Store.C("google_oauth_states").DeleteMany(ctx, bson.M{"_id": id}); e != nil {
			return e
		}
		return a.audit(ctx, id, "google.disconnected", id)
	})
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 200, map[string]bool{"ok": true})
}

func (a *App) retryGoogleRevocation(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "mentor", "tutor") || !a.googleAvailable(w, r) {
		return
	}
	id := user(r).ID
	e := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		result, e := a.Store.C("outbox").UpdateOne(ctx, bson.M{"kind": "google_revoke", "payload.mentorId": id, "status": "failed"}, bson.M{"$set": bson.M{"status": "pending", "attempts": 0, "availableAt": a.Now(), "lastError": ""}})
		if e != nil {
			return e
		}
		if result.ModifiedCount != 1 {
			return domain.Fail(409, "google_revocation_pending", "No failed Google revocation to retry.")
		}
		return a.audit(ctx, id, "google.revocation_retry", id)
	})
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 200, map[string]bool{"ok": true})
}
