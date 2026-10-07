package app

import (
	"context"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"tutorplatform/internal/config"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
)

func TestMongoFinanceLifecycle(t *testing.T) {
	uri := os.Getenv("TEST_MONGODB_URI")
	if uri == "" {
		t.Skip("TEST_MONGODB_URI required")
	}
	t.Setenv("SEED_PASSWORD", testPassword)
	ctx := context.Background()
	s, err := storage.Connect(ctx, uri, "tutor_test_finance_"+token()[:12])
	if err != nil {
		t.Fatal(err)
	}
	defer s.Client.Disconnect(ctx)
	if err = s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	if err = s.Seed(ctx, "test"); err != nil {
		t.Fatal(err)
	}
	a := New(s, config.Config{Env: "test", AuthProvider: "password", Origin: "http://test.local"})
	now := time.Now().UTC()
	a.Now = func() time.Time { return now }
	srv := httptest.NewServer(a.Routes())
	defer srv.Close()
	client := func(id string) *testClient {
		jar, _ := cookiejar.New(nil)
		c := &testClient{t: t, http: &http.Client{Jar: jar, Timeout: 30 * time.Second}, base: srv.URL}
		c.login(id)
		return c
	}
	admin, finance, parent, tutor, other := client("admin-a"), client("finance-a"), client("parent-a"), client("tutor-meera"), client("tutor-arjun")
	parent.ok("GET", "/finance/business", nil, 403)
	tutor.ok("GET", "/finance/summary", nil, 403)
	settings := domain.BusinessSettings{LegalName: "Fictional Test LLP", Address: "Sample office, New Delhi 110001", StateCode: "07", GSTIN: "07AAAAA0000A1Z5", SAC: "999293", CommissionGSTBPS: 1800, TaxPolicy: "Test-only accountant review of marketplace commission and withholding coverage.", Reviewed: true}
	finance.ok("PUT", "/finance/business", settings, 403)
	admin.ok("PUT", "/finance/business", settings, 200)
	admin.ok("PUT", "/finance/business", settings, 409)
	insert := func(c string, v any) {
		t.Helper()
		if _, e := s.C(c).InsertOne(ctx, v); e != nil {
			t.Fatal(e)
		}
	}
	ag := domain.Agreement{SessionCount: 2, TotalPaise: 100001}
	enrollment := domain.Enrollment{ID: "finance-enrollment", OwnerID: "parent-a", LearnerID: "sample-learner", TutorID: "tutor-meera", TutorName: "Sample Meera", MentorID: "mentor-a", Status: "active", Agreement: ag, PaymentIntentID: "finance-payment", Version: 1}
	payment := domain.PaymentIntent{ID: "finance-payment", OwnerID: "parent-a", EnrollmentID: enrollment.ID, Amount: 100001, Currency: "INR", State: "captured", PaymentID: "pay_finance", CreatedAt: now}
	insert("enrollments", enrollment)
	insert("payment_intents", payment)
	class := domain.ClassSession{ID: "finance-class-1", EnrollmentID: enrollment.ID, TutorID: enrollment.TutorID, Start: now.Add(-3 * time.Hour), End: now.Add(-2 * time.Hour), Status: "reviewed", Attendance: "present", Version: 1}
	insert("classes", class)
	second := class
	second.ID = "finance-class-2"
	second.Status = "awaiting_review"
	second.Attendance = "disputed"
	insert("classes", second)
	if err = a.createFinanceBooking(ctx, payment, enrollment); err != nil {
		t.Fatal(err)
	}
	invoiceInput := map[string]any{"number": "TEST/26/001", "issuerName": "Fictional tutor supplier", "issuerAddress": "Sample supplier office, Delhi 110001", "issuerGstin": "07AAAAA0000A1Z5", "customerName": "Sample parent", "customerAddress": "Sample family address, Delhi 110002", "supplyState": "07", "sac": "999293", "description": "Two classes under the saved sample agreement.", "gstBps": 1800, "issuedAt": now, "confirmed": true}
	parent.ok("POST", "/billing/finance-payment/invoice", invoiceInput, 403)
	invoice := finance.ok("POST", "/billing/finance-payment/invoice", invoiceInput, 201)
	if invoice["totalPaise"].(float64) != 100001 || invoice["taxablePaise"].(float64)+invoice["cgstPaise"].(float64)+invoice["sgstPaise"].(float64) != 100001 || invoice["igstPaise"].(float64) != 0 {
		t.Fatal("invoice does not balance", invoice)
	}
	finance.ok("POST", "/billing/finance-payment/invoice", invoiceInput, 409)
	client("parent-b").ok("GET", "/billing/finance-payment", nil, 404)
	if _, exists := parent.ok("GET", "/billing/finance-payment", nil, 200)["invoice"]; !exists {
		t.Fatal("paid invoice missing for owner")
	}
	if got := other.ok("GET", "/finance/bookings", nil, 200); len(got["items"].([]any)) != 0 {
		t.Fatal("other tutor saw booking")
	}
	if got := tutor.ok("GET", "/finance/bookings", nil, 200); len(got["items"].([]any)) != 1 {
		t.Fatal("missing own allocation")
	}
	tax := domain.TaxReview{TDSBase: 100001, TDSBPS: 10, TCSBase: 100001, TCSBPS: 50, GatewayCost: 2360, Reason: "Test PAN and turnover reviewed; withholding basis includes reviewed platform coverage."}
	parent.ok("POST", "/finance/bookings/finance-payment/tax", tax, 403)
	finance.ok("POST", "/finance/bookings/finance-payment/tax", tax, 200)
	finance.ok("POST", "/finance/bookings/finance-payment/tax", tax, 409)
	for i := 0; i < 2; i++ {
		if err = s.Tx(ctx, func(ctx context.Context) error { return a.recognizeEarning(ctx, class) }); err != nil {
			t.Fatal(err)
		}
	}
	earnings := tutor.ok("GET", "/finance/earnings", nil, 200)["items"].([]any)
	if len(earnings) != 1 {
		t.Fatal("disputed or duplicate earning", earnings)
	}
	if len(other.ok("GET", "/finance/earnings", nil, 200)["items"].([]any)) != 0 {
		t.Fatal("earnings leak")
	}
	if ledger := parent.ok("GET", "/billing/finance-payment", nil, 200)["ledger"].([]any); len(ledger) != 0 {
		t.Fatal("parent received journal")
	}
	status, _, _ := parent.call("POST", "/billing/finance-payment/refunds", map[string]any{"amountPaise": 60000, "reason": "Cannot refund earned class balance."}, map[string]string{"Idempotency-Key": "finance-refund-overspend"})
	if status != 409 {
		t.Fatalf("earned balance refunded: %d", status)
	}
	input := map[string]any{"tutorId": "tutor-meera"}
	status, _, _ = finance.call("POST", "/finance/payouts", input, map[string]string{"Idempotency-Key": "finance-too-early"})
	if status != 409 {
		t.Fatalf("early payout: %d", status)
	}
	// Keep sessions valid while making only the fixture earning due.
	if _, err = s.C("class_earnings").UpdateOne(ctx, bson.M{"_id": class.ID}, bson.M{"$set": bson.M{"dueAt": now.Add(-time.Hour)}}); err != nil {
		t.Fatal(err)
	}
	status, refund, _ := parent.call("POST", "/billing/finance-payment/refunds", map[string]any{"amountPaise": 1000, "reason": "Sample refund request against the future class."}, map[string]string{"Idempotency-Key": "finance-refund-hold"})
	if status != 201 {
		t.Fatal("refund hold setup", status)
	}
	status, _, _ = finance.call("POST", "/finance/payouts", input, map[string]string{"Idempotency-Key": "finance-held-batch"})
	if status != 409 {
		t.Fatal("refund hold did not block batch")
	}
	finance.ok("POST", "/refunds/"+refund["id"].(string)+"/action", map[string]any{"action": "reject", "reason": "The sample family withdrew this refund request."}, 200)
	// Concurrent retries must converge on one batch and one set of earning reservations.
	type batchResult struct {
		status int
		body   map[string]any
	}
	results := make(chan batchResult, 2)
	for i := 0; i < 2; i++ {
		go func() {
			status, body, _ := finance.call("POST", "/finance/payouts", input, map[string]string{"Idempotency-Key": "finance-batch-once"})
			results <- batchResult{status, body}
		}()
	}
	first, secondResult := <-results, <-results
	if first.status != 201 || secondResult.status != 201 || first.body["id"] != secondResult.body["id"] {
		t.Fatal("concurrent payout preparation diverged", first, secondResult)
	}
	status, batch, raw := finance.call("POST", "/finance/payouts", input, map[string]string{"Idempotency-Key": "finance-batch-once"})
	if status != 201 {
		t.Fatalf("batch %d %s", status, raw)
	}
	if batch["amountPaise"].(float64) != 37500 {
		t.Fatal("incorrect net", batch)
	}
	status, again, _ := finance.call("POST", "/finance/payouts", input, map[string]string{"Idempotency-Key": "finance-batch-once"})
	if status != 201 || again["id"] != batch["id"] {
		t.Fatal("idempotent batch changed")
	}
	status, _, _ = finance.call("POST", "/finance/payouts", input, map[string]string{"Idempotency-Key": "finance-batch-twice"})
	if status != 409 {
		t.Fatal("double payout prepared")
	}
	path := "/finance/payouts/" + batch["id"].(string) + "/action"
	finance.ok("POST", path, map[string]any{"action": "record", "reference": "TESTUTR000123", "paidAt": now}, 200)
	finance.ok("POST", path, map[string]any{"action": "confirm"}, 403)
	admin.ok("POST", path, map[string]any{"action": "confirm"}, 200)
	admin.ok("POST", path, map[string]any{"action": "confirm"}, 403)
	if n, e := s.C("ledger").CountDocuments(ctx, bson.M{"_id": "payout:" + class.ID}); e != nil || n != 1 {
		t.Fatal("settlement journal missing or duplicated", n, e)
	}
	if len(other.ok("GET", "/finance/payouts", nil, 200)["items"].([]any)) != 0 {
		t.Fatal("payout leak")
	}
	summary := finance.ok("GET", "/finance/summary", nil, 200)
	if summary["tutorNetPaise"].(float64) != 37500 {
		t.Fatal("summary wrong", summary)
	}
	// A consented replacement changes future class ownership, not historical earnings.
	second.TutorID = "tutor-arjun"
	second.Attendance = "present"
	second.Status = "reviewed"
	if _, err = s.C("classes").ReplaceOne(ctx, bson.M{"_id": second.ID}, second); err != nil {
		t.Fatal(err)
	}
	if err = s.Tx(ctx, func(ctx context.Context) error { return a.recognizeEarning(ctx, second) }); err != nil {
		t.Fatal(err)
	}
	holds := other.ok("GET", "/finance/holds", nil, 200)["items"].([]any)
	if len(holds) != 1 || holds[0].(map[string]any)["kind"] != "replacement_tax" {
		t.Fatal("replacement earning was not held", holds)
	}
	other.ok("POST", "/finance/classes/finance-class-2/tax", tax, 403)
	finance.ok("POST", "/finance/classes/finance-class-2/tax", tax, 200)
	if len(other.ok("GET", "/finance/holds", nil, 200)["items"].([]any)) != 0 {
		t.Fatal("review did not clear hold")
	}
	otherEarnings := other.ok("GET", "/finance/earnings", nil, 200)["items"].([]any)
	if len(otherEarnings) != 1 || otherEarnings[0].(map[string]any)["amounts"].(map[string]any)["tutorNetPaise"].(float64) != 37501 {
		t.Fatal("replacement net changed", otherEarnings)
	}
	if len(tutor.ok("GET", "/finance/earnings", nil, 200)["items"].([]any)) != 1 {
		t.Fatal("old tutor received replacement earnings")
	}
}
