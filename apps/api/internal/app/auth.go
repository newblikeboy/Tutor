package app

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"net"
	"net/http"
	"net/mail"
	"strings"
	"time"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/password"
	"tutorplatform/internal/storage"
	"unicode/utf8"
)

type identityKey struct{}
type Session struct {
	ID        string    `bson:"_id"`
	UserID    string    `bson:"userId"`
	Version   int       `bson:"version"`
	ExpiresAt time.Time `bson:"expiresAt"`
	CSRF      string    `bson:"csrf"`
	Method    string    `bson:"method"`
}
type credential struct {
	Email  string `bson:"_id"`
	UserID string `bson:"userId"`
	Hash   string `bson:"passwordHash"`
}

func token() string {
	b := make([]byte, 32)
	if _, e := rand.Read(b); e != nil {
		panic(e)
	}
	return hex.EncodeToString(b)
}
func digest(v string) string           { h := sha256.Sum256([]byte(v)); return hex.EncodeToString(h[:]) }
func user(r *http.Request) domain.User { return r.Context().Value(identityKey{}).(domain.User) }
func (a *App) rate(ctx context.Context, key string, limit int) error {
	now := a.Now()
	id := digest(key + fmt.Sprint(now.Unix()/60))
	var v struct {
		Count int `bson:"count"`
	}
	e := a.Store.C("rate_limits").FindOneAndUpdate(ctx, bson.M{"_id": id}, bson.M{"$inc": bson.M{"count": 1}, "$setOnInsert": bson.M{"expiresAt": now.Add(2 * time.Minute)}}, options.FindOneAndUpdate().SetUpsert(true).SetReturnDocument(options.After)).Decode(&v)
	if e != nil {
		return e
	}
	if v.Count > limit {
		return domain.Fail(429, "rate_limited", "Please wait a minute before trying again.")
	}
	return nil
}
func normalizeEmail(value string) (string, bool) {
	value = strings.ToLower(strings.TrimSpace(value))
	address, e := mail.ParseAddress(value)
	valid := e == nil && address.Address == value && len(value) <= 254 && !strings.ContainsAny(value, " \t\r\n") && strings.Contains(strings.SplitN(value, "@", 2)[1], ".")
	return value, valid
}
func (a *App) passwordAvailable(w http.ResponseWriter, r *http.Request) bool {
	if a.Config.AuthProvider != "password" {
		a.error(w, r, domain.Fail(503, "provider_unconfigured", "Account access is not enabled for this environment."))
		return false
	}
	return true
}
func (a *App) authLimit(r *http.Request, email, action string) error {
	ip := a.authClientIP(r)
	ipLimit, emailLimit := 40, 10
	if action == "signup" {
		ipLimit, emailLimit = 8, 3
	}
	if e := a.rate(r.Context(), "auth:"+action+":ip:"+ip, ipLimit); e != nil {
		return e
	}
	return a.rate(r.Context(), "auth:"+action+":email:"+email, emailLimit)
}

// Production only accepts traffic through a loopback proxy. Nginx overwrites
// X-Forwarded-For with $remote_addr; never accept a client-supplied address chain.
func (a *App) authClientIP(r *http.Request) string {
	host, _, _ := net.SplitHostPort(r.RemoteAddr)
	peer := net.ParseIP(host)
	if a.Config.Env == "production" && peer.IsLoopback() {
		if forwarded := net.ParseIP(strings.TrimSpace(r.Header.Get("X-Forwarded-For"))); forwarded != nil {
			return forwarded.String()
		}
	}
	return host
}

func (a *App) sessionMethod() string {
	if a.Config.Env == "production" {
		return "password-production"
	}
	return "password"
}

