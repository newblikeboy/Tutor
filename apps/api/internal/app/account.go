package app

import (
	"context"
	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"net/http"
	"strings"
	"time"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/password"
	"tutorplatform/internal/storage"
	"unicode/utf8"
)

type accountPreferences struct {
	ID       string `json:"-" bson:"_id"`
	Language string `json:"language" bson:"language"`
	Version  int    `json:"version" bson:"version"`
}
type accountSession struct {
	ID        string    `json:"id"`
	Current   bool      `json:"current"`
	ExpiresAt time.Time `json:"expiresAt"`
}

func (a *App) account(w http.ResponseWriter, r *http.Request) {
	p := accountPreferences{ID: user(r).ID, Language: "en"}
	err := a.Store.C("preferences").FindOne(r.Context(), bson.M{"_id": user(r).ID}).Decode(&p)
	if err != nil && err != mongo.ErrNoDocuments {
		a.error(w, r, err)
		return
	}
	a.json(w, 200, map[string]any{"name": user(r).Name, "email": user(r).Email, "preferences": p})
}
func (a *App) saveAccount(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name     string `json:"name"`
		Language string `json:"language"`
		Version  int    `json:"version"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	if utf8.RuneCountInString(in.Name) < 2 || utf8.RuneCountInString(in.Name) > 80 || (in.Language != "en" && in.Language != "hi") || in.Version < 0 {
		a.error(w, r, domain.Fail(422, "validation", "Check your name and language."))
		return
	}
	e := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		p := accountPreferences{ID: user(r).ID}
		e := a.Store.C("preferences").FindOne(ctx, bson.M{"_id": user(r).ID}).Decode(&p)
		if e != nil && e != mongo.ErrNoDocuments {
			return e
		}
		if p.Version != in.Version {
			return domain.Fail(409, "stale_version", "Refresh these preferences before saving.")
		}
		p.Language = in.Language
		p.Version++
		if _, e = a.Store.C("preferences").ReplaceOne(ctx, bson.M{"_id": p.ID}, p, options.Replace().SetUpsert(true)); e != nil {
			return e
		}
		_, e = a.Store.C("users").UpdateOne(ctx, bson.M{"_id": user(r).ID}, bson.M{"$set": bson.M{"name": in.Name}})
		return e
	})
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 200, map[string]bool{"ok": true})
}
func (a *App) accountSessions(w http.ResponseWriter, r *http.Request) {
	c, _ := r.Cookie("session")
	page, e := pageRecords[Session](r.Context(), a.Store, "sessions", bson.M{"userId": user(r).ID, "version": user(r).AuthVersion, "method": a.sessionMethod(), "expiresAt": bson.M{"$gt": a.Now()}}, r.URL.Query().Get("cursor"))
	if e != nil {
		a.error(w, r, e)
		return
	}
	out := []accountSession{}
	for _, s := range page.Items {
		out = append(out, accountSession{ID: s.ID, Current: s.ID == digest(c.Value), ExpiresAt: s.ExpiresAt})
	}
	a.json(w, 200, map[string]any{"items": out, "nextCursor": page.NextCursor})
}
func (a *App) revokeAccountSession(w http.ResponseWriter, r *http.Request) {
	c, _ := r.Cookie("session")
	id := chi.URLParam(r, "id")
	if id == digest(c.Value) {
		a.error(w, r, domain.Fail(422, "validation", "Use sign out to end the current session."))
		return
	}
	result, e := a.Store.C("sessions").DeleteOne(r.Context(), bson.M{"_id": id, "userId": user(r).ID})
	if e != nil {
		a.error(w, r, e)
		return
	}
	if result.DeletedCount != 1 {
		a.error(w, r, domain.Fail(404, "not_found", "Session is unavailable."))
		return
	}
	a.json(w, 200, map[string]bool{"ok": true})
}
func (a *App) changePassword(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Current string `json:"currentPassword"`
		Next    string `json:"newPassword"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	if len(in.Current) > 512 || in.Current == in.Next || !password.Valid(in.Next) {
		a.error(w, r, domain.Fail(422, "weak_password", "Choose a different password of 8 to 128 characters."))
		return
	}
	if e := a.rate(r.Context(), "password-change:"+user(r).ID, 5); e != nil {
		a.error(w, r, e)
		return
	}
	if !a.passwordSlot(w, r) {
		return
	}
	defer func() { <-a.PasswordSlots }()
	c, e := storage.One[credential](r.Context(), a.Store, "credentials", bson.M{"userId": user(r).ID})
	if e != nil {
		a.error(w, r, e)
		return
	}
	if !password.Verify(c.Hash, in.Current) {
		a.error(w, r, domain.Fail(401, "invalid_credentials", "Current password is incorrect."))
		return
	}
	hash, e := password.Hash(in.Next)
	if e != nil {
		a.error(w, r, e)
		return
	}
	u := user(r)
	raw, csrf := token(), token()
	e = a.Store.Tx(r.Context(), func(ctx context.Context) error {
		result, e := a.Store.C("credentials").UpdateOne(ctx, bson.M{"_id": c.Email, "userId": u.ID, "passwordHash": c.Hash}, bson.M{"$set": bson.M{"passwordHash": hash}})
		if e != nil {
			return e
		}
		if result.MatchedCount != 1 {
			return domain.Fail(409, "stale_version", "Password has already changed. Sign in again.")
		}
		if e = a.Store.C("users").FindOneAndUpdate(ctx, bson.M{"_id": u.ID}, bson.M{"$inc": bson.M{"authVersion": 1}}, options.FindOneAndUpdate().SetReturnDocument(options.After)).Decode(&u); e != nil {
			return e
		}
		if _, e = a.Store.C("sessions").DeleteMany(ctx, bson.M{"userId": u.ID}); e != nil {
			return e
		}
		return a.saveSession(ctx, r, u, raw, csrf)
	})
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.authResponse(w, u, raw, csrf, 200)
}
