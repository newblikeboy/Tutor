package app

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
	"tutorplatform/internal/media"

	"go.mongodb.org/mongo-driver/v2/bson"
	"tutorplatform/internal/config"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/payments"
	"tutorplatform/internal/storage"
)

func TestStudyMonthEnd(t *testing.T) {
	for _, pair := range [][2]string{
		{"2026-01-31T17:00:00Z", "2026-02-28T17:00:00Z"},
		{"2028-01-31T17:00:00Z", "2028-02-29T17:00:00Z"},
		{"2026-12-17T10:10:00Z", "2027-01-17T10:10:00Z"},
		// This instant is already 1 February in India.
		{"2026-01-31T20:00:00Z", "2026-02-28T20:00:00Z"},
	} {
		start, _ := time.Parse(time.RFC3339, pair[0])
		if got := studyMonthEnd(start).Format(time.RFC3339); got != pair[1] {
			t.Fatalf("%s: %s != %s", pair[0], got, pair[1])
		}
	}
}

func TestStudySubscriptionsAndMaterials(t *testing.T) {
	uri := os.Getenv("TEST_MONGODB_URI")
	if uri == "" {
		t.Skip("TEST_MONGODB_URI required for subscription persistence tests")
	}
	t.Setenv("SEED_PASSWORD", testPassword)
	ctx := context.Background()
	s, err := storage.Connect(ctx, uri, "tutor_test_study_"+token()[:12])
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
	cfg := config.Config{Env: "test", AuthProvider: "password", Origin: "http://test.local", PaymentProvider: "simulation", RazorpaySecret: "fixture-study-secret"}
	a, second := New(s, cfg), New(s, cfg)
	firstServer, secondServer := httptest.NewServer(a.Routes()), httptest.NewServer(second.Routes())
	defer firstServer.Close()
	defer secondServer.Close()
	client := func(id, base string) *testClient {
		jar, _ := cookiejar.New(nil)
		c := &testClient{t: t, http: &http.Client{Jar: jar, Timeout: 25 * time.Second}, base: base}
		c.login(id)
		return c
	}
	p, other, admin, tutor, staff := client("parent-a", firstServer.URL), client("parent-b", firstServer.URL), client("admin-a", firstServer.URL), client("tutor-meera", firstServer.URL), client("finance-a", firstServer.URL)
	p2 := client("parent-a", secondServer.URL)
	createStudent := func(name string) string {
		return p.ok("POST", "/learners", LearnerInput{Name: name, Class: 8, Board: "CBSE", Language: "English", Kind: "adult_self"}, 201)["id"].(string)
	}
	learner, sibling := createStudent("Fictional study student"), createStudent("Fictional sibling")
	keyed := func(c *testClient, path string, input any, key string, want int) map[string]any {
		status, data, raw := c.call("POST", path, input, map[string]string{"Idempotency-Key": key})
		if status != want {
			t.Fatalf("%s: expected %d got %d %s", path, want, status, raw)
		}
		return data
	}
	toIntent := func(data map[string]any) domain.PaymentIntent {
		var v domain.PaymentIntent
		raw, _ := json.Marshal(data["intent"])
		if err := json.Unmarshal(raw, &v); err != nil {
			t.Fatal(err)
		}
		return v
	}
	zero := 0
	quiz := map[string]any{"title": "Fictional fractions quiz", "description": "Practice fractions", "kind": "quiz", "class": 8, "board": "CBSE", "subject": "Mathematics", "status": "published", "fileId": "", "questions": []domain.StudyQuestion{{Prompt: "One half equals which fraction?", Options: []string{"2/4", "3/4"}, CorrectOption: &zero}}, "expectedVersion": 0}
	p.ok("POST", "/admin/study-materials", quiz, 403)
	staff.ok("POST", "/admin/study-materials", quiz, 403)
	tutor.ok("GET", "/admin/study-materials", nil, 403)
	if status, _, _ := admin.call("POST", "/admin/study-materials", quiz, map[string]string{"X-CSRF-Token": "bad"}); status != 403 {
		t.Fatal("CSRF bypass", status)
	}
	m := admin.ok("POST", "/admin/study-materials", quiz, 201)
	id := m["id"].(string)
	admin.ok("GET", "/study/materials/"+id, nil, 200)
	path := "/study/materials/" + id + "?learner=" + learner
	p.ok("GET", path, nil, 403)
	other.ok("GET", path, nil, 404)
	tutor.ok("GET", path, nil, 403)
	list := p.ok("GET", "/study?learner="+learner, nil, 200)
	raw, _ := json.Marshal(list)
	if strings.Contains(string(raw), "correctOption") || strings.Contains(string(raw), "One half") || strings.Contains(string(raw), "Fictional fractions quiz") {
		t.Fatal("catalog leaks quiz contents", string(raw))
	}
	if list["active"] != false {
		t.Fatal("unpaid access", list)
	}
	other.ok("POST", "/learners/"+learner+"/study-payment", map[string]any{}, 404)
	tutor.ok("POST", "/learners/"+learner+"/study-payment", map[string]any{}, 403)
	// Concurrent independent HTTP servers converge on one chargeable order.
	var wg sync.WaitGroup
	intents := make(chan domain.PaymentIntent, 2)
	for _, c := range []*testClient{p, p2} {
		wg.Add(1)
		go func(c *testClient) {
			defer wg.Done()
			intents <- toIntent(keyed(c, "/learners/"+learner+"/study-payment", map[string]any{}, token(), 200))
		}(c)
	}
	wg.Wait()
	close(intents)
	var intent domain.PaymentIntent
	for v := range intents {
		if intent.ID != "" && v.ID != intent.ID {
			t.Fatal("duplicate chargeable order")
		}
		intent = v
	}
	if intent.Amount != 9900 || intent.Purpose != "study_subscription" || intent.LearnerID != learner || intent.EnrollmentID != "" {
		t.Fatal(intent)
	}
	other.ok("POST", "/billing/"+intent.ID+"/simulate", map[string]bool{"confirmed": true}, 404)
	p.ok("POST", "/billing/"+intent.ID+"/simulate", map[string]bool{"confirmed": false}, 422)
	for _, c := range []*testClient{p, p2} {
		wg.Add(1)
		go func(c *testClient) {
			defer wg.Done()
			c.ok("POST", "/billing/"+intent.ID+"/simulate", map[string]bool{"confirmed": true}, 200)
		}(c)
	}
	wg.Wait()
	access, active, err := a.studyEntitlement(ctx, "parent-a", learner)
	if err != nil || !active || !access.ExpiresAt.Equal(studyMonthEnd(access.StartsAt)) {
		t.Fatal(access, active, err)
	}
	if n, err := s.C("ledger").CountDocuments(ctx, bson.M{"intentId": intent.ID}); err != nil || n != 0 {
		t.Fatal("simulation created real ledger", n, err)
	}
	if n, _ := s.C("finance_bookings").CountDocuments(ctx, bson.M{"_id": intent.ID}); n != 0 {
		t.Fatal("study purchase became tutor earnings")
	}
	keyed(p, "/learners/"+learner+"/study-payment", map[string]any{}, token(), 409)
	p.ok("GET", "/study/materials/"+id+"?learner="+sibling, nil, 403)
	detail := p.ok("GET", path, nil, 200)
	raw, _ = json.Marshal(detail)
	if strings.Contains(string(raw), "correctOption") || !strings.Contains(string(raw), "One half") {
		t.Fatal("parent question DTO", string(raw))
	}
	attemptPath := "/study/materials/" + id + "/attempts"
	answer := map[string]any{"learnerId": learner, "version": 1, "answers": []int{0}}
	bad := map[string]any{"learnerId": learner, "version": 1, "answers": []int{10}}
	keyed(p, attemptPath, bad, token(), 422)
	attemptKey := token()
	result := keyed(p, attemptPath, answer, attemptKey, 201)
	if result["score"] != float64(1) || result["total"] != float64(1) {
		t.Fatal(result)
	}
	if repeat := keyed(p, attemptPath, answer, attemptKey, 201); repeat["id"] != result["id"] {
		t.Fatal("duplicate quiz attempt")
	}
	if n, _ := s.C("study_attempts").CountDocuments(ctx, bson.M{"learnerId": learner}); n != 1 {
		t.Fatal("attempt not idempotent", n)
	}
	// Published PDFs must be verified, bound to this material, and current.
	pdfInput := map[string]any{"title": "Fictional monthly paper", "description": "", "kind": "monthly_test", "class": 8, "board": "All", "subject": "Science", "status": "published", "fileId": "", "questions": []domain.StudyQuestion{}, "expectedVersion": 0}
	admin.ok("POST", "/admin/study-materials", pdfInput, 422)
	pdfInput["status"] = "draft"
	pdf := admin.ok("POST", "/admin/study-materials", pdfInput, 201)
	pdfID := pdf["id"].(string)
	f := domain.PrivateFile{ID: "study-file-" + token(), TargetKind: "study", TargetID: pdfID, UploaderID: "admin-a", ContentType: "application/pdf", Status: "ready", Provider: "cloudinary", PublicID: "private-uploads/fixture-paper", ResourceType: "raw", CreatedAt: a.Now()}
	if _, err := s.C("files").InsertOne(ctx, f); err != nil {
		t.Fatal(err)
	}
	pdfInput["fileId"], pdfInput["status"], pdfInput["expectedVersion"] = f.ID, "published", 1
	admin.ok("PUT", "/admin/study-materials/"+pdfID, pdfInput, 200)
	a.DirectFiles = media.NewCloudinaryDirect("fixture-cloud", "fixture-key", "fixture-secret")
	p.http.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	filePath := "/files/" + f.ID + "/download?learner=" + learner
	for _, suffix := range []string{"/view", "/download", "/play"} {
		p.ok("GET", "/files/"+f.ID+suffix, nil, 403)
		p.ok("GET", "/files/"+f.ID+suffix+"?learner="+sibling, nil, 403)
		other.ok("GET", "/files/"+f.ID+suffix+"?learner="+learner, nil, 404)
		tutor.ok("GET", "/files/"+f.ID+suffix+"?learner="+learner, nil, 404)
	}
	// A paid sibling cannot lend its licence to the selected unpaid student.
	if _, err := s.C("study_access").UpdateOne(ctx, bson.M{"_id": learner}, bson.M{"$set": bson.M{"expiresAt": a.Now().Add(45 * time.Second)}}); err != nil {
		t.Fatal(err)
	}
	response, err := p.http.Get(p.base + "/api/v1" + filePath)
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	location, _ := url.Parse(response.Header.Get("Location"))
	deadline, _ := strconv.ParseInt(location.Query().Get("expires_at"), 10, 64)
	nearEnd, _, _ := a.studyEntitlement(ctx, "parent-a", learner)
	if response.StatusCode != 302 || deadline != nearEnd.ExpiresAt.Unix() || response.Header.Get("Cache-Control") != "private, no-store" {
		t.Fatal("download outlives licence", response.StatusCode, location, deadline, nearEnd.ExpiresAt)
	}
	expiryFilePath := ""
	for _, kind := range []string{"notes", "unit_test", "mid_term"} {
		materialID, fileID := "material-"+token(), "file-"+token()
		material := domain.StudyMaterial{ID: materialID, Title: "Protected " + kind, Kind: kind, Class: 8, Board: "CBSE", Subject: "Mathematics", Status: "published", FileID: fileID, Version: 1}
		asset := f
		asset.ID, asset.ObjectKey, asset.TargetID = fileID, token(), materialID
		if _, err := s.C("study_materials").InsertOne(ctx, material); err != nil {
			t.Fatal(err)
		}
		if _, err := s.C("files").InsertOne(ctx, asset); err != nil {
			t.Fatal(err)
		}
		p.ok("GET", "/study/materials/"+materialID+"?learner="+sibling, nil, 403)
		p.ok("GET", "/files/"+fileID+"/download?learner="+sibling, nil, 403)
		p.ok("GET", "/files/"+fileID+"/download?learner="+learner, nil, 302)
		expiryFilePath = "/files/" + fileID + "/download?learner=" + learner
		anonymous, err := http.Get(p.base + "/api/v1/study/materials/" + materialID + "?learner=" + learner)
		if err != nil {
			t.Fatal(err)
		}
		anonymous.Body.Close()
		if anonymous.StatusCode != 401 {
			t.Fatal("anonymous paid content", anonymous.StatusCode)
		}
	}
	retired := f
	retired.ID = "retired-" + token()
	retired.ObjectKey = token()
	if _, err := s.C("files").InsertOne(ctx, retired); err != nil {
		t.Fatal(err)
	}
	p.ok("GET", "/files/"+retired.ID+"/download?learner="+learner, nil, 404)
	if err := a.studyFileAccess(ctx, domain.User{ID: "parent-a", Role: "parent"}, pdfID, true); err == nil {
		t.Fatal("parent uploaded paid content")
	}
	pdfInput["expectedVersion"], pdfInput["status"] = 2, "archived"
	admin.ok("PUT", "/admin/study-materials/"+pdfID, pdfInput, 200)
	if err := a.studyFileAccess(ctx, domain.User{ID: "parent-a", Role: "parent"}, pdfID, false); err == nil {
		t.Fatal("archived file access")
	}
	// Editing a quiz creates a new version; old scores keep their exact snapshot.
	quiz["expectedVersion"] = 1
	quiz["title"] = "Fictional revised quiz"
	admin.ok("PUT", "/admin/study-materials/"+id, quiz, 200)
	keyed(p, attemptPath, answer, token(), 409)
	stored, err := storage.One[domain.StudyAttempt](ctx, s, "study_attempts", bson.M{"_id": result["id"]})
	if err != nil || stored.MaterialVersion != 1 || stored.Title != "Fictional fractions quiz" || len(stored.Snapshot) != 1 {
		t.Fatal(stored, err)
	}
	// Exact expiry denies new content/attempts while preserving score history.
	if _, err := s.C("study_access").UpdateOne(ctx, bson.M{"_id": learner}, bson.M{"$set": bson.M{"expiresAt": a.Now()}}); err != nil {
		t.Fatal(err)
	}
	expired, _, _ := a.studyEntitlement(ctx, "parent-a", learner)
	clock := a.Now
	a.Now = func() time.Time { return expired.ExpiresAt }
	for _, delta := range []time.Duration{-time.Nanosecond, 0, time.Nanosecond} {
		a.Now = func() time.Time { return expired.ExpiresAt.Add(delta) }
		_, active, err := a.studyEntitlement(ctx, "parent-a", learner)
		if err != nil || active != (delta < 0) {
			t.Fatal("exclusive expiry", delta, active, err)
		}
	}
	a.Now = clock
	p.ok("GET", expiryFilePath, nil, 403)
	p.ok("GET", path, nil, 403)
	answer["version"] = 2
	keyed(p, attemptPath, answer, token(), 403)
	list = p.ok("GET", "/study?learner="+learner, nil, 200)
	if list["active"] != false || len(list["materials"].(map[string]any)["items"].([]any)) != 0 || len(list["attempts"].(map[string]any)["items"].([]any)) != 1 {
		t.Fatal(list)
	}
	renew := toIntent(keyed(p, "/learners/"+learner+"/study-payment", map[string]any{}, token(), 200))
	if renew.ID == intent.ID {
		t.Fatal("renewal reused captured order")
	}
	p.ok("POST", "/billing/"+renew.ID+"/simulate", map[string]bool{"confirmed": true}, 200)
	p.ok("GET", path, nil, 200)
	p.ok("DELETE", "/learners/"+learner, map[string]int{"expectedVersion": 1}, 409)
	// Real capture semantics use the existing provider adapter, never the client amount.
	a.Config.PaymentProvider = "razorpay"
	g := &paymentTestGateway{orders: map[string]payments.Order{}, payments: map[string]payments.Payment{}, refunds: map[string]payments.Refund{}}
	a.Payments = g
	if _, active, _ := a.studyEntitlement(ctx, "parent-a", learner); active {
		t.Fatal("test subscription survived provider switch")
	}
	realIntent := toIntent(keyed(p, "/learners/"+sibling+"/study-payment", map[string]any{}, token(), 200))
	proof := payments.Payment{ID: "pay_" + token(), OrderID: realIntent.OrderID, Amount: 9900, Currency: "INR", Status: "captured", Captured: true}
	badProof := proof
	badProof.Amount = 1
	if err := a.applyCaptured(ctx, realIntent.ID, badProof); err == nil {
		t.Fatal("underpaid subscription activated")
	}
	badProof = proof
	badProof.Simulated = true
	if err := a.applyCaptured(ctx, realIntent.ID, badProof); err == nil {
		t.Fatal("simulated proof activated real subscription")
	}
	if err := a.applyCaptured(ctx, realIntent.ID, proof); err != nil {
		t.Fatal(err)
	}
	if err := a.applyCaptured(ctx, realIntent.ID, proof); err != nil {
		t.Fatal(err)
	}
	if n, _ := s.C("ledger").CountDocuments(ctx, bson.M{"intentId": realIntent.ID, "credit": "study_subscriptions"}); n != 1 {
		t.Fatal("capture double credit", n)
	}
	if _, active, err := a.studyEntitlement(ctx, "parent-a", sibling); err != nil || !active {
		t.Fatal("verified capture not active", err)
	}
	refund := domain.RefundRequest{ID: "refund-" + token(), IntentID: realIntent.ID, OwnerID: "parent-a", Amount: 9900, Status: "approved", RequestedBy: "parent-a", CreatedAt: a.Now()}
	if _, err := s.C("refunds").InsertOne(ctx, refund); err != nil {
		t.Fatal(err)
	}
	if _, err := s.C("payment_intents").UpdateOne(ctx, bson.M{"_id": realIntent.ID}, bson.M{"$set": bson.M{"refundReservedPaise": 9900}}); err != nil {
		t.Fatal(err)
	}
	if err := a.applyRefund(ctx, refund.ID, payments.Refund{ID: "rfnd_" + token(), PaymentID: proof.ID, Receipt: refund.ID, Amount: 9900, Status: "processed"}); err != nil {
		t.Fatal(err)
	}
	if _, active, _ := a.studyEntitlement(ctx, "parent-a", sibling); active {
		t.Fatal("refunded access retained")
	}
	if n, _ := s.C("ledger").CountDocuments(ctx, bson.M{"intentId": realIntent.ID, "debit": "study_subscriptions"}); n != 1 {
		t.Fatal("refund journal missing", n)
	}
}
