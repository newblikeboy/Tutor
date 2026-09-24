// Package payments is a Go-only adapter for Razorpay's HTTPS API. It performs no
// automatic mutation retries: an ambiguous response must first be reconciled.
package payments

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"time"
)

type Order struct {
	ID         string `json:"id"`
	Amount     int64  `json:"amount"`
	AmountPaid int64  `json:"amount_paid"`
	Currency   string `json:"currency"`
	Receipt    string `json:"receipt"`
	Status     string `json:"status"`
}
type Payment struct {
	ID             string `json:"id"`
	OrderID        string `json:"order_id"`
	Amount         int64  `json:"amount"`
	AmountRefunded int64  `json:"amount_refunded"`
	Currency       string `json:"currency"`
	Status         string `json:"status"`
	Captured       bool   `json:"captured"`
}
type Refund struct {
	ID        string `json:"id"`
	PaymentID string `json:"payment_id"`
	Amount    int64  `json:"amount"`
	Receipt   string `json:"receipt"`
	Status    string `json:"status"`
}
type Gateway interface {
	CreateOrder(context.Context, int64, string) (Order, error)
	OrdersByReceipt(context.Context, string) ([]Order, error)
	FetchPayment(context.Context, string) (Payment, error)
	CreateRefund(context.Context, string, int64, string) (Refund, error)
	FetchRefund(context.Context, string) (Refund, error)
	PaymentRefunds(context.Context, string) ([]Refund, error)
}
type Razorpay struct {
	key, secret, base string
	client            *http.Client
}

func New(key, secret string) *Razorpay {
	return &Razorpay{key: key, secret: secret, base: "https://api.razorpay.com/v1", client: &http.Client{Timeout: 8 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}
}

// ProviderError deliberately excludes response bodies, credentials and URLs.
type ProviderError struct {
	Status    int
	Ambiguous bool
}

func (e *ProviderError) Error() string {
	return fmt.Sprintf("payment provider request failed (status %d, ambiguous %t)", e.Status, e.Ambiguous)
}
func (p *Razorpay) request(ctx context.Context, method, path string, body, out any, idempotency ...string) error {
	var data []byte
	var err error
	if body != nil {
		data, err = json.Marshal(body)
		if err != nil {
			return err
		}
	}
	req, err := http.NewRequestWithContext(ctx, method, p.base+path, bytes.NewReader(data))
	if err != nil {
		return err
	}
	req.SetBasicAuth(p.key, p.secret)
	req.Header.Set("Content-Type", "application/json")
	if len(idempotency) > 0 {
		req.Header.Set("X-Refund-Idempotency", idempotency[0])
	}
	resp, err := p.client.Do(req)
	if err != nil {
		return &ProviderError{Ambiguous: method != "GET"}
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return &ProviderError{Status: resp.StatusCode, Ambiguous: resp.StatusCode >= 500 && method != "GET"}
	}
	reader := io.LimitReader(resp.Body, 1024*1024)
	if err = json.NewDecoder(reader).Decode(out); err != nil {
		return &ProviderError{Status: resp.StatusCode, Ambiguous: method != "GET"}
	}
	return nil
}

var reference = regexp.MustCompile(`^[a-zA-Z0-9_:-]{1,64}$`)

func validReceipt(s string) bool { return len(s) <= 40 && reference.MatchString(s) }
func (p *Razorpay) CreateOrder(ctx context.Context, amount int64, receipt string) (Order, error) {
	var out Order
	if amount < 100 || amount > 240000000 || !validReceipt(receipt) {
		return out, errors.New("invalid payment amount or receipt")
	}
	err := p.request(ctx, "POST", "/orders", map[string]any{"amount": amount, "currency": "INR", "receipt": receipt, "partial_payment": false}, &out)
	return out, err
}
func (p *Razorpay) OrdersByReceipt(ctx context.Context, receipt string) ([]Order, error) {
	var out struct {
		Items []Order `json:"items"`
	}
	if !validReceipt(receipt) {
		return nil, errors.New("invalid receipt")
	}
	err := p.request(ctx, "GET", "/orders?count=100&receipt="+url.QueryEscape(receipt), nil, &out)
	return out.Items, err
}
func (p *Razorpay) FetchPayment(ctx context.Context, id string) (Payment, error) {
	var out Payment
	if !reference.MatchString(id) {
		return out, errors.New("invalid payment reference")
	}
	err := p.request(ctx, "GET", "/payments/"+id, nil, &out)
	return out, err
}
func (p *Razorpay) CreateRefund(ctx context.Context, id string, amount int64, receipt string) (Refund, error) {
	var out Refund
	if !reference.MatchString(id) || !regexp.MustCompile(`^[a-zA-Z0-9_-]{10,40}$`).MatchString(receipt) || amount < 1 || amount > 240000000 {
		return out, errors.New("invalid refund details")
	}
	err := p.request(ctx, "POST", "/payments/"+id+"/refund", map[string]any{"amount": amount, "speed": "normal", "receipt": receipt}, &out, receipt)
	return out, err
}
func (p *Razorpay) FetchRefund(ctx context.Context, id string) (Refund, error) {
	var out Refund
	if !reference.MatchString(id) {
		return out, errors.New("invalid refund reference")
	}
	err := p.request(ctx, "GET", "/refunds/"+id, nil, &out)
	return out, err
}
func (p *Razorpay) PaymentRefunds(ctx context.Context, id string) ([]Refund, error) {
	var out struct {
		Items []Refund `json:"items"`
	}
	if !reference.MatchString(id) {
		return nil, errors.New("invalid payment reference")
	}
	err := p.request(ctx, "GET", "/payments/"+id+"/refunds?count=100", nil, &out)
	return out.Items, err
}
func VerifySignature(secret string, payload []byte, signature string) bool {
	if secret == "" || len(signature) != 64 {
		return false
	}
	received, err := hex.DecodeString(signature)
	if err != nil {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write(payload)
	return hmac.Equal(mac.Sum(nil), received)
}
func VerifyCheckout(secret, storedOrderID, paymentID, signature string) bool {
	return reference.MatchString(storedOrderID) && reference.MatchString(paymentID) && VerifySignature(secret, []byte(storedOrderID+"|"+paymentID), signature)
}
