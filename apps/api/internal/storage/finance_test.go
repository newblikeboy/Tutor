package storage

import (
	"context"
	"fmt"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"os"
	"testing"
	"time"
)

func TestMongoFinanceMigration(t *testing.T) {
	uri := os.Getenv("TEST_MONGODB_URI")
	if uri == "" {
		t.Skip("TEST_MONGODB_URI required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	s, err := Connect(ctx, uri, fmt.Sprintf("tutor_test_finance_migration_%d", time.Now().UnixNano()))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Client.Disconnect(ctx)
	if _, err = s.C("legacy_probe").InsertOne(ctx, bson.M{"_id": "preserved", "value": "unchanged"}); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if err = s.MigrateFinance(ctx); err != nil {
			t.Fatal(err)
		}
	}
	names, err := s.DB.ListCollectionNames(ctx, bson.M{})
	if err != nil {
		t.Fatal(err)
	}
	if len(names) != 9 {
		t.Fatalf("unexpected migration scope: %v", names)
	}
	if _, err = One[bson.M](ctx, s, "legacy_probe", bson.M{"_id": "preserved", "value": "unchanged"}); err != nil {
		t.Fatal("legacy data changed", err)
	}
	batch := bson.M{"_id": "batch-a", "tutorId": "sample-tutor", "amountPaise": 75000, "classIds": []string{"sample-class"}, "status": "verification_pending", "createdBy": "sample-finance", "reference": "SAMPLEUTR1234"}
	if _, err = s.C("payout_batches").InsertOne(ctx, batch); err != nil {
		t.Fatal(err)
	}
	batch["_id"] = "batch-b"
	if _, err = s.C("payout_batches").InsertOne(ctx, batch); !mongo.IsDuplicateKeyError(err) {
		t.Fatal("duplicate bank reference accepted", err)
	}
	invoice := bson.M{"_id": "invoice-a", "ownerId": "sample-parent", "number": "SAMPLE/1", "issuerName": "Sample supplier", "issuerGstin": "", "totalPaise": 100000, "issuedAt": time.Now().UTC(), "recordedBy": "sample-finance"}
	if _, err = s.C("paid_invoices").InsertOne(ctx, invoice); err != nil {
		t.Fatal(err)
	}
	invoice["_id"] = "invoice-b"
	if _, err = s.C("paid_invoices").InsertOne(ctx, invoice); !mongo.IsDuplicateKeyError(err) {
		t.Fatal("duplicate supplier invoice accepted", err)
	}
	if _, err = s.C("class_earnings").InsertOne(ctx, bson.M{"_id": "incomplete"}); err == nil {
		t.Fatal("finance schema validation missing")
	}
}
