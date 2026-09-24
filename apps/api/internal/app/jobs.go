package app

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"io"
	"net/http"
	"time"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/meetings"
	"tutorplatform/internal/payments"
	"tutorplatform/internal/storage"
)

type job struct {
	ID                  string            `json:"id" bson:"_id"`
	Kind                string            `json:"kind" bson:"kind"`
	Status              string            `json:"status" bson:"status"`
	Attempts            int               `json:"attempts" bson:"attempts"`
	AvailableAt         time.Time         `json:"availableAt" bson:"availableAt"`
	LeaseUntil          time.Time         `json:"leaseUntil" bson:"leaseUntil"`
	LeaseOwner          string            `json:"-" bson:"leaseOwner"`
	Payload             map[string]string `json:"-" bson:"payload"`
	LastError           string            `json:"lastError" bson:"lastError"`
	ZoomCreateAttempted bool              `json:"-" bson:"zoomCreateAttempted"`
	ZoomMeetingID       string            `json:"-" bson:"zoomMeetingId"`
	ZoomJoinURL         string            `json:"-" bson:"zoomJoinUrl"`
}

func (a *App) razorpayWebhook(w http.ResponseWriter, r *http.Request) {
	if !a.paymentEnabled(w, r) {
		return
	}
	body, e := io.ReadAll(http.MaxBytesReader(w, r.Body, 128*1024))
	if e != nil {
		a.error(w, r, domain.Fail(413, "payload", "Webhook is too large."))
		return
	}
	if !payments.VerifySignature(a.Config.RazorpayWebhookSecret, body, r.Header.Get("X-Razorpay-Signature")) {
		a.error(w, r, domain.Fail(401, "signature", "Invalid webhook signature."))
		return
	}
	eventID := r.Header.Get("X-Razorpay-Event-Id")
	if len(eventID) < 1 || len(eventID) > 128 {
		a.error(w, r, domain.Fail(422, "validation", "A provider event identifier is required."))
		return
	}
	var event struct {
		Event   string `json:"event"`
		Payload struct {
			Payment struct {
				Entity struct {
					ID      string `json:"id"`
					OrderID string `json:"order_id"`
				} `json:"entity"`
			} `json:"payment"`
			Refund struct {
				Entity struct {
					ID      string `json:"id"`
					Receipt string `json:"receipt"`
				} `json:"entity"`
			} `json:"refund"`
		} `json:"payload"`
	}
	if e = json.Unmarshal(body, &event); e != nil {
		a.error(w, r, domain.Fail(422, "validation", "Malformed webhook event."))
		return
	}
	if !enum(event.Event, "payment.captured", "payment.failed", "refund.processed", "refund.failed") {
		a.json(w, 200, map[string]bool{"ok": true})
		return
	}
	id := "razorpay:" + digest(eventID)
	e = a.Store.Tx(r.Context(), func(ctx context.Context) error {
		var previous struct {
			Fingerprint string `bson:"fingerprint"`
		}
		er := a.Store.C("webhook_events").FindOne(ctx, bson.M{"_id": id}).Decode(&previous)
		if er == nil {
			if previous.Fingerprint != digest(string(body)) {
				return domain.Fail(409, "event_conflict", "Event identifier reused with different content.")
			}
			return nil
		}
		if !errors.Is(er, mongo.ErrNoDocuments) {
			return er
		}
		if _, er = a.Store.C("webhook_events").InsertOne(ctx, bson.M{"_id": id, "fingerprint": digest(string(body)), "kind": event.Event, "receivedAt": a.Now()}); er != nil {
			return er
		}
		return a.enqueue(ctx, id, "razorpay_event", bson.M{"event": event.Event, "paymentId": event.Payload.Payment.Entity.ID, "orderId": event.Payload.Payment.Entity.OrderID, "refundId": event.Payload.Refund.Entity.ID, "receipt": event.Payload.Refund.Entity.Receipt}, "pending")
	})
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 200, map[string]bool{"ok": true})
}
func (a *App) RunJobs(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			work, cancel := context.WithTimeout(ctx, 12*time.Second)
			_ = a.expireHolds(work)
			_ = a.runOneJob(work)
			cancel()
		}
	}
}
func (a *App) expireHolds(ctx context.Context) error {
	candidates, e := storage.Many[domain.Enrollment](ctx, a.Store, "enrollments", bson.M{"status": "awaiting_payment", "holdUntil": bson.M{"$lte": a.Now()}})
	if e != nil {
		return e
	}
	for _, item := range candidates {
		if e = a.Store.Tx(ctx, func(ctx context.Context) error {
			v, er := storage.One[domain.Enrollment](ctx, a.Store, "enrollments", bson.M{"_id": item.ID})
			if er != nil {
				return er
			}
			if v.Status != "awaiting_payment" || v.HoldUntil == nil || v.HoldUntil.After(a.Now()) {
				return nil
			}
			if er = a.expireEnrollment(ctx, v); er != nil {
				return er
			}
			return a.audit(ctx, "worker", "enrollment.hold_expired", v.ID)
		}); e != nil {
			return e
		}
	}
	return nil
}
func (a *App) runOneJob(ctx context.Context) error {
	kinds := []string{}
	if a.Meetings != nil {
		kinds = append(kinds, "zoom_meeting")
	}
	if a.Payments != nil {
		kinds = append(kinds, "razorpay_event", "razorpay_refund")
	}
	if (a.Files != nil || a.Videos != nil) && a.Scanner != nil {
		kinds = append(kinds, "file_scan")
	}
	if len(kinds) == 0 {
		return nil
	}
	owner := token()
	now := a.Now()
	var j job
	e := a.Store.C("outbox").FindOneAndUpdate(ctx, bson.M{"kind": bson.M{"$in": kinds}, "$or": []bson.M{{"status": "pending", "availableAt": bson.M{"$lte": now}}, {"status": "processing", "leaseUntil": bson.M{"$lte": now}}}}, bson.M{"$set": bson.M{"status": "processing", "leaseOwner": owner, "leaseUntil": now.Add(40 * time.Second)}, "$inc": bson.M{"attempts": 1}}, options.FindOneAndUpdate().SetSort(bson.D{{Key: "availableAt", Value: 1}}).SetReturnDocument(options.After)).Decode(&j)
	if errors.Is(e, mongo.ErrNoDocuments) {
		return nil
	}
	if e != nil {
		return e
	}
	e = a.processJob(ctx, j)
	status, last := "done", ""
	next := a.Now()
	if e != nil {
		status = "pending"
		last = "provider_or_record_unavailable"
		var f *domain.Fault
		if errors.As(e, &f) {
			last = f.Code
		}
		if j.Attempts >= 8 || j.Kind == "zoom_meeting" && meetings.Definitive(e) {
			status = "failed"
		}
		backoff := time.Second * time.Duration(1<<min(j.Attempts, 8))
		next = next.Add(backoff)
	}
	_, persistErr := a.Store.C("outbox").UpdateOne(ctx, bson.M{"_id": j.ID, "leaseOwner": owner}, bson.M{"$set": bson.M{"status": status, "lastError": last, "availableAt": next}, "$unset": bson.M{"leaseOwner": "", "leaseUntil": ""}})
	if persistErr == nil && j.Kind == "zoom_meeting" && status == "failed" {
		_, persistErr = a.Store.C("applications").UpdateOne(ctx, bson.M{"_id": j.Payload["applicationId"], "interview.jobId": j.ID}, bson.M{"$set": bson.M{"interview.syncStatus": "failed", "updatedAt": a.Now()}, "$inc": bson.M{"version": 1}})
	}
	return persistErr
}
func (a *App) processJob(ctx context.Context, j job) error {
	if j.Kind == "zoom_meeting" {
		return a.processMeeting(ctx, j)
	}
	if j.Kind == "file_scan" {
		return a.scanFile(ctx, j.Payload["fileId"])
	}
	if j.Kind == "razorpay_refund" {
		r, e := storage.One[domain.RefundRequest](ctx, a.Store, "refunds", bson.M{"_id": j.Payload["refundId"]})
		if e != nil {
			return e
		}
		if r.Status == "processed" || r.Status == "failed" {
			return nil
		}
		if !enum(r.Status, "approved", "submitted") {
			return domain.Fail(409, "invalid_transition", "Refund is no longer approved.")
		}
		v, e := storage.One[domain.PaymentIntent](ctx, a.Store, "payment_intents", bson.M{"_id": r.IntentID})
		if e != nil {
			return e
		}
		var p payments.Refund
		if r.ProviderID != "" {
			p, e = a.Payments.FetchRefund(ctx, r.ProviderID)
		} else {
			p, e = a.Payments.CreateRefund(ctx, v.PaymentID, r.Amount, r.ID)
		}
		if e != nil {
			return e
		}
		if e = a.applyRefund(ctx, r.ID, p); e != nil {
			return e
		}
		if p.Status != "processed" && p.Status != "failed" {
			return domain.Fail(409, "refund_pending", "Provider refund is not processed yet.")
		}
		return nil
	}
	switch j.Payload["event"] {
	case "payment.captured", "payment.failed":
		p, e := a.Payments.FetchPayment(ctx, j.Payload["paymentId"])
		if e != nil {
			return e
		}
		v, e := storage.One[domain.PaymentIntent](ctx, a.Store, "payment_intents", bson.M{"orderId": p.OrderID})
		if e != nil {
			return e
		}
		if p.Status == "captured" && p.Captured {
			return a.applyCaptured(ctx, v.ID, p)
		}
		if p.Status == "failed" {
			_, e = a.Store.C("payment_intents").UpdateOne(ctx, bson.M{"_id": v.ID, "state": "created", "paymentId": ""}, bson.M{"$set": bson.M{"state": "payment_failed"}})
			return e
		}
		return domain.Fail(409, "payment_pending", "Provider payment is pending.")
	case "refund.processed", "refund.failed":
		p, e := a.Payments.FetchRefund(ctx, j.Payload["refundId"])
		if e != nil {
			return e
		}
		return a.applyRefund(ctx, p.Receipt, p)
	}
	return nil
}
func (a *App) jobs(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "admin", "finance") {
		return
	}
	f := bson.M{}
	if user(r).Role == "finance" || r.URL.Query().Get("category") == "payments" {
		f["kind"] = bson.M{"$in": []string{"razorpay_refund", "razorpay_event", "payment_operator_review"}}
	}
	p, e := pageRecords[job](r.Context(), a.Store, "outbox", f, r.URL.Query().Get("cursor"))
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 200, p)
}

func (a *App) retryJob(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "admin", "finance") {
		return
	}
	var in struct {
		Reason string `json:"reason"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	if !validText(in.Reason, 10, 1000) {
		a.error(w, r, domain.Fail(422, "validation", "Record why this provider job should be retried."))
		return
	}
	e := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		f := bson.M{"_id": chi.URLParam(r, "id"), "status": "failed", "kind": bson.M{"$in": []string{"razorpay_event", "razorpay_refund"}}}
		result, er := a.Store.C("outbox").UpdateOne(ctx, f, bson.M{"$set": bson.M{"status": "pending", "attempts": 0, "availableAt": a.Now(), "retryReason": clean(in.Reason), "retryActor": user(r).ID}, "$inc": bson.M{"operatorRetries": 1}})
		if er != nil {
			return er
		}
		if result.MatchedCount != 1 {
			return domain.Fail(409, "invalid_transition", "Only failed provider jobs can be retried.")
		}
		return a.audit(ctx, user(r).ID, "job.retry_requested", chi.URLParam(r, "id"))
	})
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 200, map[string]bool{"ok": true})
}
