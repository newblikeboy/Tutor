package app

import (
	"context"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
)

func (a *App) businessSettings(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "admin", "finance") {
		return
	}
	v, err := storage.One[domain.BusinessSettings](r.Context(), a.Store, "business_settings", bson.M{"_id": "current"})
	if errors.Is(err, mongo.ErrNoDocuments) {
		// An explicitly incomplete form; never used as a tax policy.
		a.json(w, 200, domain.BusinessSettings{LegalName: "Synqvest System LLP", StateCode: "07"})
		return
	}
	if err != nil {
		a.error(w, r, err)
		return
	}
	a.json(w, 200, v)
}

func (a *App) saveBusinessSettings(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "admin") {
		return
	}
	var in domain.BusinessSettings
	if !a.decode(w, r, &in) {
		return
	}
	in.LegalName, in.Address, in.GSTIN = clean(in.LegalName), clean(in.Address), strings.ToUpper(strings.TrimSpace(in.GSTIN))
	if !validText(in.LegalName, 3, 160) || !validText(in.Address, 10, 600) || !regexp.MustCompile(`^[0-9]{2}$`).MatchString(in.StateCode) || !regexp.MustCompile(`^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$`).MatchString(in.GSTIN) || !strings.HasPrefix(in.GSTIN, in.StateCode) || !regexp.MustCompile(`^[0-9]{6}$`).MatchString(in.SAC) || in.CommissionGSTBPS < 0 || in.CommissionGSTBPS > 2800 || !validText(in.TaxPolicy, 20, 2000) {
		a.error(w, r, domain.Fail(422, "business_details", "Enter the registered address, matching GSTIN/state code, SAC and reviewed tax policy."))
		return
	}
	err := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		old, e := storage.One[domain.BusinessSettings](ctx, a.Store, "business_settings", bson.M{"_id": "current"})
		if e != nil && !errors.Is(e, mongo.ErrNoDocuments) {
			return e
		}
		if old.Version != in.Version {
			return domain.Fail(409, "stale_version", "Business settings changed. Reload first.")
		}
		in.ID = "current"
		in.Version++
		in.UpdatedAt = a.Now()
		in.UpdatedBy = user(r).ID
		if _, e = a.Store.C("business_settings").ReplaceOne(ctx, bson.M{"_id": "current"}, in, options.Replace().SetUpsert(true)); e != nil {
			return e
		}
		return a.audit(ctx, user(r).ID, "business.settings_updated", "current")
	})
	if err != nil {
		a.error(w, r, err)
		return
	}
	a.json(w, 200, in)
}

func (a *App) createFinanceBooking(ctx context.Context, v domain.PaymentIntent, e domain.Enrollment) error {
	amounts, err := domain.CalculateFinance(v.Amount, 0, domain.TaxReview{})
	if err != nil {
		return err
	}
	_, err = a.Store.C("finance_bookings").InsertOne(ctx, domain.FinanceBooking{ID: v.ID, EnrollmentID: e.ID, TutorID: e.TutorID, TutorName: e.TutorName, Status: "tax_review", Amounts: amounts, CreatedAt: a.Now()})
	return err
}

func (a *App) financeBookings(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "admin", "finance", "tutor") {
		return
	}
	f := bson.M{}
	if user(r).Role == "tutor" {
		f["tutorId"] = user(r).ID
	}
	p, e := pageRecords[domain.FinanceBooking](r.Context(), a.Store, "finance_bookings", f, r.URL.Query().Get("cursor"))
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 200, p)
}

