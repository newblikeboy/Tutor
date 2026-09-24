package app

import (
	"context"
	"errors"
	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"net/http"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/payments"
	"tutorplatform/internal/storage"
)

func (a *App) paymentEnabled(w http.ResponseWriter, r *http.Request) bool {
	if a.Payments == nil {
		a.error(w, r, domain.Fail(503, "provider_unconfigured", "Razorpay sandbox credentials are not configured."))
		return false
	}
	return true
}
func (a *App) billingFilter(u domain.User) bson.M {
	if enum(u.Role, "finance", "admin") {
		return bson.M{}
	}
	return bson.M{"ownerId": u.ID}
}
func (a *App) billing(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "parent", "finance", "admin") {
		return
	}
	p, e := pageRecords[domain.PaymentIntent](r.Context(), a.Store, "payment_intents", a.billingFilter(user(r)), r.URL.Query().Get("cursor"))
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 200, p)
}
func (a *App) billingDetail(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "parent", "finance", "admin") {
		return
	}
	f := a.billingFilter(user(r))
	f["_id"] = chi.URLParam(r, "id")
	v, e := storage.One[domain.PaymentIntent](r.Context(), a.Store, "payment_intents", f)
	if e != nil {
		a.error(w, r, e)
		return
	}
	refunds, e := storage.Many[domain.RefundRequest](r.Context(), a.Store, "refunds", bson.M{"intentId": v.ID})
	if e != nil {
		a.error(w, r, e)
		return
	}
	ledger, e := storage.Many[domain.LedgerEntry](r.Context(), a.Store, "ledger", bson.M{"intentId": v.ID})
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 200, map[string]any{"intent": v, "refunds": refunds, "ledger": ledger, "sandbox": a.Config.Env != "production"})
}
func (a *App) createPayment(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "parent") || !a.paymentEnabled(w, r) {
		return
	}
	var in struct {
		Retry bool `json:"retry"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	u := user(r)
	id := token()[:32]
	fresh := false
	var intent domain.PaymentIntent
	e := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		fresh = false
		prior, fp, er := a.receipt(ctx, "payment:"+u.ID, r.Header.Get("Idempotency-Key"), map[string]any{"enrollment": chi.URLParam(r, "id"), "retry": in.Retry})
		if er != nil {
			return er
		}
		if prior != "" {
			intent, er = storage.One[domain.PaymentIntent](ctx, a.Store, "payment_intents", bson.M{"_id": prior, "ownerId": u.ID})
			return er
		}
		v, er := a.tuitionAccess(ctx, u, chi.URLParam(r, "id"))
		if er != nil {
			return er
		}
		if v.Status != "awaiting_payment" || v.HoldUntil == nil || !v.HoldUntil.After(a.Now()) || v.Agreement.TotalPaise < 100 {
			return domain.Fail(409, "hold_expired", "A current payable agreement and active reservation are required.")
		}
		if v.PaymentIntentID != "" {
			intent, er = storage.One[domain.PaymentIntent](ctx, a.Store, "payment_intents", bson.M{"_id": v.PaymentIntentID})
			if er != nil {
				return er
			}
			if intent.State != "payment_failed" || !in.Retry {
				return a.saveReceipt(ctx, "payment:"+u.ID, r.Header.Get("Idempotency-Key"), fp, intent.ID)
			}
		}
		intent = domain.PaymentIntent{ID: id, OwnerID: u.ID, EnrollmentID: v.ID, Amount: v.Agreement.TotalPaise, Currency: "INR", State: "creating", CreatedAt: a.Now()}
		if _, er = a.Store.C("payment_intents").InsertOne(ctx, intent); er != nil {
			return er
		}
		if _, er = a.Store.C("enrollments").UpdateOne(ctx, bson.M{"_id": v.ID}, bson.M{"$set": bson.M{"paymentIntentId": id}, "$inc": bson.M{"version": 1}}); er != nil {
			return er
		}
		if er = a.saveReceipt(ctx, "payment:"+u.ID, r.Header.Get("Idempotency-Key"), fp, id); er != nil {
			return er
		}
		fresh = true
		return a.audit(ctx, u.ID, "payment.order_requested", id)
	})
	if e != nil {
		a.error(w, r, e)
		return
	}
	// Provider calls never run inside a retryable MongoDB transaction.
	if fresh {
		order, providerErr := a.Payments.CreateOrder(r.Context(), intent.Amount, intent.ID)
		if providerErr != nil {
			_, e = a.Store.C("payment_intents").UpdateOne(r.Context(), bson.M{"_id": intent.ID, "state": "creating"}, bson.M{"$set": bson.M{"state": "reconciliation_required"}})
			if e != nil {
				a.error(w, r, e)
				return
			}
			intent.State = "reconciliation_required"
		} else {
			if e = a.attachOrder(r.Context(), intent, order); e != nil {
				a.error(w, r, e)
				return
			}
			intent.OrderID = order.ID
			intent.State = "created"
		}
	}
	a.json(w, 200, map[string]any{"intent": intent, "keyId": a.Config.RazorpayKeyID, "sandbox": a.Config.Env != "production"})
}
func (a *App) attachOrder(ctx context.Context, v domain.PaymentIntent, order payments.Order) error {
	if order.ID == "" || order.Receipt != v.ID || order.Amount != v.Amount || order.Currency != "INR" {
		return domain.Fail(409, "provider_mismatch", "Provider order does not match the saved agreement.")
	}
	_, e := a.Store.C("payment_intents").UpdateOne(ctx, bson.M{"_id": v.ID, "state": bson.M{"$in": []string{"creating", "reconciliation_required"}}}, bson.M{"$set": bson.M{"orderId": order.ID, "state": "created"}})
	return e
}
func (a *App) verifyPayment(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "parent") || !a.paymentEnabled(w, r) {
		return
	}
	var in struct {
		PaymentID string `json:"paymentId"`
		Signature string `json:"signature"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	v, e := storage.One[domain.PaymentIntent](r.Context(), a.Store, "payment_intents", bson.M{"_id": chi.URLParam(r, "id"), "ownerId": user(r).ID})
	if e != nil {
		a.error(w, r, e)
		return
	}
	if !payments.VerifyCheckout(a.Config.RazorpaySecret, v.OrderID, in.PaymentID, in.Signature) {
		a.error(w, r, domain.Fail(422, "signature", "Payment confirmation could not be verified."))
		return
	}
	p, e := a.Payments.FetchPayment(r.Context(), in.PaymentID)
	if e == nil {
		e = a.applyCaptured(r.Context(), v.ID, p)
	}
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 200, map[string]bool{"ok": true})
}
func (a *App) applyCaptured(ctx context.Context, id string, p payments.Payment) error {
	if p.Status != "captured" || !p.Captured {
		return domain.Fail(409, "payment_pending", "Payment has not been captured by the provider.")
	}
	e := a.recordCaptured(ctx, id, p, false)
	var f *domain.Fault
	if errors.As(e, &f) && enum(f.Code, "capacity", "schedule_conflict") {
		// The first transaction rolled back all promotions. Persist the capture
		// and refund-review task even when capacity changed during the hold.
		return a.recordCaptured(ctx, id, p, true)
	}
	return e
}
func (a *App) recordCaptured(ctx context.Context, id string, p payments.Payment, forceReview bool) error {
	return a.Store.Tx(ctx, func(ctx context.Context) error {
		v, e := storage.One[domain.PaymentIntent](ctx, a.Store, "payment_intents", bson.M{"_id": id})
		if e != nil {
			return e
		}
		if v.OrderID != p.OrderID || v.Amount != p.Amount || v.Currency != p.Currency || p.ID == "" {
			return domain.Fail(409, "provider_mismatch", "Payment does not match its order and amount.")
		}
		if v.PaymentID != "" {
			if v.PaymentID == p.ID {
				return nil
			}
			return domain.Fail(409, "duplicate_payment", "Another captured payment needs reconciliation.")
		}
		enrollment, e := storage.One[domain.Enrollment](ctx, a.Store, "enrollments", bson.M{"_id": v.EnrollmentID})
		if e != nil {
			return e
		}
		if _, e = a.Store.C("enrollments").UpdateOne(ctx, bson.M{"_id": enrollment.ID}, bson.M{"$inc": bson.M{"version": 1}}); e != nil {
			return e
		}
		v.PaymentID = p.ID
		v.State = "captured"
		usable := !forceReview && enrollment.Status == "awaiting_payment" && enrollment.HoldUntil != nil && enrollment.HoldUntil.After(a.Now()) && enrollment.PaymentIntentID == v.ID && p.AmountRefunded == 0
		if usable {
			app, av, er := a.lockOffering(ctx, enrollment.TutorID, enrollment.Class)
			if er != nil {
				var f *domain.Fault
				if errors.As(er, &f) || errors.Is(er, mongo.ErrNoDocuments) {
					usable = false
				} else {
					return er
				}
			}
			if usable {
				classes, er := storage.Many[domain.ClassSession](ctx, a.Store, "classes", bson.M{"enrollmentId": enrollment.ID})
				if er != nil {
					return er
				}
				for _, s := range classes {
					if s.Status != "held" || !s.Start.After(a.Now()) || s.End.After(app.Scope.ExpiresAt) || !available(av, s.Start, s.End) {
						usable = false
						break
					}
				}
				if usable {
					for _, s := range classes {
						// Existing live holds already reserve capacity. Promote their expiry only.
						if er = a.reserveClass(ctx, enrollment, s, av, nil, false); er != nil {
							return er
						}
						if _, er = a.Store.C("classes").UpdateOne(ctx, bson.M{"_id": s.ID}, bson.M{"$set": bson.M{"status": "scheduled"}, "$inc": bson.M{"version": 1}}); er != nil {
							return er
						}
					}
				}
			}
		}
		if usable {
			if _, e = a.Store.C("enrollments").UpdateOne(ctx, bson.M{"_id": enrollment.ID}, bson.M{"$set": bson.M{"status": "active", "holdUntil": nil}}); e != nil {
				return e
			}
		} else {
			v.State = "refund_review"
			if enrollment.Status == "awaiting_payment" {
				if e = a.expireEnrollment(ctx, enrollment); e != nil {
					return e
				}
			}
			if e = a.enqueue(ctx, "late-payment:"+v.ID, "payment_operator_review", bson.M{"intentId": v.ID}, "pending_operator"); e != nil {
				return e
			}
		}
		if _, e = a.Store.C("payment_intents").ReplaceOne(ctx, bson.M{"_id": v.ID}, v); e != nil {
			return e
		}
		entry := domain.LedgerEntry{ID: "capture:" + p.ID, OwnerID: v.OwnerID, IntentID: v.ID, Amount: v.Amount, Debit: "gateway_receivable", Credit: "family_prepaid", Reference: p.ID, CreatedAt: a.Now()}
		if _, e = a.Store.C("ledger").InsertOne(ctx, entry); e != nil {
			return e
		}
		return a.audit(ctx, "razorpay", "payment."+v.State, v.ID)
	})
}
func (a *App) expireEnrollment(ctx context.Context, v domain.Enrollment) error {
	classes, e := storage.Many[domain.ClassSession](ctx, a.Store, "classes", bson.M{"enrollmentId": v.ID, "status": "held"})
	if e != nil {
		return e
	}
	av := defaultAvailability(v.TutorID)
	for _, s := range classes {
		if e = a.reserveClass(ctx, v, s, av, nil, true); e != nil {
			return e
		}
		if _, e = a.Store.C("classes").UpdateOne(ctx, bson.M{"_id": s.ID}, bson.M{"$set": bson.M{"status": "cancelled"}, "$inc": bson.M{"version": 1}}); e != nil {
			return e
		}
	}
	_, e = a.Store.C("enrollments").UpdateOne(ctx, bson.M{"_id": v.ID}, bson.M{"$set": bson.M{"status": "expired", "holdUntil": nil}, "$inc": bson.M{"version": 1}})
	return e
}
func (a *App) reconcilePayment(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "finance", "admin") || !a.paymentEnabled(w, r) {
		return
	}
	v, e := storage.One[domain.PaymentIntent](r.Context(), a.Store, "payment_intents", bson.M{"_id": chi.URLParam(r, "id")})
	if e != nil {
		a.error(w, r, e)
		return
	}
	if v.OrderID == "" {
		orders, er := a.Payments.OrdersByReceipt(r.Context(), v.ID)
		if er != nil {
			a.error(w, r, er)
			return
		}
		matching := []payments.Order{}
		for _, o := range orders {
			if o.Receipt == v.ID {
				matching = append(matching, o)
			}
		}
		if len(matching) != 1 {
			a.error(w, r, domain.Fail(409, "reconciliation_required", "No unique provider order found. Do not recreate an ambiguous charge."))
			return
		}
		if e = a.attachOrder(r.Context(), v, matching[0]); e != nil {
			a.error(w, r, e)
			return
		}
	}
	a.json(w, 200, map[string]bool{"ok": true})
}
func (a *App) requestRefund(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "parent", "finance", "admin") {
		return
	}
	var in struct {
		Amount int64  `json:"amountPaise"`
		Reason string `json:"reason"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	if in.Amount < 1 || !validText(in.Reason, 10, 1000) {
		a.error(w, r, domain.Fail(422, "validation", "Record an amount and refund reason."))
		return
	}
	u := user(r)
	id := token()[:32]
	var out domain.RefundRequest
	e := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		prior, fp, er := a.receipt(ctx, "refund:"+u.ID, r.Header.Get("Idempotency-Key"), map[string]any{"intent": chi.URLParam(r, "id"), "amount": in.Amount, "reason": in.Reason})
		if er != nil {
			return er
		}
		if prior != "" {
			out, er = storage.One[domain.RefundRequest](ctx, a.Store, "refunds", bson.M{"_id": prior})
			return er
		}
		f := a.billingFilter(u)
		f["_id"] = chi.URLParam(r, "id")
		v, er := storage.One[domain.PaymentIntent](ctx, a.Store, "payment_intents", f)
		if er != nil {
			return er
		}
		if v.PaymentID == "" || v.Amount-v.RefundReserved-v.Refunded < in.Amount {
			return domain.Fail(409, "refund_amount", "This amount exceeds the unreserved payment balance.")
		}
		out = domain.RefundRequest{ID: id, IntentID: v.ID, OwnerID: v.OwnerID, Amount: in.Amount, Reason: clean(in.Reason), Status: "requested", RequestedBy: u.ID, CreatedAt: a.Now()}
		if _, er = a.Store.C("refunds").InsertOne(ctx, out); er != nil {
			return er
		}
		if _, er = a.Store.C("payment_intents").UpdateOne(ctx, bson.M{"_id": v.ID}, bson.M{"$inc": bson.M{"refundReservedPaise": in.Amount}}); er != nil {
			return er
		}
		if er = a.saveReceipt(ctx, "refund:"+u.ID, r.Header.Get("Idempotency-Key"), fp, id); er != nil {
			return er
		}
		return a.audit(ctx, u.ID, "refund.requested", id)
	})
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 201, out)
}
func (a *App) refundAction(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "finance", "admin") {
		return
	}
	var in struct {
		Action string `json:"action"`
		Reason string `json:"reason"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	if !enum(in.Action, "approve", "reject") || !validText(in.Reason, 10, 1000) {
		a.error(w, r, domain.Fail(422, "validation", "Record a finance decision and reason."))
		return
	}
	if in.Action == "approve" && !a.paymentEnabled(w, r) {
		return
	}
	u := user(r)
	e := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		v, er := storage.One[domain.RefundRequest](ctx, a.Store, "refunds", bson.M{"_id": chi.URLParam(r, "id")})
		if er != nil {
			return er
		}
		if v.Status != "requested" || v.RequestedBy == u.ID {
			return domain.Fail(409, "invalid_transition", "A separate reviewer must decide an open refund request.")
		}
		v.Decision = clean(in.Reason)
		v.ReviewedBy = u.ID
		v.Status = "approved"
		if in.Action == "reject" {
			v.Status = "rejected"
			if _, er = a.Store.C("payment_intents").UpdateOne(ctx, bson.M{"_id": v.IntentID}, bson.M{"$inc": bson.M{"refundReservedPaise": -v.Amount}}); er != nil {
				return er
			}
		}
		if _, er = a.Store.C("refunds").ReplaceOne(ctx, bson.M{"_id": v.ID}, v); er != nil {
			return er
		}
		if in.Action == "approve" {
			if er = a.enqueue(ctx, "refund:"+v.ID, "razorpay_refund", bson.M{"refundId": v.ID}, "pending"); er != nil {
				return er
			}
		}
		return a.audit(ctx, u.ID, "refund."+v.Status, v.ID)
	})
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 200, map[string]bool{"ok": true})
}
func (a *App) applyRefund(ctx context.Context, requestID string, p payments.Refund) error {
	return a.Store.Tx(ctx, func(ctx context.Context) error {
		r, e := storage.One[domain.RefundRequest](ctx, a.Store, "refunds", bson.M{"_id": requestID})
		if e != nil {
			return e
		}
		v, e := storage.One[domain.PaymentIntent](ctx, a.Store, "payment_intents", bson.M{"_id": r.IntentID})
		if e != nil {
			return e
		}
		if p.ID == "" || p.PaymentID != v.PaymentID || p.Amount != r.Amount || p.Receipt != r.ID {
			return domain.Fail(409, "provider_mismatch", "Refund does not match the approved request.")
		}
		if r.Status == "processed" || r.Status == "failed" {
			return nil
		}
		if !enum(r.Status, "approved", "submitted") {
			return domain.Fail(409, "invalid_transition", "Refund was not approved.")
		}
		r.ProviderID = p.ID
		r.Status = "submitted"
		if p.Status == "failed" {
			r.Status = "failed"
			if _, e = a.Store.C("payment_intents").UpdateOne(ctx, bson.M{"_id": v.ID}, bson.M{"$inc": bson.M{"refundReservedPaise": -r.Amount}}); e != nil {
				return e
			}
		}
		if p.Status == "processed" {
			r.Status = "processed"
			if _, e = a.Store.C("payment_intents").UpdateOne(ctx, bson.M{"_id": v.ID}, bson.M{"$inc": bson.M{"refundReservedPaise": -r.Amount, "refundedPaise": r.Amount}}); e != nil {
				return e
			}
			entry := domain.LedgerEntry{ID: "refund:" + p.ID, OwnerID: v.OwnerID, IntentID: v.ID, Amount: r.Amount, Debit: "family_prepaid", Credit: "gateway_receivable", Reference: p.ID, CreatedAt: a.Now()}
			if _, e = a.Store.C("ledger").InsertOne(ctx, entry); e != nil {
				return e
			}
		}
		if _, e = a.Store.C("refunds").ReplaceOne(ctx, bson.M{"_id": r.ID}, r); e != nil {
			return e
		}
		return a.audit(ctx, "razorpay", "refund."+r.Status, r.ID)
	})
}

// Durable jobs contain references, never raw webhook bodies or card/learner data.
func (a *App) enqueue(ctx context.Context, id, kind string, payload bson.M, status string) error {
	_, e := a.Store.C("outbox").UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$setOnInsert": bson.M{"kind": kind, "payload": payload, "status": status, "attempts": 0, "availableAt": a.Now(), "createdAt": a.Now()}}, options.UpdateOne().SetUpsert(true))
	return e
}
