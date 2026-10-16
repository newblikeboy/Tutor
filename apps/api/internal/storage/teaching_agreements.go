package storage

import (
	"context"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// Additive policy storage only; no existing booking or signed document is rewritten.
func (s *Store) MigrateTeachingAgreements(ctx context.Context) error {
	names, err := s.DB.ListCollectionNames(ctx, bson.M{"name": "teaching_agreements"})
	if err != nil {
		return err
	}
	validator := bson.M{"$jsonSchema": bson.M{"bsonType": "object", "required": []string{"_id", "mode", "version"}}}
	if len(names) == 0 {
		return s.DB.CreateCollection(ctx, "teaching_agreements", options.CreateCollection().SetValidator(validator))
	}
	return s.DB.RunCommand(ctx, bson.D{{Key: "collMod", Value: "teaching_agreements"}, {Key: "validator", Value: validator}, {Key: "validationLevel", Value: "strict"}}).Err()
}