func (a *App) reviewBookingTax(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "admin", "finance") {
		return
	}
	var in domain.TaxReview
	if !a.decode(w, r, &in) {
		return
	}
	if !validText(in.Reason, 20, 2000) {
		a.error(w, r, domain.Fail(422, "tax_review", "Document supplier GST status, PAN verification, tax-year turnover/threshold and the withholding bases, including any gross-up."))
		return
	}
	err := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		b, e := storage.One[domain.FinanceBooking](ctx, a.Store, "finance_bookings", bson.M{"_id": chi.URLParam(r, "id")})
		if e != nil {
			return e
		}
		if b.Status != "tax_review" {
			return domain.Fail(409, "tax_locked", "This booking already has an immutable tax review.")
		}
		settings, e := storage.One[domain.BusinessSettings](ctx, a.Store, "business_settings", bson.M{"_id": "current", "reviewed": true})
		if errors.Is(e, mongo.ErrNoDocuments) {
			return domain.Fail(409, "business_pending", "Complete and approve Business & taxes first.")
		}
		if e != nil {
			return e
		}
		p, e := storage.One[domain.PaymentIntent](ctx, a.Store, "payment_intents", bson.M{"_id": b.ID})
		if e != nil {
			return e
		}
		if p.State != "captured" || p.RefundReserved > 0 || p.Amount-p.Refunded < 100 {
			return domain.Fail(409, "refund_review", "Resolve refund activity before finalizing this booking's allocation.")
		}
		// Serialize review, refunds and earnings on the payment document.
		if _, e = a.Store.C("payment_intents").UpdateOne(ctx, bson.M{"_id": p.ID}, bson.M{"$inc": bson.M{"financeVersion": 1}}); e != nil {
			return e
		}
		b.Amounts, e = domain.CalculateFinance(p.Amount-p.Refunded, settings.CommissionGSTBPS, in)
		if e != nil {
			return e
		}
		b.Business = &settings
		b.Tax = &in
		b.Status = "reviewed"
		b.ReviewedBy = user(r).ID
		if _, e = a.Store.C("finance_bookings").ReplaceOne(ctx, bson.M{"_id": b.ID}, b); e != nil {
			return e
		}
		classes, e := storage.Many[domain.ClassSession](ctx, a.Store, "classes", bson.M{"enrollmentId": b.EnrollmentID, "status": bson.M{"$in": []string{"completed", "reviewed"}}})
		if e != nil {
			return e
		}
		for _, s := range classes {
			if e = a.recognizeEarning(ctx, s); e != nil {
				return e
			}
		}
		return a.audit(ctx, user(r).ID, "finance.tax_reviewed", b.ID)
	})
	if err != nil {
		a.error(w, r, err)
		return
	}
	a.json(w, 200, map[string]bool{"ok": true})
}

func (a *App) recognizeEarning(ctx context.Context, s domain.ClassSession) error {
	if !enum(s.Status, "completed", "reviewed") || s.Attendance != "present" || s.End.After(a.Now()) {
		return nil
	}
	e, e2 := storage.One[domain.Enrollment](ctx, a.Store, "enrollments", bson.M{"_id": s.EnrollmentID})
	if e2 != nil {
		return e2
	}
	if e.PaymentIntentID == "" {
		return nil
	} // Historical development agreements carry no captured money.
	b, err := storage.One[domain.FinanceBooking](ctx, a.Store, "finance_bookings", bson.M{"_id": e.PaymentIntentID})
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil
	}
	if err != nil {
		return err
	}
	if n, err := a.Store.C("class_earnings").CountDocuments(ctx, bson.M{"_id": s.ID}); err != nil {
		return err
	} else if n > 0 {
		return nil
	}
	if b.Status != "reviewed" {
		return a.holdEarning(ctx, s, b.ID, "tax_review", "Booking tax review is pending.", 0)
	}
	p, err := storage.One[domain.PaymentIntent](ctx, a.Store, "payment_intents", bson.M{"_id": b.ID})
	if err != nil {
		return err
	}
	if p.RefundReserved > 0 {
		return a.holdEarning(ctx, s, b.ID, "refund_pending", "A refund request is awaiting resolution.", 0)
	}
	classes, err := storage.Many[domain.ClassSession](ctx, a.Store, "classes", bson.M{"enrollmentId": e.ID})
	if err != nil {
		return err
	}
	if len(classes) != e.Agreement.SessionCount {
		return domain.Fail(409, "allocation_mismatch", "Class count does not match the paid agreement.")
	}
	index := -1
	for i, c := range classes {
		if c.ID == s.ID {
			index = i
		}
	}
	if index < 0 {
		return domain.Fail(409, "allocation_mismatch", "Class not found in paid agreement.")
	}
	amounts := domain.AllocateFinance(b.Amounts, index, len(classes))
	if b.TutorID != s.TutorID {
		review, e := storage.One[domain.ClassTaxReview](ctx, a.Store, "class_tax_reviews", bson.M{"_id": s.ID, "tutorId": s.TutorID})
		if errors.Is(e, mongo.ErrNoDocuments) {
			return a.holdEarning(ctx, s, b.ID, "replacement_tax", "The replacement tutor needs a class tax review.", amounts.Gross)
		}
		if e != nil {
			return e
		}
		amounts = review.Amounts
		b.Tax = &review.Tax
	}
	if p.Amount-p.Refunded-p.EarnedGross < amounts.Gross {
		return a.holdEarning(ctx, s, b.ID, "balance", "The remaining prepaid balance cannot fund this class after refunds.", amounts.Gross)
	}
	earned := a.Now()
	due := domain.WeeklyPayoutDue(earned)
	entry := domain.ClassEarning{ID: s.ID, IntentID: p.ID, EnrollmentID: e.ID, TutorID: s.TutorID, Amounts: amounts, DueAt: due, EarnedAt: earned}
	if _, err = a.Store.C("payment_intents").UpdateOne(ctx, bson.M{"_id": p.ID}, bson.M{"$inc": bson.M{"financeVersion": 1, "earnedGrossPaise": amounts.Gross}}); err != nil {
		return err
	}
	if _, err = a.Store.C("class_earnings").InsertOne(ctx, entry); err != nil {
		return err
	}
	if _, err = a.Store.C("earning_holds").DeleteOne(ctx, bson.M{"_id": s.ID}); err != nil {
		return err
	}
	lines := []struct {
		key, debit, credit string
		amount             int64
	}{
		{"tutor", "family_prepaid", "tutor_payable", amounts.TutorNet},
		{"revenue", "family_prepaid", "platform_revenue", amounts.Revenue},
		{"tds", "tutor_tax_protection", "tds_payable", amounts.TDS},
		{"tcs", "tutor_tax_protection", "tcs_payable", amounts.TCS},
		{"tuition-gst", "tutor_tax_protection", "tuition_gst_payable", amounts.TuitionGST},
		{"gateway", "gateway_expense", "gateway_receivable", amounts.GatewayCost},
	}
	if b.Tax.Interstate {
		lines = append(lines, struct {
			key, debit, credit string
			amount             int64
		}{"igst", "family_prepaid", "igst_payable", amounts.GST})
	} else {
		lines = append(lines, struct {
			key, debit, credit string
			amount             int64
		}{"cgst", "family_prepaid", "cgst_payable", amounts.GST / 2}, struct {
			key, debit, credit string
			amount             int64
		}{"sgst", "family_prepaid", "sgst_payable", amounts.GST - amounts.GST/2})
	}
	for _, line := range lines {
		if line.amount == 0 {
			continue
		}
		if _, err = a.Store.C("ledger").InsertOne(ctx, domain.LedgerEntry{ID: "earning:" + s.ID + ":" + line.key, OwnerID: p.OwnerID, IntentID: p.ID, Amount: line.amount, Debit: line.debit, Credit: line.credit, Reference: s.ID, CreatedAt: earned}); err != nil {
			return err
		}
	}
	return nil
}

