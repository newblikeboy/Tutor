package domain

import "time"

type PaymentIntent struct {
	ID             string    `json:"id" bson:"_id"`
	OwnerID        string    `json:"-" bson:"ownerId"`
	EnrollmentID   string    `json:"enrollmentId" bson:"enrollmentId"`
	Amount         int64     `json:"amountPaise" bson:"amountPaise"`
	Currency       string    `json:"currency" bson:"currency"`
	State          string    `json:"state" bson:"state"`
	OrderID        string    `json:"orderId" bson:"orderId"`
	PaymentID      string    `json:"paymentId" bson:"paymentId"`
	RefundReserved int64     `json:"refundReservedPaise" bson:"refundReservedPaise"`
	Refunded       int64     `json:"refundedPaise" bson:"refundedPaise"`
	CreatedAt      time.Time `json:"createdAt" bson:"createdAt"`
}
type RefundRequest struct {
	ID          string    `json:"id" bson:"_id"`
	IntentID    string    `json:"intentId" bson:"intentId"`
	OwnerID     string    `json:"-" bson:"ownerId"`
	Amount      int64     `json:"amountPaise" bson:"amountPaise"`
	Reason      string    `json:"reason" bson:"reason"`
	Status      string    `json:"status" bson:"status"`
	RequestedBy string    `json:"requestedBy" bson:"requestedBy"`
	ReviewedBy  string    `json:"reviewedBy" bson:"reviewedBy"`
	Decision    string    `json:"decision" bson:"decision"`
	ProviderID  string    `json:"providerId" bson:"providerId"`
	CreatedAt   time.Time `json:"createdAt" bson:"createdAt"`
}

// Each immutable journal contains equal debit and credit amounts in paise.
// Gateway receivables are not bank settlements; tutor allocation needs reviewed policy.
type LedgerEntry struct {
	ID        string    `json:"id" bson:"_id"`
	OwnerID   string    `json:"-" bson:"ownerId"`
	IntentID  string    `json:"intentId" bson:"intentId"`
	Amount    int64     `json:"amountPaise" bson:"amountPaise"`
	Debit     string    `json:"debit" bson:"debit"`
	Credit    string    `json:"credit" bson:"credit"`
	Reference string    `json:"reference" bson:"reference"`
	CreatedAt time.Time `json:"createdAt" bson:"createdAt"`
}
