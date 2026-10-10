package app

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"go.mongodb.org/mongo-driver/v2/bson"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"
	"tutorplatform/internal/config"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/payments"
	"tutorplatform/internal/storage"
)

// This stub tests Razorpay semantics; runtime simulation uses its own labelled checkout.
type paymentTestGateway struct {
	mu                      sync.Mutex
	orders                  map[string]payments.Order
	payments                map[string]payments.Payment
	refunds                 map[string]payments.Refund
	orderCalls, refundCalls int
}

func (g *paymentTestGateway) CreateOrder(_ context.Context, n int64, receipt string) (payments.Order, error) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.orderCalls++
	v := payments.Order{ID: "order_" + receipt, Amount: n, Currency: "INR", Receipt: receipt, Status: "created"}
	g.orders[v.ID] = v
	return v, nil
}
func (g *paymentTestGateway) OrdersByReceipt(_ context.Context, receipt string) ([]payments.Order, error) {
	g.mu.Lock()
	defer g.mu.Unlock()
	out := []payments.Order{}
	for _, v := range g.orders {
		if v.Receipt == receipt {
			out = append(out, v)
		}
	}
	return out, nil
}
func (g *paymentTestGateway) FetchPayment(_ context.Context, id string) (payments.Payment, error) {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.payments[id], nil
}
func (g *paymentTestGateway) CreateRefund(_ context.Context, id string, n int64, receipt string) (payments.Refund, error) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.refundCalls++
	v := payments.Refund{ID: "rfnd_" + receipt, PaymentID: id, Amount: n, Receipt: receipt, Status: "processed"}
	g.refunds[v.ID] = v
	return v, nil
}
func (g *paymentTestGateway) FetchRefund(_ context.Context, id string) (payments.Refund, error) {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.refunds[id], nil
}
func (g *paymentTestGateway) PaymentRefunds(_ context.Context, id string) ([]payments.Refund, error) {
	g.mu.Lock()
	defer g.mu.Unlock()
	out := []payments.Refund{}
	for _, v := range g.refunds {
		if v.PaymentID == id {
			out = append(out, v)
		}
	}
	return out, nil
}
func signed(secret string, body []byte) string {
	h := hmac.New(sha256.New, []byte(secret))
	h.Write(body)
	return hex.EncodeToString(h.Sum(nil))
}
func TestMongoBillingLifecycle(t *testing.T) {
	uri := os.Getenv("TEST_MONGODB_URI")
	if uri == "" {
		t.Skip("TEST_MONGODB_URI required for real MongoDB billing lifecycle")
	}
	t.Setenv("SEED_PASSWORD", testPassword)
	ctx := context.Background()
	s, e := storage.Connect(ctx, uri, "tutor_test_billing_"+token()[:12])
	if e != nil {
		t.Fatal("database connection failed")
	}
	defer s.Client.Disconnect(ctx)
	if e = s.Migrate(ctx); e != nil {
		t.Fatal(e)
	}
	if e = s.Seed(ctx, "test"); e != nil {
		t.Fatal(e)
	}
	cfg := config.Config{Env: "test", AuthProvider: "password", Origin: "http://test.local", RazorpaySecret: "test-checkout-secret", RazorpayWebhookSecret: "test-webhook-secret"}
	a := New(s, cfg)
	g := &paymentTestGateway{orders: map[string]payments.Order{}, payments: map[string]payments.Payment{}, refunds: map[string]payments.Refund{}}
	srv := httptest.NewServer(a.Routes())
	defer srv.Close()
	client := func(id string) *testClient {
		jar, _ := cookiejar.New(nil)
		c := &testClient{t: t, http: &http.Client{Jar: jar, Timeout: 30 * time.Second}, base: srv.URL}
		c.login(id)
		return c
	}
	p, other, tutor, finance := client("parent-a"), client("parent-b"), client("tutor-meera"), client("finance-a")
	consent := p.ok("POST", "/consents", map[string]any{"relationship": "parent", "accepted": true}, 201)
	l := p.ok("POST", "/learners", map[string]any{"name": "Billing fixture learner", "class": 8, "board": "CBSE", "language": "Hindi", "kind": "minor", "consentId": consent["id"]}, 201)
	trial := domain.Trial{ID: "billing-reviewed-fixture", OwnerID: "parent-a", TutorID: "tutor-meera", MentorID: "mentor-a", LearnerID: l["id"].(string), LearnerName: "Billing fixture learner", Subject: "Mathematics", Class: 8, Status: "reviewed", Start: a.Now().Add(-48 * time.Hour), End: a.Now().Add(-47 * time.Hour)}
	if _, e = s.C("trials").InsertOne(ctx, trial); e != nil {
		t.Fatal(e)
	}
	av := defaultAvailability("tutor-meera")
	client("admin-a").setTestFees("tutor-meera", 100000)
	for d := 0; d < 7; d++ {
		av.Windows = append(av.Windows, domain.WeeklyWindow{Day: d, StartMinute: 0, EndMinute: 1440})
	}
	tutor.ok("PUT", "/availability", av, 200)
	create := func(days int) domain.Enrollment {
		first := a.Now().In(mustLocation()).AddDate(0, 0, days)
		current, err := storage.One[domain.Availability](ctx, s, "availability", bson.M{"_id": "tutor-meera"})
		if err != nil {
			t.Fatal(err)
		}
		status, _, raw := p.call("POST", "/enrollments", map[string]any{"trialId": trial.ID, "subjects": []string{"Mathematics"}, "packageMode": "online", "packagePeriod": "hour", "accepted": true, "offeringVersion": current.Version, "feeVersion": 2, "schedule": RecurrenceInput{StartDate: first.Format("2006-01-02"), Time: "10:00", Timezone: "Asia/Kolkata", Weekdays: []int{int(first.Weekday())}, Count: 1, Minutes: 60}}, map[string]string{"Idempotency-Key": token()})
		if status != 201 {
			t.Fatalf("proposal %d %s", status, raw)
		}
		var v domain.Enrollment
		json.Unmarshal(raw, &v)
		if v.Status != "awaiting_payment" || v.HoldUntil == nil {
			t.Fatal("booking did not hold classes directly for payment")
		}
		return v
	}
	v := create(3)
	t.Run("disabled provider does not create a pretend payment", func(t *testing.T) {
		p.ok("POST", "/enrollments/"+v.ID+"/payment", map[string]any{"retry": false}, 503)
		n, _ := s.C("payment_intents").CountDocuments(ctx, bson.M{})
		if n != 0 {
			t.Fatal("disabled provider created payment")
		}
	})
	a.Payments = g
	var intent domain.PaymentIntent
	t.Run("server pricing atomic retry and monetary ownership", func(t *testing.T) {
		p.ok("POST", "/enrollments/"+v.ID+"/payment", map[string]any{"retry": false, "amountPaise": 1}, 422)
		for n := 0; n < 2; n++ {
			status, _, raw := p.call("POST", "/enrollments/"+v.ID+"/payment", map[string]any{"retry": false}, map[string]string{"Idempotency-Key": "same-payment-request"})
			if status != 200 {
				t.Fatalf("checkout %d %s", status, raw)
			}
			var response struct {
				Intent domain.PaymentIntent `json:"intent"`
			}
			json.Unmarshal(raw, &response)
			intent = response.Intent
		}
		if intent.Amount != 100000 || g.orderCalls != 1 || intent.OrderID == "" {
			t.Fatal("price/retry failed")
		}
		other.ok("GET", "/billing/"+intent.ID, nil, 404)
		finance.ok("GET", "/billing/"+intent.ID, nil, 200)
	})
	payment := payments.Payment{ID: "pay_unitcapture", OrderID: intent.OrderID, Amount: intent.Amount, Currency: "INR", Status: "authorized"}
	g.payments[payment.ID] = payment
	t.Run("forged checkout and merely authorized payments do not activate classes", func(t *testing.T) {
		p.ok("POST", "/billing/"+intent.ID+"/verify", map[string]any{"paymentId": payment.ID, "signature": strings.Repeat("0", 64)}, 422)
		p.ok("POST", "/billing/"+intent.ID+"/verify", map[string]any{"paymentId": payment.ID, "signature": signed(cfg.RazorpaySecret, []byte(intent.OrderID+"|"+payment.ID))}, 409)
		stored, _ := storage.One[domain.Enrollment](ctx, s, "enrollments", bson.M{"_id": v.ID})
		if stored.Status != "awaiting_payment" {
			t.Fatal("authorization became tuition")
		}
	})
	payment.Status = "captured"
	payment.Captured = true
	g.payments[payment.ID] = payment
	t.Run("concurrent capture and later duplicate webhook create one ledger journal", func(t *testing.T) {
		var wg sync.WaitGroup
		errs := make(chan error, 2)
		for i := 0; i < 2; i++ {
			wg.Add(1)
			go func() { defer wg.Done(); errs <- a.applyCaptured(ctx, intent.ID, payment) }()
		}
		wg.Wait()
		close(errs)
		for er := range errs {
			if er != nil {
				t.Fatal(er)
			}
		}
		stored, _ := storage.One[domain.Enrollment](ctx, s, "enrollments", bson.M{"_id": v.ID})
		if stored.Status != "active" || stored.HoldUntil != nil {
			t.Fatal("capture did not promote held schedule")
		}
		body := []byte(`{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_unitcapture"}}}}`)
		for i := 0; i < 2; i++ {
			req, _ := http.NewRequest("POST", srv.URL+"/api/v1/webhooks/razorpay", strings.NewReader(string(body)))
			req.Header.Set("X-Razorpay-Signature", signed(cfg.RazorpayWebhookSecret, body))
			req.Header.Set("X-Razorpay-Event-Id", "unit-capture-event")
			res, er := http.DefaultClient.Do(req)
			if er != nil {
				t.Fatal(er)
			}
			res.Body.Close()
			if res.StatusCode != 200 {
				t.Fatal("webhook rejected", res.StatusCode)
			}
		}
		if _, e = a.runOneJob(ctx); e != nil {
			t.Fatal(e)
		}
		n, _ := s.C("ledger").CountDocuments(ctx, bson.M{"intentId": intent.ID})
		events, _ := s.C("webhook_events").CountDocuments(ctx, bson.M{})
		if n != 1 || events != 1 {
			t.Fatal("capture or event duplicated")
		}
	})
	t.Run("refund reservation prevents over-refund and separate finance review is required", func(t *testing.T) {
		status, rf, raw := p.call("POST", "/billing/"+intent.ID+"/refunds", map[string]any{"amountPaise": 40000, "reason": "Family requests an agreed partial refund."}, map[string]string{"Idempotency-Key": "refund-unique-request"})
		if status != 201 {
			t.Fatalf("refund %d %s", status, raw)
		}
		id := rf["id"].(string)
		status, _, _ = p.call("POST", "/billing/"+intent.ID+"/refunds", map[string]any{"amountPaise": 70000, "reason": "Cannot overdraw the captured balance."}, map[string]string{"Idempotency-Key": "refund-overdraw-request"})
		if status != 409 {
			t.Fatal("over-refund accepted")
		}
		p.ok("POST", "/refunds/"+id+"/action", map[string]any{"action": "approve", "reason": "Parent cannot approve their refund."}, 403)
		finance.ok("POST", "/refunds/"+id+"/action", map[string]any{"action": "approve", "reason": "Finance reviewed the unused teaching balance."}, 200)
		if _, e = a.runOneJob(ctx); e != nil {
			t.Fatal(e)
		}
		stored, _ := storage.One[domain.PaymentIntent](ctx, s, "payment_intents", bson.M{"_id": intent.ID})
		if stored.Refunded != 40000 || stored.RefundReserved != 0 {
			t.Fatal("processed refund balance incorrect")
		}
		refund := g.refunds["rfnd_"+id]
		if e = a.applyRefund(ctx, id, refund); e != nil {
			t.Fatal(e)
		}
		n, _ := s.C("ledger").CountDocuments(ctx, bson.M{"intentId": intent.ID})
		if n != 2 {
			t.Fatal("refund journal duplicate")
		}
	})
	t.Run("expired holds release reservations and late capture creates review rather than teaching", func(t *testing.T) {
		late := create(5)
		status, _, raw := p.call("POST", "/enrollments/"+late.ID+"/payment", map[string]any{"retry": false}, map[string]string{"Idempotency-Key": "late-capture-checkout"})
		if status != 200 {
			t.Fatal("checkout failed", string(raw))
		}
		var checkout struct {
			Intent domain.PaymentIntent `json:"intent"`
		}
		json.Unmarshal(raw, &checkout)
		now := a.Now().Add(16 * time.Minute)
		a.Now = func() time.Time { return now }
		if e = a.expireHolds(ctx); e != nil {
			t.Fatal(e)
		}
		p := payments.Payment{ID: "pay_late", OrderID: checkout.Intent.OrderID, Amount: checkout.Intent.Amount, Currency: "INR", Status: "captured", Captured: true}
		if e = a.applyCaptured(ctx, checkout.Intent.ID, p); e != nil {
			t.Fatal(e)
		}
		stored, _ := storage.One[domain.Enrollment](ctx, s, "enrollments", bson.M{"_id": late.ID})
		pi, _ := storage.One[domain.PaymentIntent](ctx, s, "payment_intents", bson.M{"_id": checkout.Intent.ID})
		if stored.Status != "expired" || pi.State != "refund_review" {
			t.Fatal("late payment activated expired tuition")
		}
		tutor.ok("GET", "/enrollments/"+late.ID, nil, 404)
		n, _ := s.C("classes").CountDocuments(ctx, bson.M{"enrollmentId": late.ID, "status": "scheduled"})
		if n != 0 {
			t.Fatal("late payment scheduled classes")
		}
	})
	t.Run("capacity reduction after hold records capture for refund review", func(t *testing.T) {
		v := create(8)
		status, _, raw := p.call("POST", "/enrollments/"+v.ID+"/payment", map[string]any{"retry": false}, map[string]string{"Idempotency-Key": "capacity-change-payment"})
		if status != 200 {
			t.Fatalf("checkout %d", status)
		}
		var checkout struct {
			Intent domain.PaymentIntent `json:"intent"`
		}
		json.Unmarshal(raw, &checkout)
		classes, e := storage.Many[domain.ClassSession](ctx, s, "classes", bson.M{"enrollmentId": v.ID})
		if e != nil {
			t.Fatal(e)
		}
		// A separate confirmed lesson already consumes this local day's capacity.
		otherClass := classes[0]
		otherClass.ID = "capacity-existing-lesson"
		otherClass.Start = otherClass.Start.Add(3 * time.Hour)
		otherClass.End = otherClass.End.Add(3 * time.Hour)
		if e = a.Store.Tx(ctx, func(ctx context.Context) error {
			return a.reserveClass(ctx, domain.Enrollment{LearnerID: "capacity-other-learner"}, otherClass, av, nil, false)
		}); e != nil {
			t.Fatal(e)
		}
		av.Version = 1
		av.DailyCapacity = 1
		tutor.ok("PUT", "/availability", av, 200)
		capture := payments.Payment{ID: "pay_capacity_changed", OrderID: checkout.Intent.OrderID, Amount: checkout.Intent.Amount, Currency: "INR", Status: "captured", Captured: true}
		if e = a.applyCaptured(ctx, checkout.Intent.ID, capture); e != nil {
			t.Fatal(e)
		}
		intent, _ := storage.One[domain.PaymentIntent](ctx, s, "payment_intents", bson.M{"_id": checkout.Intent.ID})
		if intent.State != "refund_review" {
			t.Fatal("capacity change did not preserve captured money for review")
		}
		n, _ := s.C("classes").CountDocuments(ctx, bson.M{"enrollmentId": v.ID, "status": "scheduled"})
		if n != 0 {
			t.Fatal("partial class promotion")
		}
		n, _ = s.C("ledger").CountDocuments(ctx, bson.M{"intentId": checkout.Intent.ID})
		if n != 1 {
			t.Fatal("capture journal missing")
		}
	})
	t.Run("failed refund releases reserved balance once without journal", func(t *testing.T) {
		status, rf, _ := p.call("POST", "/billing/"+intent.ID+"/refunds", map[string]any{"amountPaise": 10000, "reason": "Test provider failure and reserved balance."}, map[string]string{"Idempotency-Key": "failed-refund-request"})
		if status != 201 {
			t.Fatalf("refund %d", status)
		}
		id := rf["id"].(string)
		finance.ok("POST", "/refunds/"+id+"/action", map[string]any{"action": "approve", "reason": "Independent review of this refund request."}, 200)
		failed := payments.Refund{ID: "rfnd_failed_test", PaymentID: payment.ID, Amount: 10000, Receipt: id, Status: "failed"}
		for i := 0; i < 2; i++ {
			if e = a.applyRefund(ctx, id, failed); e != nil {
				t.Fatal(e)
			}
		}
		stored, _ := storage.One[domain.PaymentIntent](ctx, s, "payment_intents", bson.M{"_id": intent.ID})
		if stored.RefundReserved != 0 || stored.Refunded != 40000 {
			t.Fatal("failed refund changed actual refunded balance")
		}
		n, _ := s.C("ledger").CountDocuments(ctx, bson.M{"intentId": intent.ID})
		if n != 2 {
			t.Fatal("failed refund created journal")
		}
	})
	t.Run("explicit simulation persists once, activates classes and stays outside real finance", func(t *testing.T) {
		a.Config.PaymentProvider = "simulation"
		v := create(14)
		var checkout struct {
			Intent domain.PaymentIntent `json:"intent"`
		}
		for i := 0; i < 2; i++ {
			status, _, raw := p.call("POST", "/enrollments/"+v.ID+"/payment", map[string]any{"retry": true}, map[string]string{"Idempotency-Key": "simulation-checkout"})
			if status != 200 {
				t.Fatalf("test checkout %d %s", status, raw)
			}
			if err := json.Unmarshal(raw, &checkout); err != nil {
				t.Fatal(err)
			}
		}
		pi := checkout.Intent
		if pi.Provider != "simulation" || pi.State != "created" || pi.Amount != v.Agreement.TotalPaise || !strings.HasPrefix(pi.OrderID, "sim_order_") {
			t.Fatal("unlabelled or mispriced test order")
		}
		other.ok("POST", "/billing/"+pi.ID+"/simulate", map[string]any{"confirmed": true}, 404)
		tutor.ok("POST", "/billing/"+pi.ID+"/simulate", map[string]any{"confirmed": true}, 403)
		p.ok("POST", "/billing/"+intent.ID+"/simulate", map[string]any{"confirmed": true}, 404)
		p.ok("POST", "/billing/"+pi.ID+"/simulate", map[string]any{"confirmed": true, "amountPaise": 1}, 422)
		p.ok("POST", "/billing/"+pi.ID+"/simulate", map[string]any{"confirmed": false}, 422)
		p.ok("POST", "/billing/"+pi.ID+"/verify", map[string]any{"paymentId": "sim_pay_" + pi.ID, "signature": signed(cfg.RazorpaySecret, []byte(pi.OrderID+"|sim_pay_"+pi.ID))}, 422)
		capture := payments.Payment{ID: "forged_real_capture", OrderID: pi.OrderID, Amount: pi.Amount, Currency: "INR", Status: "captured", Captured: true}
		if err := a.applyCaptured(ctx, pi.ID, capture); err == nil {
			t.Fatal("real-provider capture accepted a simulated order")
		}
		before, _, err := a.paymentCollections(ctx)
		if err != nil {
			t.Fatal(err)
		}
		captureStatuses := make(chan int, 3)
		for i := 0; i < 3; i++ {
			go func() {
				status, _, _ := p.call("POST", "/billing/"+pi.ID+"/simulate", map[string]any{"confirmed": true}, nil)
				captureStatuses <- status
			}()
		}
		for i := 0; i < 3; i++ {
			if status := <-captureStatuses; status != 200 {
				t.Fatal("concurrent test capture", status)
			}
		}
		stored, err := storage.One[domain.PaymentIntent](ctx, s, "payment_intents", bson.M{"_id": pi.ID})
		if err != nil || stored.State != "captured" || stored.PaymentID != "sim_pay_"+pi.ID || stored.CapturedAt == nil {
			t.Fatal("test capture was not persisted", err)
		}
		paid, err := storage.One[domain.Enrollment](ctx, s, "enrollments", bson.M{"_id": v.ID})
		if err != nil || paid.Status != "active" || !paid.PaymentSimulated || paid.HoldUntil != nil {
			t.Fatal("test booking not activated", err)
		}
		classes, err := storage.Many[domain.ClassSession](ctx, s, "classes", bson.M{"enrollmentId": v.ID, "status": "scheduled"})
		if err != nil || len(classes) != v.Agreement.SessionCount {
			t.Fatal("test classes not scheduled", err)
		}
		tutor.ok("GET", "/enrollments/"+v.ID, nil, 200)
		p.ok("GET", "/billing/"+pi.ID, nil, 200)
		for _, recipient := range []string{"parent-a", "tutor-meera"} {
			u, err := storage.One[domain.User](ctx, s, "users", bson.M{"_id": recipient})
			if err != nil {
				t.Fatal(err)
			}
			email, err := a.emailTemplate(ctx, job{Kind: "email_event", Payload: map[string]string{"event": "booking_confirmed", "targetKind": "enrollment", "targetId": v.ID, "expectedStatus": "active", "tutorId": v.TutorID}}, u)
			if err != nil || !strings.HasPrefix(email.Title, "Test booking:") || !strings.Contains(email.Intro, "simulated payment") || !strings.Contains(email.Notice, "No money was charged") {
				t.Fatal("unlabelled test booking email", err)
			}
		}
		finance.ok("POST", "/billing/"+pi.ID+"/invoice", map[string]any{"number": "TEST/SIM/001", "issuerName": "Fictional supplier", "issuerAddress": "Fictional supplier office address", "customerName": "Fictional parent", "customerAddress": "Fictional family address", "supplyState": "10", "sac": "999293", "description": "Fictional simulated booking invoice rejection.", "gstBps": 0, "issuedAt": a.Now(), "confirmed": true}, 409)
		finished := classes[0]
		finished.Status, finished.Attendance, finished.End = "completed", "present", a.Now().Add(-time.Minute)
		if err := a.recognizeEarning(ctx, finished); err != nil {
			t.Fatal("test class earning handling", err)
		}
		after, _, err := a.paymentCollections(ctx)
		if err != nil || before != after {
			t.Fatal("simulation inflated collections", err)
		}
		for _, collection := range []string{"ledger", "finance_bookings", "paid_invoices"} {
			n, err := s.C(collection).CountDocuments(ctx, bson.M{"$or": bson.A{bson.M{"_id": pi.ID}, bson.M{"intentId": pi.ID}}})
			if err != nil || n != 0 {
				t.Fatal("simulation created real financial records", collection, err)
			}
		}
		n, err := s.C("notifications").CountDocuments(ctx, bson.M{"kind": "booking_confirmed", "targetId": v.ID})
		if err != nil || n != 1 {
			t.Fatal("duplicate booking notification", err)
		}
		refundStatus, _, refundBody := p.call("POST", "/billing/"+pi.ID+"/refunds", map[string]any{"amountPaise": 100, "reason": "Test simulation cannot refund real money."}, map[string]string{"Idempotency-Key": "simulation-refund"})
		if refundStatus != 409 {
			t.Fatalf("simulation refund %d %s", refundStatus, refundBody)
		}
		a.Config.PaymentProvider = "disabled"
		p.ok("POST", "/billing/"+pi.ID+"/simulate", map[string]any{"confirmed": true}, 503)
		p.ok("GET", "/billing/"+pi.ID, nil, 200)
		a.Config.PaymentProvider = "simulation"
		late := create(21)
		status, _, raw := p.call("POST", "/enrollments/"+late.ID+"/payment", map[string]any{"retry": true}, map[string]string{"Idempotency-Key": "simulation-expired"})
		if status != 200 {
			t.Fatalf("expired checkout %d %s", status, raw)
		}
		if err := json.Unmarshal(raw, &checkout); err != nil {
			t.Fatal(err)
		}
		expiredNow := a.Now().Add(16 * time.Minute)
		a.Now = func() time.Time { return expiredNow }
		p.ok("POST", "/billing/"+checkout.Intent.ID+"/simulate", map[string]any{"confirmed": true}, 409)
		uncaptured, err := storage.One[domain.PaymentIntent](ctx, s, "payment_intents", bson.M{"_id": checkout.Intent.ID})
		if err != nil || uncaptured.State != "created" || uncaptured.PaymentID != "" || uncaptured.CapturedAt != nil {
			t.Fatal("expired hold recorded pretend success", err)
		}
	})
}
