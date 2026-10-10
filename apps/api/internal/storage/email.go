package storage

import (
	"context"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

func (s *Store) MigrateEmail(ctx context.Context) error {
	names, err := s.DB.ListCollectionNames(ctx, bson.M{"name": "email_challenges"})
	if err != nil {
		return err
	}
	validator := bson.M{"$jsonSchema": bson.M{"bsonType": "object", "required": []string{"_id", "userId", "purpose", "codeHash", "expiresAt", "attempts", "credentialHash"}}}
	if len(names) == 0 {
		err = s.DB.CreateCollection(ctx, "email_challenges", options.CreateCollection().SetValidator(validator))
	} else {
		err = s.DB.RunCommand(ctx, bson.D{{Key: "collMod", Value: "email_challenges"}, {Key: "validator", Value: validator}, {Key: "validationLevel", Value: "strict"}}).Err()
	}
	if err != nil {
		return err
	}
	_, err = s.C("email_challenges").Indexes().CreateMany(ctx, []mongo.IndexModel{{Keys: bson.D{{Key: "expiresAt", Value: 1}}, Options: options.Index().SetExpireAfterSeconds(0)}, {Keys: bson.D{{Key: "userId", Value: 1}, {Key: "purpose", Value: 1}}}})
	if err != nil {
		return err
	}
	_, err = s.C("classes").Indexes().CreateOne(ctx, mongo.IndexModel{Keys: bson.D{{Key: "status", Value: 1}, {Key: "start", Value: 1}}, Options: options.Index().SetName("email_upcoming_classes")})
	if err != nil {
		return err
	}
	_, err = s.C("outbox").Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "kind", Value: 1}, {Key: "status", Value: 1}, {Key: "availableAt", Value: 1}, {Key: "_id", Value: 1}}, Options: options.Index().SetName("email_due_delivery")},
		{Keys: bson.D{{Key: "kind", Value: 1}, {Key: "payload.event", Value: 1}, {Key: "status", Value: 1}, {Key: "availableAt", Value: 1}, {Key: "_id", Value: 1}}, Options: options.Index().SetName("email_code_due_delivery")},
		{Keys: bson.D{{Key: "kind", Value: 1}, {Key: "status", Value: 1}, {Key: "leaseUntil", Value: 1}, {Key: "availableAt", Value: 1}}, Options: options.Index().SetName("email_lease_recovery")},
	})
	return err
}
