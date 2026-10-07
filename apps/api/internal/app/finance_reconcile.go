package app

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
)

func (a *App) holdEarning(ctx context.Context, s domain.ClassSession, intentID, kind, reason string, gross int64) error {
	_, e := a.Store.C("earning_holds").ReplaceOne(ctx, bson.M{"_id": s.ID}, domain.EarningHold{ID: s.ID, IntentID: intentID, TutorID: s.TutorID, Kind: kind, Gross: gross, Reason: reason, UpdatedAt: a.Now()}, options.Replace().SetUpsert(true))
	return e
}

func (a *App) earningHolds(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "admin", "finance", "tutor") {
		return
	}
	f := bson.M{}
	if user(r).Role == "tutor" {
		f["tutorId"] = user(r).ID
	}
	p, e := pageRecords[domain.EarningHold](r.Context(), a.Store, "earning_holds", f, r.URL.Query().Get("cursor"))
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 200, p)
}

func (a *App) reviewReplacementTax(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "admin", "finance") {
		return
	}
	var in domain.TaxReview
	if !a.decode(w, r, &in) {
		return
	}
	if !validText(in.Reason, 20, 2000) {
		a.error(w, r, domain.Fail(422, "tax_review", "Record the replacement tutor's verified tax treatment."))
		return
	}
	err := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		s, e := storage.One[domain.ClassSession](ctx, a.Store, "classes", bson.M{"_id": chi.URLParam(r, "id"), "status": "reviewed", "attendance": "present"})
		if e != nil {
			return e
		}
		v, e := storage.One[domain.Enrollment](ctx, a.Store, "enrollments", bson.M{"_id": s.EnrollmentID})
		if e != nil {
			return e
		}
		b, e := storage.One[domain.FinanceBooking](ctx, a.Store, "finance_bookings", bson.M{"_id": v.PaymentIntentID, "status": "reviewed"})
		if e != nil {
			return e
		}
		if s.TutorID == b.TutorID {
			return domain.Fail(409, "tax_review", "Use the booking's original tax review for this tutor.")
		}
		settings, e := storage.One[domain.BusinessSettings](ctx, a.Store, "business_settings", bson.M{"_id": "current", "reviewed": true})
		if e != nil {
			return e
		}
		classes, e := storage.Many[domain.ClassSession](ctx, a.Store, "classes", bson.M{"enrollmentId": v.ID})
		if e != nil {
			return e
		}
		if len(classes) != v.Agreement.SessionCount {
			return domain.Fail(409, "allocation_mismatch", "Class count does not match agreement.")
		}
		index := -1
		for i, c := range classes {
			if c.ID == s.ID {
				index = i
			}
		}
		if index < 0 {
			return domain.Fail(409, "allocation_mismatch", "Class missing from agreement.")
		}
		original := domain.AllocateFinance(b.Amounts, index, len(classes))
		amounts, e := domain.CalculateFinance(original.Gross, settings.CommissionGSTBPS, in)
		if e != nil {
			return e
		}
		// Preserve the original class's exact share of the booking rounding.
		amounts.TutorNet = original.TutorNet
		amounts.Platform = original.Platform
		amounts.GST = (amounts.Platform*settings.CommissionGSTBPS + (10000+settings.CommissionGSTBPS)/2) / (10000 + settings.CommissionGSTBPS)
		amounts.Revenue = amounts.Platform - amounts.GST
		amounts.Contribution = amounts.Revenue - amounts.TDS - amounts.TCS - amounts.GatewayCost - amounts.TuitionGST
		if _, e = a.Store.C("class_tax_reviews").InsertOne(ctx, domain.ClassTaxReview{ID: s.ID, TutorID: s.TutorID, Amounts: amounts, Tax: in, Business: settings, ReviewedBy: user(r).ID, ReviewedAt: a.Now()}); e != nil {
			return e
		}
		if e = a.recognizeEarning(ctx, s); e != nil {
			return e
		}
		return a.audit(ctx, user(r).ID, "finance.replacement_tax_reviewed", s.ID)
	})
	if err != nil {
		a.error(w, r, err)
		return
	}
	a.json(w, 200, map[string]bool{"ok": true})
}

// Retry completed-class allocation after a refund hold or delayed attendance review.
// It never rewrites a previously recognized earning or its tax snapshot.
func (a *App) reconcileBookingEarnings(ctx context.Context, intentID string) error {
	p, e := storage.One[domain.PaymentIntent](ctx, a.Store, "payment_intents", bson.M{"_id": intentID})
	if e != nil {
		return e
	}
	classes, e := storage.Many[domain.ClassSession](ctx, a.Store, "classes", bson.M{"enrollmentId": p.EnrollmentID, "status": "reviewed"})
	if e != nil {
		return e
	}
	for _, s := range classes {
		if e = a.recognizeEarning(ctx, s); e != nil {
			return e
		}
	}
	return nil
}

func (a *App) reconcileFinance(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "finance", "admin") {
		return
	}
	err := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		id := chi.URLParam(r, "id")
		if e := a.reconcileBookingEarnings(ctx, id); e != nil {
			return e
		}
		return a.audit(ctx, user(r).ID, "finance.reconciled", id)
	})
	if err != nil {
		a.error(w, r, err)
		return
	}
	a.json(w, 200, map[string]bool{"ok": true})
}
