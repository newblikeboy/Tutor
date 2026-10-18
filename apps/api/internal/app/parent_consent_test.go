package app

import (
	"context"
	"go.mongodb.org/mongo-driver/v2/bson"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"testing"
	"tutorplatform/internal/config"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
)

// Exercise the production policy through HTTPS and actual MongoDB transactions.
// Seeded users and simulated captures stay in a newly named test database.
func TestProductionParentDeclarationWithoutAdminReview(t *testing.T) {
	uri := os.Getenv("TEST_MONGODB_URI")
	if uri == "" {
		t.Skip("TEST_MONGODB_URI required")
	}
	t.Setenv("SEED_PASSWORD", testPassword)
	ctx := context.Background()
	s, err := storage.Connect(ctx, uri, "tutor_test_parent_consent_"+token()[:12])
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
	if _, err = s.C("users").UpdateMany(ctx, bson.M{}, bson.M{"$set": bson.M{"sample": false}}); err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{Env: "production", AuthProvider: "password", Origin: "https://test.local", PaymentProvider: "simulation"}
	a := New(s, cfg)
	server := httptest.NewTLSServer(a.Routes())
	defer server.Close()
	client := func(id string) *testClient {
		jar, _ := cookiejar.New(nil)
		h := *server.Client()
		h.Jar = jar
		c := &testClient{t: t, http: &h, base: server.URL}
		status, v, raw := c.call("POST", "/auth/login", map[string]string{"email": id + "@example.test", "password": testPassword}, map[string]string{"Origin": cfg.Origin})
		if status != 200 {
			t.Fatalf("login %d %s", status, raw)
		}
		c.csrf = v["csrf"].(string)
		return c
	}
	parent, other, admin, tutor := client("parent-a"), client("parent-b"), client("admin-a"), client("tutor-meera")
	call := func(c *testClient, method, path string, body any, want int) map[string]any {
		t.Helper()
		status, v, raw := c.call(method, path, body, map[string]string{"Origin": cfg.Origin, "Idempotency-Key": token()})
		if status != want {
			t.Fatalf("%s %s: %d want %d %s", method, path, status, want, raw)
		}
		return v
	}
	input := map[string]any{"relationship": "parent", "accepted": true}
	call(parent, "POST", "/consents", map[string]any{"relationship": "parent", "accepted": false}, 422)
	call(parent, "POST", "/consents", map[string]any{"relationship": "friend", "accepted": true}, 422)
	call(parent, "POST", "/consents", map[string]any{"relationship": "parent", "accepted": true, "verification": "verified"}, 422)
	call(tutor, "POST", "/consents", input, 403)
	if status, _, _ := parent.call("POST", "/consents", input, map[string]string{"Origin": cfg.Origin, "X-CSRF-Token": "bad"}); status != 403 {
		t.Fatal("CSRF bypass")
	}
	consent := call(parent, "POST", "/consents", input, 201)
	if consent["version"] != "parent-consent-v1" || consent["verification"] != "parent_declaration_only" {
		t.Fatal("declaration mislabelled", consent)
	}
	profile := map[string]any{"name": "Fictional consent student", "class": 8, "board": "CBSE", "language": "English", "kind": "minor", "consentId": ""}
	call(parent, "POST", "/learners", profile, 403)
	foreign := call(other, "POST", "/consents", input, 201)
	profile["consentId"] = foreign["id"]
	call(parent, "POST", "/learners", profile, 403)
	profile["consentId"] = consent["id"]
	student := call(parent, "POST", "/learners", profile, 201)
	id := student["id"].(string)
	library := call(parent, "GET", "/study?learner="+id, nil, 200)
	if library["active"] != false || len(library["materials"].(map[string]any)["items"].([]any)) != 0 {
		t.Fatal("declaration unlocked content", library)
	}
	call(other, "GET", "/study?learner="+id, nil, 404)
	zero := 0
	quiz := map[string]any{"title": "Fictional consent quiz", "description": "Test fixture", "kind": "quiz", "class": 8, "board": "CBSE", "subject": "Mathematics", "status": "published", "fileId": "", "questions": []domain.StudyQuestion{{Prompt: "Which answer is correct?", Options: []string{"First", "Second"}, CorrectOption: &zero}}, "expectedVersion": 0}
	material := call(admin, "POST", "/admin/study-materials", quiz, 201)
	path := "/study/materials/" + material["id"].(string) + "?learner=" + id
	call(parent, "GET", path, nil, 403)
	intent := call(parent, "POST", "/learners/"+id+"/study-payment", map[string]any{}, 200)["intent"].(map[string]any)
	call(parent, "POST", "/billing/"+intent["id"].(string)+"/simulate", map[string]bool{"confirmed": true}, 200)
	call(parent, "GET", path, nil, 200)
	if _, err = s.C("study_access").UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"expiresAt": a.Now()}}); err != nil {
		t.Fatal(err)
	}
	call(parent, "GET", path, nil, 403)
	// An existing declaration remains consent; it is never upgraded to verified identity.
	legacy := domain.Consent{ID: "legacy-parent-consent", OwnerID: "parent-a", Relationship: "parent", Version: "guardian-draft-v1", At: a.Now(), Verification: "development_declaration_only"}
	if _, err = s.C("consents").InsertOne(ctx, legacy); err != nil {
		t.Fatal(err)
	}
	profile["consentId"] = legacy.ID
	call(parent, "POST", "/learners", profile, 201)
	unchanged, err := storage.One[domain.Consent](ctx, s, "consents", bson.M{"_id": legacy.ID})
	if err != nil || unchanged.Version != legacy.Version || unchanged.Verification != legacy.Verification || unchanged.At.UnixMilli() != legacy.At.UnixMilli() {
		t.Fatal("legacy declaration rewritten", err)
	}
	// Recover a missing consent without admin approval, while retaining ownership/version checks.
	old := domain.Learner{ID: "consent-recovery-student", OwnerID: "parent-a", Name: "Fictional recovery student", Class: 8, Board: "CBSE", Language: "English", Kind: "minor", Version: 1}
	if _, err = s.C("learners").InsertOne(ctx, old); err != nil {
		t.Fatal(err)
	}
	call(parent, "GET", "/study?learner="+old.ID, nil, 403)
	edit := map[string]any{"name": old.Name, "class": old.Class, "board": old.Board, "language": old.Language, "expectedVersion": 1, "consentId": foreign["id"]}
	call(parent, "PUT", "/learners/"+old.ID, edit, 403)
	edit["consentId"] = consent["id"]
	call(other, "PUT", "/learners/"+old.ID, edit, 404)
	call(parent, "PUT", "/learners/"+old.ID, edit, 200)
	call(parent, "PUT", "/learners/"+old.ID, edit, 409)
	call(parent, "GET", "/study?learner="+old.ID, nil, 200)
	call(admin, "GET", "/admin/guardian-consents", nil, 404)
}
