package storage

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

func TestMongoTrialCompletionMigration(t *testing.T) {
	uri := os.Getenv("TEST_MONGODB_URI")
	if uri == "" {
		t.Skip("TEST_MONGODB_URI required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	s, err := Connect(ctx, uri, fmt.Sprintf("tutor_test_trial_migration_%d", time.Now().UnixNano()))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Client.Disconnect(ctx)
	if err = s.MigrateTrials(ctx); err == nil {
		t.Fatal("trial-only migration silently created an unvalidated core collection")
	}
	legacy := bson.M{"_id": "legacy", "status": "confirmed", "end": time.Now().UTC(), "notes": "Retained fictional notes"}
	if _, err = s.C("trials").InsertOne(ctx, legacy); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if err = s.MigrateTrials(ctx); err != nil {
			t.Fatal(err)
		}
	}
	names, err := s.DB.ListCollectionNames(ctx, bson.M{})
	if err != nil || len(names) != 1 || names[0] != "trials" {
		t.Fatal("trial-only migration changed collection scope", names, err)
	}
	if _, err = One[bson.M](ctx, s, "trials", legacy); err != nil {
		t.Fatal("trial-only migration changed retained fields", err)
	}
	indexes, err := s.C("trials").Indexes().List(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer indexes.Close(ctx)
	var specs []struct {
		Key bson.D `bson:"key"`
	}
	if err = indexes.All(ctx, &specs); err != nil {
		t.Fatal(err)
	}
	if len(specs) != 2 || fmt.Sprint(specs[1].Key) != fmt.Sprint(bson.D{{Key: "status", Value: int32(1)}, {Key: "end", Value: int32(1)}, {Key: "_id", Value: int32(1)}}) {
		t.Fatal("completion index is missing, unordered or duplicated", specs)
	}
	t.Log("Isolated migration database retained:", s.DB.Name())
}
