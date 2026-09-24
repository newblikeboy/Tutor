package payments

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSignatureUsesExactBodyAndServerOrder(t *testing.T) {
	secret := "unit-test-webhook-secret"
	payload := []byte(`{"event":"payment.captured"}`)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	signature := hex.EncodeToString(mac.Sum(nil))
	if !VerifySignature(secret, payload, signature) || VerifySignature(secret, append(payload, ' '), signature) || VerifySignature("", payload, signature) || VerifySignature(secret, payload, strings.Repeat("z", 64)) {
		t.Fatal("raw body signature boundary failed")
	}
	mac = hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte("order_known|pay_known"))
	signature = hex.EncodeToString(mac.Sum(nil))
	if !VerifyCheckout(secret, "order_known", "pay_known", signature) || VerifyCheckout(secret, "order_attacker", "pay_known", signature) {
		t.Fatal("checkout order binding failed")
	}
}
func TestRazorpayWireContractAndAmbiguousResponses(t *testing.T) {
	count := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		count++
		key, secret, ok := r.BasicAuth()
		if !ok || key != "rzp_test_unit" || secret != "private-test-secret" {
			t.Error("missing server authentication")
		}
		if r.URL.Path == "/orders" && r.Method == "POST" {
			var body struct {
				Amount   int64  `json:"amount"`
				Currency string `json:"currency"`
				Receipt  string `json:"receipt"`
				Partial  bool   `json:"partial_payment"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Error(err)
			}
			if body.Amount != 12500 || body.Currency != "INR" || body.Partial {
				t.Error("money representation altered")
			}
			if body.Receipt == "timeout-case" {
				w.WriteHeader(503)
				w.Write([]byte("private-test-secret"))
				return
			}
			w.Write([]byte(`{"id":"order_unit","amount":12500,"currency":"INR","receipt":"unit-receipt","status":"created"}`))
			return
		}
		if r.URL.Path == "/orders" && r.URL.Query().Get("receipt") == "unit-receipt" {
			w.Write([]byte(`{"items":[{"id":"order_unit","amount":12500,"currency":"INR","receipt":"unit-receipt"}]}`))
			return
		}
		if r.URL.Path == "/payments/pay_unit" {
			w.Write([]byte(`{"id":"pay_unit","order_id":"order_unit","amount":12500,"currency":"INR","status":"captured","captured":true}`))
			return
		}
		if r.URL.Path == "/payments/pay_unit/refund" {
			if r.Header.Get("X-Refund-Idempotency") != "refund-unit" {
				t.Error("missing stable refund idempotency")
			}
			var body map[string]any
			json.NewDecoder(r.Body).Decode(&body)
			if body["amount"] != float64(5000) || body["speed"] != "normal" {
				t.Error("refund payload")
			}
			w.Write([]byte(`{"id":"rfnd_unit","payment_id":"pay_unit","amount":5000,"status":"pending"}`))
			return
		}
		t.Errorf("unexpected endpoint %s", r.URL.Path)
	}))
	defer server.Close()
	p := New("rzp_test_unit", "private-test-secret")
	p.base = server.URL
	ctx := context.Background()
	order, err := p.CreateOrder(ctx, 12500, "unit-receipt")
	if err != nil || order.ID != "order_unit" {
		t.Fatal("order contract", err)
	}
	orders, err := p.OrdersByReceipt(ctx, "unit-receipt")
	if err != nil || len(orders) != 1 {
		t.Fatal("reconciliation contract", err)
	}
	payment, err := p.FetchPayment(ctx, "pay_unit")
	if err != nil || !payment.Captured || payment.OrderID != order.ID {
		t.Fatal("payment contract", err)
	}
	refund, err := p.CreateRefund(ctx, payment.ID, 5000, "refund-unit")
	if err != nil || refund.Status != "pending" {
		t.Fatal("refund acceptance confused with completion", err)
	}
	before := count
	_, err = p.CreateOrder(ctx, 12500, "timeout-case")
	var pe *ProviderError
	if !errors.As(err, &pe) || !pe.Ambiguous || count != before+1 || strings.Contains(err.Error(), "private-test-secret") {
		t.Fatal("ambiguous mutation retried or secret exposed")
	}
	before = count
	_, err = p.FetchPayment(ctx, "../secrets")
	if err == nil || count != before {
		t.Fatal("path traversal")
	}
}
