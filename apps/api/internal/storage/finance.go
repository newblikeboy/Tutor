package storage

import (
	"context"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"time"
)

// MigrateFinance adds finance validation and indexes without rewriting historical records.
// It is safe to repeat and runs before an existing deployment activates new code.
func (s *Store) MigrateFinance(ctx context.Context) error {
	required := map[string][]string{}
	required["business_settings"] = []string{"version", "legalName", "gstin", "reviewed"}
	required["paid_invoices"] = []string{"ownerId", "number", "issuerName", "totalPaise", "issuedAt", "recordedBy"}
	required["finance_bookings"] = []string{"enrollmentId", "tutorId", "status", "amounts"}
	required["class_earnings"] = []string{"intentId", "tutorId", "amounts", "dueAt", "batchId"}
	required["earning_holds"] = []string{"intentId", "tutorId", "reason", "updatedAt"}
	required["class_tax_reviews"] = []string{"tutorId", "amounts", "tax", "reviewedBy"}
	required["payout_batches"] = []string{"tutorId", "amountPaise", "classIds", "status", "createdBy"}
	names, err := s.DB.ListCollectionNames(ctx, bson.M{})
	if err != nil {
		return err
	}
	exists := map[string]bool{}
	for _, name := range names {
		exists[name] = true
	}
	for name, fields := range required {
		validator := bson.M{"$jsonSchema": bson.M{"bsonType": "object", "required": append([]string{"_id"}, fields...)}}
		if exists[name] {
			err = s.DB.RunCommand(ctx, bson.D{{Key: "collMod", Value: name}, {Key: "validator", Value: validator}, {Key: "validationLevel", Value: "strict"}}).Err()
		} else {
			err = s.DB.CreateCollection(ctx, name, options.CreateCollection().SetValidator(validator))
		}
		if err != nil {
			return err
		}
	}
	indexes := map[string][]mongo.IndexModel{}
	indexes["finance_bookings"] = []mongo.IndexModel{{Keys: bson.D{{Key: "tutorId", Value: 1}, {Key: "_id", Value: 1}}}}
	indexes["paid_invoices"] = []mongo.IndexModel{{Keys: bson.D{{Key: "issuerName", Value: 1}, {Key: "issuerGstin", Value: 1}, {Key: "number", Value: 1}}, Options: options.Index().SetUnique(true)}}
	indexes["class_earnings"] = []mongo.IndexModel{{Keys: bson.D{{Key: "tutorId", Value: 1}, {Key: "batchId", Value: 1}, {Key: "dueAt", Value: 1}}}, {Keys: bson.D{{Key: "intentId", Value: 1}}}}
	indexes["payout_batches"] = []mongo.IndexModel{{Keys: bson.D{{Key: "tutorId", Value: 1}, {Key: "_id", Value: 1}}}, {Keys: bson.D{{Key: "reference", Value: 1}}, Options: options.Index().SetUnique(true).SetPartialFilterExpression(bson.M{"reference": bson.M{"$gt": ""}})}}
	for name, models := range indexes {
		if _, err = s.C(name).Indexes().CreateMany(ctx, models); err != nil {
			return err
		}
	}
	_, err = s.C("migrations").UpdateOne(ctx, bson.M{"_id": "008-tutor-finance"}, bson.M{"$setOnInsert": bson.M{"appliedAt": time.Now().UTC()}}, options.UpdateOne().SetUpsert(true))
	return err
}
