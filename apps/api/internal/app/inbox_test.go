package app

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"tutorplatform/internal/config"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
)

func TestEncryptedInbox(t *testing.T) {
	uri := os.Getenv("TEST_MONGODB_URI")
	if uri == "" {
		t.Skip("TEST_MONGODB_URI required for inbox integration")
	}
	t.Setenv("SEED_PASSWORD", testPassword)
	ctx := context.Background()
	s, err := storage.Connect(ctx, uri, "tutor_test_inbox_"+token()[:12])
	if err != nil {
		t.Fatal(err)
	}
	defer s.Client.Disconnect(ctx)
	if err = s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	if err = s.MigrateInbox(ctx); err != nil {
		t.Fatal(err)
	}
	if err = s.Seed(ctx, "test"); err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{Env: "test", AuthProvider: "password", Origin: "http://test.local"}
	a := New(s, cfg)
	srv := httptest.NewServer(a.Routes())
	defer srv.Close()
	srv2 := httptest.NewServer(New(s, cfg).Routes())
	defer srv2.Close()
	client := func(id, base string) *testClient {
		jar, _ := cookiejar.New(nil)
		c := &testClient{t: t, http: &http.Client{Jar: jar, Timeout: 30 * time.Second}, base: base}
		c.login(id)
		return c
	}
	admin := client("admin-a", srv.URL)
	admin2 := client("admin-a", srv2.URL)
	parent := client("parent-a", srv.URL)
	other := client("parent-b", srv.URL)
	tutor := client("tutor-meera", srv.URL)
	applicant := client("tutor-a", srv.URL)
	finance := client("finance-a", srv.URL)
	keys := map[string]domain.InboxKey{}
	signing := map[string]*ecdsa.PrivateKey{}
	b64 := func(b []byte) string { return base64.StdEncoding.EncodeToString(b) }
	sign := func(id string, fields []string) string {
		t.Helper()
		b, _ := json.Marshal(fields)
		h := sha256.Sum256(b)
		r, v, e := ecdsa.Sign(rand.Reader, signing[id], h[:])
		if e != nil {
			t.Fatal(e)
		}
		raw := make([]byte, 64)
		r.FillBytes(raw[:32])
		v.FillBytes(raw[32:])
		return b64(raw)
	}
	// Wire-shape fixtures: browser tests separately exercise real encrypted content/vaults.
	rsaKey, err := rsa.GenerateKey(rand.Reader, 3072)
	if err != nil {
		t.Fatal(err)
	}
	rsaDER, _ := x509.MarshalPKIXPublicKey(&rsaKey.PublicKey)
	setup := func(c *testClient, id string) {
		t.Helper()
		private, e := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
		if e != nil {
			t.Fatal(e)
		}
		signing[id] = private
		public, _ := x509.MarshalPKIXPublicKey(&private.PublicKey)
		k := domain.InboxKey{ID: id, Version: 1, EncryptionKey: b64(rsaDER), SigningKey: b64(public), Salt: b64(make([]byte, 32)), IV: b64(make([]byte, 12)), Vault: b64(make([]byte, 2200))}
		hash := sha256.Sum256([]byte(k.EncryptionKey + "." + k.SigningKey))
		k.Fingerprint = hex.EncodeToString(hash[:])
		keys[id] = k
		input := struct {
			domain.InboxKey
			Proof string `json:"proof"`
		}{k, sign(id, inboxKeyFields(k))}
		c.ok("POST", "/inbox/key", input, 201)
		c.ok("POST", "/inbox/key", input, 200)
		changed := input
		changed.Salt = b64(append([]byte{1}, make([]byte, 31)...))
		changed.Proof = sign(id, inboxKeyFields(changed.InboxKey))
		c.ok("POST", "/inbox/key", changed, 409)
	}
	setup(admin, "admin-a")
	setup(parent, "parent-a")
	setup(tutor, "tutor-meera")
	setup(applicant, "tutor-a")
	makeEnvelope := func(from, to, enrollment string) domain.InboxEnvelope {
		v := domain.InboxEnvelope{Version: 1, Nonce: token()[:32], RecipientID: to, EnrollmentID: enrollment, SenderFingerprint: keys[from].Fingerprint, RecipientFingerprint: keys[to].Fingerprint, IV: b64(make([]byte, 12)), Ciphertext: b64(make([]byte, 80)), SenderWrappedKey: b64(make([]byte, 384)), RecipientWrappedKey: b64(make([]byte, 384))}
		v.Signature = sign(from, inboxEnvelopeFields(from, v))
		return v
	}
	deliver := func(c *testClient, v domain.InboxEnvelope, key string, want int) domain.InboxUpdate {
		t.Helper()
		status, _, raw := c.call("POST", "/inbox", v, map[string]string{"Idempotency-Key": key})
		if status != want {
			t.Fatalf("send expected %d got %d: %s", want, status, raw)
		}
		var message domain.InboxUpdate
		_ = json.Unmarshal(raw, &message)
		return message
	}
	t.Run("keys stay private, roles and unactivated recipients are enforced", func(t *testing.T) {
		finance.ok("GET", "/inbox", nil, 403)
		finance.ok("GET", "/inbox/key", nil, 403)
		parent.ok("GET", "/inbox/recipients", nil, 403)
		applicant.ok("GET", "/inbox/key", nil, 200)
		applicant.ok("GET", "/inbox/recipients", nil, 200)
		admin.ok("GET", "/inbox/recipients/parent-b/key", nil, 409)
		_, _, raw := admin.call("GET", "/inbox/recipients/parent-a/key", nil, nil)
		if strings.Contains(string(raw), "vault") || strings.Contains(string(raw), "salt") {
			t.Fatal("private vault leaked in recipient directory")
		}
		list := admin.ok("GET", "/inbox/recipients?role=parent&search=Sample", nil, 200)
		if strings.Contains(toJSON(list), "email") {
			t.Fatal("contact details leaked")
		}
		admin.ok("GET", "/inbox/recipients?role=admin", nil, 422)
		admin.ok("POST", "/inbox", map[string]string{"subject": "plaintext must be rejected"}, 422)
	})
	var update domain.InboxUpdate
	t.Run("signed sending is idempotent across API instances", func(t *testing.T) {
		v := makeEnvelope("admin-a", "parent-a", "")
		var results [2]domain.InboxUpdate
		var wg sync.WaitGroup
		wg.Add(2)
		for i, c := range []*testClient{admin, admin2} {
			go func(i int, c *testClient) { defer wg.Done(); results[i] = deliver(c, v, "same-encrypted-update", 201) }(i, c)
		}
		wg.Wait()
		if results[0].ID == "" || results[0].ID != results[1].ID {
			t.Fatal("retry duplicated update")
		}
		update = results[0]
		v.Ciphertext = b64(make([]byte, 81))
		deliver(admin, v, "altered-message-key", 422)
		parent.ok("POST", "/inbox", makeEnvelope("parent-a", "tutor-meera", ""), 403)
		admin.ok("POST", "/inbox", makeEnvelope("admin-a", "parent-a", ""), 422)
	})
	t.Run("recipient-only signed read receipt is durable and does not acknowledge list or detail fetches", func(t *testing.T) {
		if parent.ok("GET", "/inbox/status", nil, 200)["unreadCount"] != float64(1) {
			t.Fatal("missing unread")
		}
		parent.ok("GET", "/inbox", nil, 200)
		parent.ok("GET", "/inbox/"+update.ID, nil, 200)
		other.ok("GET", "/inbox/"+update.ID, nil, 404)
		finance.ok("GET", "/inbox/"+update.ID, nil, 403)
		if parent.ok("GET", "/inbox/status", nil, 200)["unreadCount"] != float64(1) {
			t.Fatal("fetch incorrectly marked read")
		}
		fields := []string{"gyansetu-read-v1", update.ID, update.Nonce, update.RecipientFingerprint}
		parent.ok("POST", "/inbox/"+update.ID+"/read", map[string]string{"signature": sign("admin-a", fields)}, 422)
		admin.ok("POST", "/inbox/"+update.ID+"/read", map[string]string{"signature": sign("parent-a", fields)}, 403)
		other.ok("POST", "/inbox/"+update.ID+"/read", map[string]string{"signature": sign("parent-a", fields)}, 404)
		body := map[string]string{"signature": sign("parent-a", fields)}
		status, _, _ := parent.call("POST", "/inbox/"+update.ID+"/read", body, map[string]string{"X-CSRF-Token": ""})
		if status != 403 {
			t.Fatal("CSRF bypass")
		}
		parent.ok("POST", "/inbox/"+update.ID+"/read", body, 200)
		first := admin.ok("GET", "/inbox/"+update.ID, nil, 200)["message"].(map[string]any)["readAt"]
		parent.ok("POST", "/inbox/"+update.ID+"/read", body, 200)
		if first == nil || admin.ok("GET", "/inbox/"+update.ID, nil, 200)["message"].(map[string]any)["readAt"] != first {
			t.Fatal("first read timestamp changed")
		}
		if parent.ok("GET", "/inbox/status", nil, 200)["unreadCount"] != float64(0) {
			t.Fatal("read count stale")
		}
	})
	t.Run("admin can deliver to applicants and tutors cannot enumerate unrelated parents", func(t *testing.T) {
		v := deliver(admin, makeEnvelope("admin-a", "tutor-a", ""), "admin-applicant-update", 201)
		applicant.ok("GET", "/inbox/"+v.ID, nil, 200)
		applicant.ok("POST", "/inbox/"+v.ID+"/read", map[string]string{"signature": sign("tutor-a", []string{"gyansetu-read-v1", v.ID, v.Nonce, v.RecipientFingerprint})}, 200)
		tutor.ok("GET", "/inbox/recipients/parent-b/key?enrollmentId=unrelated", nil, 404)
		deliver(applicant, makeEnvelope("tutor-a", "parent-a", "absent"), "applicant-cannot-send", 403)
	})
	t.Run("tutor sending and historical access stop after reassignment or suspension", func(t *testing.T) {
		enrollment := domain.Enrollment{ID: "inbox-assignment", OwnerID: "parent-a", TutorID: "tutor-meera", MentorID: "mentor-a", LearnerID: "fictional-learner", Status: "active", Version: 1}
		if _, err := s.C("enrollments").InsertOne(ctx, enrollment); err != nil {
			t.Fatal(err)
		}
		tutor.ok("GET", "/inbox/recipients/parent-a/key?enrollmentId=inbox-assignment", nil, 200)
		v := deliver(tutor, makeEnvelope("tutor-meera", "parent-a", enrollment.ID), "assigned-parent-update", 201)
		if _, err := s.C("enrollments").UpdateOne(ctx, bson.M{"_id": enrollment.ID}, bson.M{"$set": bson.M{"tutorId": "tutor-arjun"}}); err != nil {
			t.Fatal(err)
		}
		tutor.ok("GET", "/inbox/"+v.ID, nil, 404)
		parent.ok("GET", "/inbox/"+v.ID, nil, 200)
		if len(tutor.ok("GET", "/inbox?folder=sent", nil, 200)["items"].([]any)) != 0 {
			t.Fatal("old tutor retained sent messages")
		}
		deliver(tutor, makeEnvelope("tutor-meera", "parent-a", enrollment.ID), "revoked-assignment-update", 404)
		if _, err := s.C("enrollments").UpdateOne(ctx, bson.M{"_id": enrollment.ID}, bson.M{"$set": bson.M{"tutorId": "tutor-meera"}}); err != nil {
			t.Fatal(err)
		}
		if _, err := s.C("applications").UpdateOne(ctx, bson.M{"_id": "tutor-meera"}, bson.M{"$set": bson.M{"status": "suspended"}}); err != nil {
			t.Fatal(err)
		}
		tutor.ok("GET", "/inbox/"+v.ID, nil, 404)
		deliver(tutor, makeEnvelope("tutor-meera", "parent-a", enrollment.ID), "suspended-update", 403)
	})
	t.Run("newest-first pages are bounded and exclude unrelated recipients", func(t *testing.T) {
		for i := 0; i < 28; i++ {
			v := update
			v.ID = a.chronologicalID()
			v.Nonce = token()[:32]
			if _, err := s.C("inbox_updates").InsertOne(ctx, v); err != nil {
				t.Fatal(err)
			}
		}
		page := parent.ok("GET", "/inbox", nil, 200)
		if len(page["items"].([]any)) != 25 || page["nextCursor"] == "" {
			t.Fatal("unbounded or missing cursor")
		}
		next := parent.ok("GET", "/inbox?cursor="+page["nextCursor"].(string), nil, 200)
		if len(next["items"].([]any)) != 5 {
			t.Fatal("pagination lost updates")
		}
		if len(other.ok("GET", "/inbox", nil, 200)["items"].([]any)) != 0 {
			t.Fatal("other household leakage")
		}
	})
}

func toJSON(value any) string { b, _ := json.Marshal(value); return string(b) }