func (a *App) accountAccessError(u domain.User) error {
	if a.Config.Env != "production" {
		return nil
	}
	if u.Sample {
		return domain.Fail(401, "invalid_credentials", "Email or password is incorrect.")
	}
	if u.Role != "parent" && u.Role != "tutor" {
		return domain.Fail(503, "staff_auth_unavailable", "Staff sign-in is not enabled yet.")
	}
	return nil
}
func (a *App) passwordSlot(w http.ResponseWriter, r *http.Request) bool {
	select {
	case a.PasswordSlots <- struct{}{}:
		return true
	default:
		a.error(w, r, domain.Fail(503, "busy", "Please try again in a moment."))
		return false
	}
}
func (a *App) signup(w http.ResponseWriter, r *http.Request) {
	if !a.passwordAvailable(w, r) {
		return
	}
	var in struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
		Role     string `json:"role"`
		Adult    bool   `json:"adult"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	email, valid := normalizeEmail(in.Email)
	in.Name = strings.TrimSpace(in.Name)
	if !valid || utf8.RuneCountInString(in.Name) < 2 || utf8.RuneCountInString(in.Name) > 80 || !in.Adult || (in.Role != "parent" && in.Role != "tutor") {
		a.error(w, r, domain.Fail(422, "validation", "Enter your name, email, account type and adult confirmation."))
		return
	}
	if !password.Valid(in.Password) {
		a.error(w, r, domain.Fail(422, "weak_password", "Choose a less common password of 15 to 128 characters."))
		return
	}
	if e := a.authLimit(r, email, "signup"); e != nil {
		a.error(w, r, e)
		return
	}
	if !a.passwordSlot(w, r) {
		return
	}
	defer func() { <-a.PasswordSlots }()
	hash, e := password.Hash(in.Password)
	if e != nil {
		a.error(w, r, e)
		return
	}
	u := domain.User{ID: token(), Name: in.Name, Email: email, Role: in.Role, Sample: false}
	raw, csrf := token(), token()
	e = a.Store.Tx(r.Context(), func(ctx context.Context) error {
		if _, e := a.Store.C("credentials").InsertOne(ctx, credential{email, u.ID, hash}); e != nil {
			return e
		}
		if _, e := a.Store.C("users").InsertOne(ctx, u); e != nil {
			return e
		}
		return a.saveSession(ctx, r, u, raw, csrf)
	})
	if mongo.IsDuplicateKeyError(e) {
		e = domain.Fail(409, "signup_unavailable", "Unable to create an account with these details. Try signing in.")
	}
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.authResponse(w, u, raw, csrf, 201)
}
func (a *App) login(w http.ResponseWriter, r *http.Request) {
	if !a.passwordAvailable(w, r) {
		return
	}
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	email, valid := normalizeEmail(in.Email)
	if !valid || len(in.Password) == 0 || len(in.Password) > 512 {
		a.error(w, r, domain.Fail(401, "invalid_credentials", "Email or password is incorrect."))
		return
	}
	if e := a.authLimit(r, email, "login"); e != nil {
		a.error(w, r, e)
		return
	}
	c, e := storage.One[credential](r.Context(), a.Store, "credentials", bson.M{"_id": email})
	if e != nil && e != mongo.ErrNoDocuments {
		a.error(w, r, e)
		return
	}
	if !a.passwordSlot(w, r) {
		return
	}
	matched := password.Verify(c.Hash, in.Password)
	<-a.PasswordSlots
	if !matched {
		a.error(w, r, domain.Fail(401, "invalid_credentials", "Email or password is incorrect."))
		return
	}
	u, e := storage.One[domain.User](r.Context(), a.Store, "users", bson.M{"_id": c.UserID})
	if e != nil {
		a.error(w, r, domain.Fail(401, "invalid_credentials", "Email or password is incorrect."))
		return
	}
	raw, csrf := token(), token()
	e = a.Store.Tx(r.Context(), func(ctx context.Context) error {
		fresh, err := storage.One[credential](ctx, a.Store, "credentials", bson.M{"_id": email, "passwordHash": c.Hash})
		if err == mongo.ErrNoDocuments {
			return domain.Fail(401, "invalid_credentials", "Email or password is incorrect.")
		}
		if err != nil {
			return err
		}
		u, err = storage.One[domain.User](ctx, a.Store, "users", bson.M{"_id": fresh.UserID})
		if err != nil {
			return err
		}
		return a.saveSession(ctx, r, u, raw, csrf)
	})
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.authResponse(w, u, raw, csrf, 200)
}
func (a *App) saveSession(ctx context.Context, r *http.Request, u domain.User, raw, csrf string) error {
	if e := a.accountAccessError(u); e != nil {
		return e
	}
	if old, e := r.Cookie("session"); e == nil {
		if _, e = a.Store.C("sessions").DeleteOne(ctx, bson.M{"_id": digest(old.Value)}); e != nil {
			return e
		}
	}
	_, e := a.Store.C("sessions").InsertOne(ctx, Session{ID: digest(raw), UserID: u.ID, Version: u.AuthVersion, ExpiresAt: a.Now().Add(8 * time.Hour), CSRF: csrf, Method: a.sessionMethod()})
	return e
}
func (a *App) authResponse(w http.ResponseWriter, u domain.User, raw, csrf string, status int) {
	http.SetCookie(w, &http.Cookie{Name: "session", Value: raw, Path: "/", HttpOnly: true, Secure: a.Config.Env == "production", SameSite: http.SameSiteLaxMode, MaxAge: 28800})
	a.json(w, status, map[string]any{"user": u, "csrf": csrf})
}
func (a *App) authenticated(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !a.passwordAvailable(w, r) {
			return
		}
		cookie, e := r.Cookie("session")
		if e != nil {
			a.error(w, r, domain.Fail(401, "unauthenticated", "Please sign in to continue."))
			return
		}
		s, e := storage.One[Session](r.Context(), a.Store, "sessions", bson.M{"_id": digest(cookie.Value), "method": a.sessionMethod(), "expiresAt": bson.M{"$gt": a.Now()}})
		if e != nil {
			a.error(w, r, domain.Fail(401, "unauthenticated", "Your session has expired."))
			return
		}
		u, e := storage.One[domain.User](r.Context(), a.Store, "users", bson.M{"_id": s.UserID, "authVersion": s.Version})
		if e != nil {
			a.error(w, r, domain.Fail(401, "unauthenticated", "Please sign in again."))
			return
		}
		if r.Method != "GET" && r.Method != "HEAD" && !hmac.Equal([]byte(s.CSRF), []byte(r.Header.Get("X-CSRF-Token"))) {
			a.error(w, r, domain.Fail(403, "csrf", "Refresh the page and try again."))
			return
		}
		if e := a.accountAccessError(u); e != nil {
			a.error(w, r, e)
			return
		}
		if u.Role == "tutor" {
			app, er := storage.One[domain.Application](r.Context(), a.Store, "applications", bson.M{"_id": u.ID})
			if er != nil && er != mongo.ErrNoDocuments {
				a.error(w, r, er)
				return
			}
			if (er == mongo.ErrNoDocuments || app.Status != "approved" || !app.Scope.ExpiresAt.After(a.Now())) && !restrictedTutorRoute(r.URL.Path, u.ID) {
				a.error(w, r, domain.Fail(403, "tutor_restricted", "Teaching access is restricted. Check your application for the decision."))
				return
			}
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), identityKey{}, u)))
	})
}
func (a *App) me(w http.ResponseWriter, r *http.Request) {
	c, _ := r.Cookie("session")
	s, e := storage.One[Session](r.Context(), a.Store, "sessions", bson.M{"_id": digest(c.Value)})
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 200, map[string]any{"user": user(r), "csrf": s.CSRF})
}
func (a *App) sessionState(w http.ResponseWriter, r *http.Request) {
	if a.Config.AuthProvider != "password" {
		a.json(w, 200, nil)
		return
	}
	cookie, e := r.Cookie("session")
	if e != nil {
		a.json(w, 200, nil)
		return
	}
	s, e := storage.One[Session](r.Context(), a.Store, "sessions", bson.M{"_id": digest(cookie.Value), "method": a.sessionMethod(), "expiresAt": bson.M{"$gt": a.Now()}})
	if e == mongo.ErrNoDocuments {
		a.json(w, 200, nil)
		return
	}
	if e != nil {
		a.error(w, r, e)
		return
	}
	u, e := storage.One[domain.User](r.Context(), a.Store, "users", bson.M{"_id": s.UserID, "authVersion": s.Version})
	if e == mongo.ErrNoDocuments {
		a.json(w, 200, nil)
		return
	}
	if e != nil {
		a.error(w, r, e)
		return
	}
	if a.accountAccessError(u) != nil {
		a.json(w, 200, nil)
		return
	}
	a.json(w, 200, map[string]any{"user": u, "csrf": s.CSRF})
}
func (a *App) logout(w http.ResponseWriter, r *http.Request) {
	c, _ := r.Cookie("session")
	_, e := a.Store.C("sessions").DeleteOne(r.Context(), bson.M{"_id": digest(c.Value)})
	if e != nil {
		a.error(w, r, e)
		return
	}
	http.SetCookie(w, &http.Cookie{Name: "session", Value: "", Path: "/", MaxAge: -1, HttpOnly: true, Secure: a.Config.Env == "production", SameSite: http.SameSiteLaxMode})
	a.json(w, 200, map[string]bool{"ok": true})
}
func (a *App) role(w http.ResponseWriter, r *http.Request, roles ...string) bool {
	for _, v := range roles {
		if user(r).Role == v {
			return true
		}
	}
	a.error(w, r, domain.Fail(403, "forbidden", "Your role cannot perform this action."))
	return false
}
