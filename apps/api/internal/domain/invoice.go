package domain

import "time"

// A private, immutable transcription of a finance-approved supplier invoice.
// The platform's commission and journals are never included in the parent DTO.
type PaidInvoice struct {
	ID              string    `json:"id" bson:"_id"`
	OwnerID         string    `json:"-" bson:"ownerId"`
	Number          string    `json:"number" bson:"number"`
	IssuerName      string    `json:"issuerName" bson:"issuerName"`
	IssuerAddress   string    `json:"issuerAddress" bson:"issuerAddress"`
	IssuerGSTIN     string    `json:"issuerGstin" bson:"issuerGstin"`
	CustomerName    string    `json:"customerName" bson:"customerName"`
	CustomerAddress string    `json:"customerAddress" bson:"customerAddress"`
	SupplyState     string    `json:"supplyState" bson:"supplyState"`
	SAC             string    `json:"sac" bson:"sac"`
	Description     string    `json:"description" bson:"description"`
	GSTBPS          int64     `json:"gstBps" bson:"gstBps"`
	Total           int64     `json:"totalPaise" bson:"totalPaise"`
	Taxable         int64     `json:"taxablePaise" bson:"taxablePaise"`
	CGST            int64     `json:"cgstPaise" bson:"cgstPaise"`
	SGST            int64     `json:"sgstPaise" bson:"sgstPaise"`
	IGST            int64     `json:"igstPaise" bson:"igstPaise"`
	IssuedAt        time.Time `json:"issuedAt" bson:"issuedAt"`
	RecordedBy      string    `json:"-" bson:"recordedBy"`
	RecordedAt      time.Time `json:"-" bson:"recordedAt"`
}
