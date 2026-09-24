package app

import (
	"context"
	"fmt"
	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"net/http"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
)

func (a *App) chronologicalID() string {
	return fmt.Sprintf("%020d_%s", a.Now().UnixNano(), token()[:20])
}
func (a *App) messages(w http.ResponseWriter, r *http.Request) {
	v, e := a.tuitionAccess(r.Context(), user(r), chi.URLParam(r, "id"))
	if e != nil {
		a.error(w, r, e)
		return
	}
	p, e := pageRecords[domain.Message](r.Context(), a.Store, "messages", bson.M{"enrollmentId": v.ID}, r.URL.Query().Get("cursor"))
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 200, p)
}
func (a *App) sendMessage(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Body string `json:"body"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	if !validText(in.Body, 1, 3000) {
		a.error(w, r, domain.Fail(422, "validation", "Write a message of at most 3000 characters."))
		return
	}
	u := user(r)
	if e := a.rate(r.Context(), "message:"+u.ID, 20); e != nil {
		a.error(w, r, e)
		return
	}
	id := a.chronologicalID()
	var message domain.Message
	e := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		v, er := a.tuitionAccess(ctx, u, chi.URLParam(r, "id"))
		if er != nil {
			return er
		}
		prior, fp, er := a.receipt(ctx, "message:"+u.ID, r.Header.Get("Idempotency-Key"), map[string]any{"enrollment": v.ID, "body": in.Body})
		if er != nil {
			return er
		}
		if prior != "" {
			message, er = storage.One[domain.Message](ctx, a.Store, "messages", bson.M{"_id": prior, "enrollmentId": v.ID})
			return er
		}
		if !enum(v.Status, "active", "paused", "pending_agreement", "awaiting_payment") {
			return domain.Fail(409, "invalid_transition", "This learning arrangement is closed for new messages.")
		}
		if _, er = a.Store.C("enrollments").UpdateOne(ctx, bson.M{"_id": v.ID}, bson.M{"$inc": bson.M{"version": 1}}); er != nil {
			return er
		}
		message = domain.Message{ID: id, EnrollmentID: v.ID, AuthorID: u.ID, AuthorName: u.Name, AuthorRole: u.Role, Body: clean(in.Body), CreatedAt: a.Now()}
		if _, er = a.Store.C("messages").InsertOne(ctx, message); er != nil {
			return er
		}
		seen := map[string]bool{u.ID: true}
		for _, recipient := range []string{v.OwnerID, v.TutorID, v.MentorID} {
			if recipient != "" && !seen[recipient] {
				seen[recipient] = true
				n := domain.Notification{ID: id + ":" + recipient, OwnerID: recipient, Kind: "conversation_message", TargetID: v.ID, CreatedAt: a.Now()}
				if _, er = a.Store.C("notifications").InsertOne(ctx, n); er != nil {
					return er
				}
			}
		}
		if er = a.saveReceipt(ctx, "message:"+u.ID, r.Header.Get("Idempotency-Key"), fp, id); er != nil {
			return er
		}
		return a.audit(ctx, u.ID, "conversation.message_sent", id)
	})
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 201, message)
}
func (a *App) notifications(w http.ResponseWriter, r *http.Request) {
	p, e := pageRecords[domain.Notification](r.Context(), a.Store, "notifications", bson.M{"ownerId": user(r).ID}, r.URL.Query().Get("cursor"))
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 200, p)
}
func (a *App) readNotification(w http.ResponseWriter, r *http.Request) {
	result, e := a.Store.C("notifications").UpdateOne(r.Context(), bson.M{"_id": chi.URLParam(r, "id"), "ownerId": user(r).ID}, bson.M{"$set": bson.M{"read": true}})
	if e != nil {
		a.error(w, r, e)
		return
	}
	if result.MatchedCount != 1 {
		a.error(w, r, domain.Fail(404, "not_found", "Notification unavailable."))
		return
	}
	a.json(w, 200, map[string]bool{"ok": true})
}
