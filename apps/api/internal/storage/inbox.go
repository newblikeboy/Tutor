package storage

import (
	"context"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"time"
)

// MigrateInbox is additive and may be run independently on an existing installation.
func (s *Store) MigrateInbox(ctx context.Context) error {
	names, err := s.DB.ListCollectionNames(ctx, bson.M{})
	if err != nil {
		return err
	}
	exists := map[string]bool{}
	for _, name := range names {
		exists[name] = true
	}
	for name, fields := range map[string][]string{
		"inbox_keys":    {"version", "encryptionKey", "signingKey", "fingerprint", "salt", "iv", "vault"},
		"inbox_updates": {"senderId", "recipientId", "enrollmentId", "sender", "recipient", "version", "nonce", "ciphertext", "signature", "createdAt", "readAt", "readSignature"},
	} {
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
	_, err = s.C("inbox_updates").Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "senderId", Value: 1}, {Key: "_id", Value: -1}}},
		{Keys: bson.D{{Key: "recipientId", Value: 1}, {Key: "readAt", Value: 1}, {Key: "_id", Value: -1}}},
		{Keys: bson.D{{Key: "senderId", Value: 1}, {Key: "nonce", Value: 1}}, Options: options.Index().SetUnique(true)},
	})
	if err != nil {
		return err
	}
	_, err = s.C("migrations").UpdateOne(ctx, bson.M{"_id": "006-encrypted-inbox"}, bson.M{"$setOnInsert": bson.M{"appliedAt": time.Now().UTC()}}, options.UpdateOne().SetUpsert(true))
	return err
}
