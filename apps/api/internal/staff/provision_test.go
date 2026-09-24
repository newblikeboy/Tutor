package staff

import (
	"context"
	"go.mongodb.org/mongo-driver/v2/bson"
	"os"
	"strconv"
	"testing"
	"time"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/password"
	"tutorplatform/internal/storage"
)

func TestMongoStaffProvisioning(t *testing.T) {
	uri := os.Getenv("TEST_MONGODB_URI")
	if uri == "" {
		t.Skip("TEST_MONGODB_URI required")
	}
	ctx := context.Background()
	s, e := storage.Connect(ctx, uri, "tutor_test_staff_"+strconv.FormatInt(time.Now().UnixNano(), 10))
	if e != nil {
		t.Fatal("database unavailable")
	}
	defer s.Client.Disconnect(ctx)
	if e = s.Migrate(ctx); e != nil {
		t.Fatal(e)
	}
	in := Input{Name: "Fictional scoped operator", Email: "  Staff.Test@Example.test ", Role: "support", Password: "Provisioning test passphrase 527!", Operator: "test-operator", Reason: "Provision support-only test operator."}
	if e = Provision(ctx, s, in); e != nil {
		t.Fatal(e)
	}
	u, e := storage.One[domain.User](ctx, s, "users", bson.M{"email": "staff.test@example.test"})
	if e != nil || u.Role != "support" || u.Sample {
		t.Fatal("incorrect staff account")
	}
	var c struct {
		Hash string `bson:"passwordHash"`
	}
	if e = s.C("credentials").FindOne(ctx, bson.M{"_id": u.Email}).Decode(&c); e != nil || !password.Verify(c.Hash, in.Password) || c.Hash == in.Password {
		t.Fatal("credential protection failed")
	}
	if n, _ := s.C("audit").CountDocuments(ctx, bson.M{"target": u.ID, "action": "staff.provisioned"}); n != 1 {
		t.Fatal("missing audit")
	}
	in.Role = "admin"
	if e = Provision(ctx, s, in); e == nil {
		t.Fatal("existing account overwritten")
	}
	u, _ = storage.One[domain.User](ctx, s, "users", bson.M{"_id": u.ID})
	if u.Role != "support" {
		t.Fatal("role escalated")
	}
	in.Email = "another@example.test"
	in.Role = "tutor"
	if e = Provision(ctx, s, in); e == nil {
		t.Fatal("public role accepted by staff tool")
	}
}
