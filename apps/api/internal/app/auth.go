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
	"math/big"
	"net"
	"net/http"
	"time"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
)

type identityKey struct{}
type Session struct {
	ID        string    `bson:"_id"`
	UserID    string    `bson:"userId"`
	Version   int       `bson:"version"`
	ExpiresAt time.Time `bson:"expiresAt"`
	CSRF      string    `bson:"csrf"`
}
type Challenge struct {
	ID        string    `bson:"_id"`
	UserID    string    `bson:"userId"`
	Hash      string    `bson:"hash"`
	Attempts  int       `bson:"attempts"`
	ExpiresAt time.Time `bson:"expiresAt"`
	Used      bool      `bson:"used"`
}

func token() string {
	b := make([]byte, 32)
	if _, e := rand.Read(b); e != nil {
		panic(e)
	}
	return hex.EncodeToString(b)
}
func digest(v string) string { h := sha256.Sum256([]byte(v)); return hex.EncodeToString(h[:]) }
func (a *App) otpHash(id, code string) string {
	h := hmac.New(sha256.New, []byte(a.Config.OTPSecret))
	h.Write([]byte(id + ":" + code))
	return hex.EncodeToString(h.Sum(nil))
}
func user(r *http.Request) domain.User { return r.Context().Value(identityKey{}).(domain.User) }
func (a *App) rate(ctx context.Context, key string, limit int) error {
	now := a.Now()
	window := now.Unix() / 60
	id := digest(key + fmt.Sprint(window))
	var v struct {
		Count int `bson:"count"`
	}
	e := a.Store.C("rate_limits").FindOneAndUpdate(ctx, bson.M{"_id": id}, bson.M{"$inc": bson.M{"count": 1}, "$setOnInsert": bson.M{"expiresAt": now.Add(2 * time.Minute)}}, options.FindOneAndUpdate().SetUpsert(true).SetReturnDocument(options.After)).Decode(&v)
	if e != nil {
		return e
	}
	if v.Count > limit {
		return domain.Fail(429, "rate_limited", "Please wait before trying again.")
	}
	return nil
}
func (a *App) challenge(w http.ResponseWriter, r *http.Request) {
	if a.Config.AuthProvider != "development" || a.Config.Env == "production" {
		a.error(w, r, domain.Fail(503, "provider_unconfigured", "Live authentication is not configured."))
		return
	}
	var in struct {
		Identity string `json:"identity"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	if len(in.Identity) > 64 {
		a.error(w, r, domain.Fail(422, "validation", "Choose a development identity."))
		return
	}
	ip, _, _ := net.SplitHostPort(r.RemoteAddr)
	if e := a.rate(r.Context(), "ip:"+ip, 20); e != nil {
		a.error(w, r, e)
		return
	}
	if e := a.rate(r.Context(), "identity:"+in.Identity, 3); e != nil {
		a.error(w, r, e)
		return
	}
	n, e := rand.Int(rand.Reader, big.NewInt(1000000))
	if e != nil {
		a.error(w, r, e)
		return
	}
	code := fmt.Sprintf("%06d", n)
	id := token()
	c := Challenge{ID: id, UserID: in.Identity, Hash: a.otpHash(id, code), ExpiresAt: a.Now().Add(5 * time.Minute)}
	if _, e = a.Store.C("challenges").InsertOne(r.Context(), c); e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 201, map[string]any{"challengeId": id, "developmentCode": code, "expiresIn": 300, "delivery": "development_only_no_sms"})
}
func (a *App) verify(w http.ResponseWriter, r *http.Request) {
	if a.Config.AuthProvider != "development" || a.Config.Env == "production" {
		a.error(w, r, domain.Fail(503, "provider_unconfigured", "Live authentication is not configured."))
		return
	}
	var in struct {
		ChallengeID string `json:"challengeId"`
		Code        string `json:"code"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	ctx := r.Context()
	now := a.Now()
	var c Challenge
	e := a.Store.C("challenges").FindOneAndUpdate(ctx, bson.M{"_id": in.ChallengeID, "used": false, "expiresAt": bson.M{"$gt": now}, "attempts": bson.M{"$lt": 5}}, bson.M{"$inc": bson.M{"attempts": 1}}, options.FindOneAndUpdate().SetReturnDocument(options.After)).Decode(&c)
	invalid := domain.Fail(401, "invalid_code", "The code is invalid, expired or already used.")
	if e != nil || !hmac.Equal([]byte(c.Hash), []byte(a.otpHash(c.ID, in.Code))) {
		a.error(w, r, invalid)
		return
	}
	raw := token()
	csrf := token()
	var u domain.User
	e = a.Store.Tx(ctx, func(ctx context.Context) error {
		var er error
		u, er = storage.One[domain.User](ctx, a.Store, "users", bson.M{"_id": c.UserID, "sample": true})
		if er != nil {
			return invalid
		}
		res, er := a.Store.C("challenges").UpdateOne(ctx, bson.M{"_id": c.ID, "used": false, "expiresAt": bson.M{"$gt": a.Now()}}, bson.M{"$set": bson.M{"used": true}})
		if er != nil {
			return er
		}
		if res.ModifiedCount != 1 {
			return invalid
		}
		if old, er := r.Cookie("session"); er == nil {
			if _, er = a.Store.C("sessions").DeleteOne(ctx, bson.M{"_id": digest(old.Value)}); er != nil {
				return er
			}
		}
		_, er = a.Store.C("sessions").InsertOne(ctx, Session{digest(raw), u.ID, u.AuthVersion, now.Add(8 * time.Hour), csrf})
		return er
	})
	if e != nil {
		a.error(w, r, e)
		return
	}
	http.SetCookie(w, &http.Cookie{Name: "session", Value: raw, Path: "/", HttpOnly: true, Secure: a.Config.Env == "production", SameSite: http.SameSiteLaxMode, MaxAge: 28800})
	a.json(w, 200, map[string]any{"user": u, "csrf": csrf})
}
func (a *App) authenticated(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if a.Config.Env == "production" {
			a.error(w, r, domain.Fail(503, "provider_unconfigured", "Live authentication and staff MFA require operator review."))
			return
		}
		cookie, e := r.Cookie("session")
		if e != nil {
			a.error(w, r, domain.Fail(401, "unauthenticated", "Please sign in to continue."))
			return
		}
		s, e := storage.One[Session](r.Context(), a.Store, "sessions", bson.M{"_id": digest(cookie.Value), "expiresAt": bson.M{"$gt": a.Now()}})
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

// Anonymous browsing is an ordinary state, not a failing network request.
func (a *App) sessionState(w http.ResponseWriter, r *http.Request) {
	if a.Config.Env == "production" {
		a.json(w, 200, nil)
		return
	}
	cookie, e := r.Cookie("session")
	if e != nil {
		a.json(w, 200, nil)
		return
	}
	s, e := storage.One[Session](r.Context(), a.Store, "sessions", bson.M{"_id": digest(cookie.Value), "expiresAt": bson.M{"$gt": a.Now()}})
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
