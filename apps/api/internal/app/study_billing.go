package app

import (
	"context"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/payments"
	"tutorplatform/internal/storage"
)

func (a *App) createStudyPayment(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "parent") {
		return
	}
	simulation := a.Config.PaymentProvider == "simulation"
	if !simulation && !a.paymentEnabled(w, r) {
		return
	}
	var in struct{}
	if !a.decode(w, r, &in) {
		return
	}
	owner, learner := user(r).ID, chi.URLParam(r, "id")
	if err := a.rate(r.Context(), "study-payment:"+owner, 12); err != nil {
		a.error(w, r, err)
		return
	}
	var intent domain.PaymentIntent
	fresh, id := false, token()[:32]
	err := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		fresh = false
		if _, err := a.referenceLearner(ctx, owner, learner); err != nil {
			return err
		}
		if _, err := a.studyStudent(ctx, owner, learner); err != nil {
			return err
		}
		prior, fp, err := a.receipt(ctx, "study-payment:"+owner, r.Header.Get("Idempotency-Key"), map[string]string{"learner": learner})
		if err != nil {
			return err
		}
		if prior != "" {
			intent, err = storage.One[domain.PaymentIntent](ctx, a.Store, "payment_intents", bson.M{"_id": prior, "ownerId": owner})
			return err
		}
		access, err := a.lockStudyAccess(ctx, owner, learner)
		if err != nil {
			return err
		}
		_, active, err := a.studyEntitlement(ctx, owner, learner)
		if err != nil {
			return err
		}
		if active {
			return domain.Fail(409, "study_already_active", "This student's subscription is active. Renew after it expires.")
		}
		if access.IntentID != "" {
			pending, err := storage.One[domain.PaymentIntent](ctx, a.Store, "payment_intents", bson.M{"_id": access.IntentID, "ownerId": owner})
			if err != nil {
				return err
			}
			// Reuse the same order, including failed checkout attempts: a new key or
			// tab must never create another potentially chargeable order.
			if pending.PaymentID == "" {
				if (pending.Provider == "simulation") != simulation {
					return domain.Fail(409, "provider_changed", "The existing checkout uses another provider. Contact support before paying again.")
				}
				if pending.State == "payment_failed" && pending.OrderID != "" {
					if _, err = a.Store.C("payment_intents").UpdateOne(ctx, bson.M{"_id": pending.ID, "paymentId": ""}, bson.M{"$set": bson.M{"state": "created"}}); err != nil {
						return err
					}
					pending.State = "created"
				}
				intent = pending
				return a.saveReceipt(ctx, "study-payment:"+owner, r.Header.Get("Idempotency-Key"), fp, intent.ID)
			}
		}
		intent = domain.PaymentIntent{ID: id, OwnerID: owner, Purpose: "study_subscription", LearnerID: learner, Amount: domain.StudyPricePaise, Currency: "INR", State: "creating", Provider: "razorpay", CreatedAt: a.Now()}
		if simulation {
			intent.Provider = "simulation"
			intent.OrderID = "sim_order_" + id
			intent.State = "created"
		}
		if _, err = a.Store.C("payment_intents").InsertOne(ctx, intent); err != nil {
			return err
		}
		if _, err = a.Store.C("study_access").UpdateOne(ctx, bson.M{"_id": learner}, bson.M{"$set": bson.M{"intentId": id}}); err != nil {
			return err
		}
		if err = a.saveReceipt(ctx, "study-payment:"+owner, r.Header.Get("Idempotency-Key"), fp, id); err != nil {
			return err
		}
		fresh = true
		return a.audit(ctx, owner, "study.payment_created", id)
	})
	if err != nil {
		a.error(w, r, err)
		return
	}
	if fresh && !simulation {
		order, err := a.Payments.CreateOrder(r.Context(), intent.Amount, intent.ID)
		if err != nil {
			if _, err = a.Store.C("payment_intents").UpdateOne(r.Context(), bson.M{"_id": intent.ID, "state": "creating"}, bson.M{"$set": bson.M{"state": "reconciliation_required"}}); err != nil {
				a.error(w, r, err)
				return
			}
			intent.State = "reconciliation_required"
		} else {
			if err = a.attachOrder(r.Context(), intent, order); err != nil {
				a.error(w, r, err)
				return
			}
			intent.OrderID, intent.State = order.ID, "created"
		}
	}
	a.json(w, 200, map[string]any{"intent": intent, "keyId": a.Config.RazorpayKeyID, "sandbox": a.Config.Env != "production"})
}

// Runs inside the same transaction as the capture. Provider proof is validated
// by recordCaptured before dispatch; client flags never create an entitlement.
func (a *App) captureStudy(ctx context.Context, v domain.PaymentIntent, p payments.Payment) error {
	if v.Amount != domain.StudyPricePaise || v.LearnerID == "" {
		return domain.Fail(409, "provider_mismatch", "This payment does not match a study subscription.")
	}
	if _, err := a.referenceLearner(ctx, v.OwnerID, v.LearnerID); err != nil {
		return err
	}
	access, err := a.lockStudyAccess(ctx, v.OwnerID, v.LearnerID)
	if err != nil {
		return err
	}
	start := a.Now()
	// A late capture never shortens a paid period. Normally there is exactly
	// one resumable order per expired student; retries use the same intent.
	if access.ExpiresAt.After(start) && access.Simulated == p.Simulated {
		start = access.ExpiresAt
	}
	access.StartsAt, access.ExpiresAt, access.Simulated = a.Now(), studyMonthEnd(start), p.Simulated
	access.IntentID = v.ID
	if _, err = a.Store.C("study_access").ReplaceOne(ctx, bson.M{"_id": access.ID}, access); err != nil {
		return err
	}
	now := a.Now()
	v.State, v.PaymentID, v.CapturedAt, v.AccessUntil = "captured", p.ID, &now, &access.ExpiresAt
	if _, err = a.Store.C("payment_intents").ReplaceOne(ctx, bson.M{"_id": v.ID}, v); err != nil {
		return err
	}
	if !p.Simulated {
		entry := domain.LedgerEntry{ID: "capture:" + p.ID, OwnerID: v.OwnerID, IntentID: v.ID, Amount: v.Amount, Debit: "gateway_receivable", Credit: "study_subscriptions", Reference: p.ID, CreatedAt: now}
		if _, err = a.Store.C("ledger").InsertOne(ctx, entry); err != nil {
			return err
		}
	}
	event := "study.subscription_activated"
	if p.Simulated {
		event = "study.test_subscription_activated"
	}
	return a.audit(ctx, v.OwnerID, event, v.ID)
}

func (a *App) refundStudyAccess(ctx context.Context, v domain.PaymentIntent) error {
	// A processed refund revokes the period it paid for, including partial
	// refunds; an older refunded period cannot revoke a later renewal.
	_, err := a.Store.C("study_access").UpdateOne(ctx, bson.M{"_id": v.LearnerID, "intentId": v.ID}, bson.M{"$set": bson.M{"expiresAt": a.Now().Add(-time.Second)}, "$inc": bson.M{"version": 1}})
	return err
}
