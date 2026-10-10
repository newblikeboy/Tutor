package app

import (
	"context"
	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"net/http"
	"net/url"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
)

func (a *App) emailDeliveries(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "admin") {
		return
	}
	page, err := pageRecords[job](r.Context(), a.Store, "outbox", bson.M{"kind": "email"}, r.URL.Query().Get("cursor"))
	if err != nil {
		a.error(w, r, err)
		return
	}
	items := []map[string]any{}
	for _, j := range page.Items {
		items = append(items, map[string]any{"id": j.ID, "event": j.Payload["event"], "recipientId": j.Payload["recipientId"], "status": j.Status, "attempts": j.Attempts, "lastError": j.LastError, "availableAt": j.AvailableAt, "smtpAcceptedAt": j.SMTPAcceptedAt})
	}
	a.json(w, 200, map[string]any{"items": items, "nextCursor": page.NextCursor})
}

func (a *App) retryEmail(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "admin") {
		return
	}
	if !a.mailAvailable(w, r) {
		return
	}
	var in struct {
		Reason               string `json:"reason"`
		AcknowledgeDuplicate bool   `json:"acknowledgeDuplicate"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	if !validText(in.Reason, 10, 1000) {
		a.error(w, r, domain.Fail(422, "validation", "Record why this email should be retried."))
		return
	}
	id, err := url.PathUnescape(chi.URLParam(r, "id"))
	if err != nil {
		a.error(w, r, domain.Fail(422, "validation", "Check the delivery identifier."))
		return
	}
	err = a.Store.Tx(r.Context(), func(ctx context.Context) error {
		j, err := storage.One[job](ctx, a.Store, "outbox", bson.M{"_id": id, "kind": "email"})
		if err != nil {
			return err
		}
		if !enum(j.Status, "failed", "uncertain") || j.SMTPAcceptedAt != nil {
			return domain.Fail(409, "invalid_transition", "Only failed or uncertain submissions can be reviewed for retry.")
		}
		if j.Payload["event"] == "auth_code" {
			return domain.Fail(409, "invalid_transition", "Request a fresh email code from the sign-in or verification page.")
		}
		if j.Status == "uncertain" && !in.AcknowledgeDuplicate {
			return domain.Fail(422, "validation", "An uncertain submission may already have arrived. Acknowledge the duplicate risk before retrying.")
		}
		result, err := a.Store.C("outbox").UpdateOne(ctx, bson.M{"_id": id, "status": j.Status}, bson.M{"$set": bson.M{"status": "pending", "attempts": 0, "availableAt": a.Now(), "smtpSubmissionStarted": false, "retryReason": clean(in.Reason), "retryActor": user(r).ID}, "$inc": bson.M{"operatorRetries": 1}})
		if err != nil {
			return err
		}
		if result.MatchedCount != 1 {
			return domain.Fail(409, "stale_version", "This delivery changed. Refresh before retrying.")
		}
		return a.audit(ctx, user(r).ID, "email.retry_requested", id)
	})
	if err != nil {
		a.error(w, r, err)
		return
	}
	a.json(w, 200, map[string]bool{"ok": true})
}
