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
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
)

func (a *App) recordInvoice(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "admin", "finance") {
		return
	}
	var in struct {
		Number          string    `json:"number"`
		IssuerName      string    `json:"issuerName"`
		IssuerAddress   string    `json:"issuerAddress"`
		IssuerGSTIN     string    `json:"issuerGstin"`
		CustomerName    string    `json:"customerName"`
		CustomerAddress string    `json:"customerAddress"`
		SupplyState     string    `json:"supplyState"`
		SAC             string    `json:"sac"`
		Description     string    `json:"description"`
		GSTBPS          int64     `json:"gstBps"`
		IssuedAt        time.Time `json:"issuedAt"`
		Confirmed       bool      `json:"confirmed"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	in.IssuerGSTIN = strings.ToUpper(strings.TrimSpace(in.IssuerGSTIN))
	if !in.Confirmed || !regexp.MustCompile(`^[A-Za-z0-9/-]{1,16}$`).MatchString(in.Number) || !validText(in.IssuerName, 3, 160) || !validText(in.IssuerAddress, 10, 600) || !validText(in.CustomerName, 2, 160) || !validText(in.CustomerAddress, 10, 600) || !validText(in.Description, 10, 1000) || !regexp.MustCompile(`^[0-9]{2}$`).MatchString(in.SupplyState) || !regexp.MustCompile(`^[0-9]{6}$`).MatchString(in.SAC) || in.GSTBPS < 0 || in.GSTBPS > 2800 || in.IssuedAt.IsZero() || in.IssuedAt.After(a.Now()) || (in.IssuerGSTIN == "" && in.GSTBPS != 0) || (in.IssuerGSTIN != "" && !regexp.MustCompile(`^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$`).MatchString(in.IssuerGSTIN)) {
		a.error(w, r, domain.Fail(422, "invoice_details", "Enter the approved supplier invoice exactly, including its tax status and billing details."))
		return
	}
	var invoice domain.PaidInvoice
	err := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		p, e := storage.One[domain.PaymentIntent](ctx, a.Store, "payment_intents", bson.M{"_id": chi.URLParam(r, "id"), "paymentId": bson.M{"$gt": ""}})
		if e != nil {
			return e
		}
		if p.Provider == "simulation" {
			return domain.Fail(409, "simulated_payment", "Test payments cannot have paid invoices.")
		}
		if p.Refunded > 0 || p.RefundReserved > 0 {
			return domain.Fail(409, "invoice_refund", "Resolve the refund and its credit note before recording this invoice.")
		}
		if _, e = storage.One[domain.BusinessSettings](ctx, a.Store, "business_settings", bson.M{"_id": "current", "reviewed": true}); e != nil {
			if errors.Is(e, mongo.ErrNoDocuments) {
				return domain.Fail(409, "business_pending", "Complete Business & taxes before recording an invoice.")
			}
			return e
		}
		if n, e := a.Store.C("paid_invoices").CountDocuments(ctx, bson.M{"_id": p.ID}); e != nil {
			return e
		} else if n > 0 {
			return domain.Fail(409, "invoice_locked", "This paid invoice is immutable. It cannot be overwritten.")
		}
		gst := (p.Amount*in.GSTBPS + (10000+in.GSTBPS)/2) / (10000 + in.GSTBPS)
		invoice = domain.PaidInvoice{ID: p.ID, OwnerID: p.OwnerID, Number: in.Number, IssuerName: clean(in.IssuerName), IssuerAddress: clean(in.IssuerAddress), IssuerGSTIN: in.IssuerGSTIN, CustomerName: clean(in.CustomerName), CustomerAddress: clean(in.CustomerAddress), SupplyState: in.SupplyState, SAC: in.SAC, Description: clean(in.Description), GSTBPS: in.GSTBPS, Total: p.Amount, Taxable: p.Amount - gst, IssuedAt: in.IssuedAt, RecordedBy: user(r).ID, RecordedAt: a.Now()}
		if gst > 0 {
			if strings.HasPrefix(in.IssuerGSTIN, in.SupplyState) {
				invoice.CGST = gst / 2
				invoice.SGST = gst - invoice.CGST
			} else {
				invoice.IGST = gst
			}
		}
		if _, e = a.Store.C("payment_intents").UpdateOne(ctx, bson.M{"_id": p.ID}, bson.M{"$inc": bson.M{"financeVersion": 1}}); e != nil {
			return e
		}
		if _, e = a.Store.C("paid_invoices").InsertOne(ctx, invoice); e != nil {
			return e
		}
		return a.audit(ctx, user(r).ID, "invoice.recorded", p.ID)
	})
	if err != nil {
		a.error(w, r, err)
		return
	}
	a.json(w, 201, invoice)
}