func (a *App) earnings(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "tutor", "admin", "finance") {
		return
	}
	f := bson.M{}
	if user(r).Role == "tutor" {
		f["tutorId"] = user(r).ID
	}
	p, e := pageRecords[domain.ClassEarning](r.Context(), a.Store, "class_earnings", f, r.URL.Query().Get("cursor"))
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 200, p)
}

func (a *App) payouts(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "tutor", "admin", "finance") {
		return
	}
	f := bson.M{}
	if user(r).Role == "tutor" {
		f["tutorId"] = user(r).ID
	}
	p, e := pageRecords[domain.PayoutBatch](r.Context(), a.Store, "payout_batches", f, r.URL.Query().Get("cursor"))
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 200, p)
}

func (a *App) createPayout(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "admin", "finance") {
		return
	}
	var in struct {
		TutorID string `json:"tutorId"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	var batch domain.PayoutBatch
	err := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		prior, fp, e := a.receipt(ctx, "payout:"+user(r).ID, r.Header.Get("Idempotency-Key"), in)
		if e != nil {
			return e
		}
		if prior != "" {
			batch, e = storage.One[domain.PayoutBatch](ctx, a.Store, "payout_batches", bson.M{"_id": prior})
			return e
		}
		// Limit is intentional: one batch contains at most 100 classes. Remaining rows stay payable.
		rows, e := storage.Many[domain.ClassEarning](ctx, a.Store, "class_earnings", bson.M{"tutorId": in.TutorID, "batchId": "", "dueAt": bson.M{"$lte": a.Now()}})
		if e != nil {
			return e
		}
		if len(rows) == 0 {
			return domain.Fail(409, "nothing_due", "No completed, reviewed classes are due for this tutor yet.")
		}
		batch = domain.PayoutBatch{ID: token()[:32], TutorID: in.TutorID, Status: "prepared", CreatedBy: user(r).ID, CreatedAt: a.Now(), ClassIDs: []string{}}
		for _, v := range rows {
			p, e := storage.One[domain.PaymentIntent](ctx, a.Store, "payment_intents", bson.M{"_id": v.IntentID})
			if e != nil {
				return e
			}
			if p.RefundReserved > 0 {
				continue
			}
			if _, e = a.Store.C("payment_intents").UpdateOne(ctx, bson.M{"_id": p.ID}, bson.M{"$inc": bson.M{"financeVersion": 1}}); e != nil {
				return e
			}
			result, e := a.Store.C("class_earnings").UpdateOne(ctx, bson.M{"_id": v.ID, "batchId": ""}, bson.M{"$set": bson.M{"batchId": batch.ID}})
			if e != nil {
				return e
			}
			if result.ModifiedCount != 1 {
				return domain.Fail(409, "payout_conflict", "These earnings have already been batched.")
			}
			batch.Amount += v.Amounts.TutorNet
			batch.ClassIDs = append(batch.ClassIDs, v.ID)
		}
		if len(batch.ClassIDs) == 0 {
			return domain.Fail(409, "refund_hold", "Refund activity is holding these earnings.")
		}
		if _, e = a.Store.C("payout_batches").InsertOne(ctx, batch); e != nil {
			return e
		}
		if e = a.saveReceipt(ctx, "payout:"+user(r).ID, r.Header.Get("Idempotency-Key"), fp, batch.ID); e != nil {
			return e
		}
		return a.audit(ctx, user(r).ID, "payout.prepared", batch.ID)
	})
	if err != nil {
		a.error(w, r, err)
		return
	}
	a.json(w, 201, batch)
}

func (a *App) payoutAction(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "admin", "finance") {
		return
	}
	var in struct {
		Action    string    `json:"action"`
		Reference string    `json:"reference"`
		PaidAt    time.Time `json:"paidAt"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	err := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		b, e := storage.One[domain.PayoutBatch](ctx, a.Store, "payout_batches", bson.M{"_id": chi.URLParam(r, "id")})
		if e != nil {
			return e
		}
		switch in.Action {
		case "record":
			if b.Status != "prepared" || !regexp.MustCompile(`^[A-Za-z0-9-]{8,64}$`).MatchString(in.Reference) || in.PaidAt.After(a.Now()) || in.PaidAt.Before(b.CreatedAt.Truncate(time.Minute)) {
				return domain.Fail(422, "payout_reference", "Record the actual bank UTR and transfer time after preparing this batch.")
			}
			b.Status = "verification_pending"
			b.Reference = in.Reference
			b.PaidAt = &in.PaidAt
			b.RecordedBy = user(r).ID
		case "confirm":
			if b.Status != "verification_pending" || b.RecordedBy == user(r).ID {
				return domain.Fail(403, "payout_verifier", "A different finance/admin user must verify the bank settlement.")
			}
			b.Status = "paid"
			b.ConfirmedBy = user(r).ID
			for _, id := range b.ClassIDs {
				v, e := storage.One[domain.ClassEarning](ctx, a.Store, "class_earnings", bson.M{"_id": id, "batchId": b.ID})
				if e != nil {
					return e
				}
				p, e := storage.One[domain.PaymentIntent](ctx, a.Store, "payment_intents", bson.M{"_id": v.IntentID})
				if e != nil {
					return e
				}
				if _, e = a.Store.C("ledger").InsertOne(ctx, domain.LedgerEntry{ID: "payout:" + id, OwnerID: p.OwnerID, IntentID: p.ID, Amount: v.Amounts.TutorNet, Debit: "tutor_payable", Credit: "bank", Reference: b.Reference, CreatedAt: a.Now()}); e != nil {
					return e
				}
			}
		default:
			return domain.Fail(422, "validation", "Unknown payout action.")
		}
		if _, e = a.Store.C("payout_batches").ReplaceOne(ctx, bson.M{"_id": b.ID}, b); e != nil {
			return e
		}
		return a.audit(ctx, user(r).ID, "payout."+in.Action, b.ID)
	})
	if err != nil {
		a.error(w, r, err)
		return
	}
	a.json(w, 200, map[string]bool{"ok": true})
}

func (a *App) financeSummary(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "admin", "finance") {
		return
	}
	// Aggregate all records in MongoDB; totals must never be capped by list pagination.
	group := bson.M{"_id": nil}
	for _, field := range []string{"grossPaise", "tutorNetPaise", "platformPaise", "gstPaise", "tuitionGstPaise", "tdsPaise", "tcsPaise", "gatewayCostPaise", "revenuePaise", "contributionPaise"} {
		group[field] = bson.M{"$sum": "$amounts." + field}
	}
	cur, e := a.Store.C("class_earnings").Aggregate(r.Context(), mongo.Pipeline{{{Key: "$group", Value: group}}})
	if e != nil {
		a.error(w, r, e)
		return
	}
	defer cur.Close(r.Context())
	out := domain.FinancialAmounts{}
	if cur.Next(r.Context()) {
		e = cur.Decode(&out)
	}
	if e == nil {
		e = cur.Err()
	}
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 200, out)
}
