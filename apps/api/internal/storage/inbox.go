package storage

import (
	"context"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"time"
)

// MigrateInbox adds ordinary Updates. Legacy encrypted collections remain untouched.
func (s *Store) MigrateInbox(ctx context.Context) error {
	names, err := s.DB.ListCollectionNames(ctx, bson.M{"name": "inbox_messages"})
	if err != nil {
		return err
	}
	validator := bson.M{"$jsonSchema": bson.M{"bsonType": "object", "required": []string{"_id", "senderId", "recipientId", "enrollmentId", "sender", "recipient", "nonce", "subject", "body", "createdAt", "readAt"}}}
	if len(names) == 0 {
		err = s.DB.CreateCollection(ctx, "inbox_messages", options.CreateCollection().SetValidator(validator))
	} else {
		err = s.DB.RunCommand(ctx, bson.D{{Key: "collMod", Value: "inbox_messages"}, {Key: "validator", Value: validator}, {Key: "validationLevel", Value: "strict"}}).Err()
	}
	if err != nil {
		return err
	}
	_, err = s.C("inbox_messages").Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "senderId", Value: 1}, {Key: "_id", Value: -1}}},
		{Keys: bson.D{{Key: "recipientId", Value: 1}, {Key: "readAt", Value: 1}, {Key: "_id", Value: -1}}},
		{Keys: bson.D{{Key: "senderId", Value: 1}, {Key: "nonce", Value: 1}}, Options: options.Index().SetUnique(true)},
	})
	if err != nil {
		return err
	}
	_, err = s.C("migrations").UpdateOne(ctx, bson.M{"_id": "007-simple-inbox"}, bson.M{"$setOnInsert": bson.M{"appliedAt": time.Now().UTC()}}, options.UpdateOne().SetUpsert(true))
	return err
}
