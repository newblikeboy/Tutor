package storage

import (
	"context"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"time"
)

// MigrateGoogle adds encrypted organizer authorizations and short-lived OAuth intents.
// No application or historical record is rewritten.
func (s *Store) MigrateGoogle(ctx context.Context) error {
	for name, fields := range map[string][]string{"google_connections": {"generation", "email", "status", "revision"}, "google_oauth_states": {"hash", "session", "verifier", "expiresAt"}} {
		names, e := s.DB.ListCollectionNames(ctx, bson.M{"name": name})
		if e != nil {
			return e
		}
		properties := bson.M{"_id": bson.M{"bsonType": "string"}}
		if name == "google_connections" {
			properties["generation"] = bson.M{"bsonType": "string", "pattern": "^[a-f0-9]{64}$"}
			properties["email"] = bson.M{"bsonType": "string", "maxLength": 254}
			properties["status"] = bson.M{"enum": []string{"connected", "reconnect_required", "disconnected"}}
			properties["revision"] = bson.M{"bsonType": []string{"int", "long"}, "minimum": 0}
			for _, field := range []string{"access", "refresh"} {
				properties[field] = bson.M{"bsonType": "string", "maxLength": 8192}
			}
			for _, field := range []string{"expiresAt", "checkedAt"} {
				properties[field] = bson.M{"bsonType": "date"}
			}
		} else {
			for _, field := range []string{"hash", "session"} {
				properties[field] = bson.M{"bsonType": "string", "pattern": "^[a-f0-9]{64}$"}
			}
			properties["verifier"] = bson.M{"bsonType": "string", "maxLength": 8192}
			properties["expiresAt"] = bson.M{"bsonType": "date"}
		}
		validator := bson.M{"$jsonSchema": bson.M{"bsonType": "object", "required": append([]string{"_id"}, fields...), "properties": properties}}
		if len(names) == 0 {
			e = s.DB.CreateCollection(ctx, name, options.CreateCollection().SetValidator(validator))
		} else {
			e = s.DB.RunCommand(ctx, bson.D{{Key: "collMod", Value: name}, {Key: "validator", Value: validator}, {Key: "validationLevel", Value: "strict"}}).Err()
		}
		if e != nil {
			return e
		}
	}
	if _, e := s.C("google_oauth_states").Indexes().CreateOne(ctx, mongo.IndexModel{Keys: bson.D{{Key: "expiresAt", Value: 1}}, Options: options.Index().SetExpireAfterSeconds(0)}); e != nil {
		return e
	}
	if _, e := s.C("applications").Indexes().CreateOne(ctx, mongo.IndexModel{Keys: bson.D{{Key: "interview.mentorId", Value: 1}, {Key: "interview.provider", Value: 1}, {Key: "interview.status", Value: 1}}}); e != nil {
		return e
	}
	for _, kind := range []string{"classes", "trials"} {
		if _, e := s.C(kind).Indexes().CreateOne(ctx, mongo.IndexModel{Keys: bson.D{{Key: "meeting.organizerId", Value: 1}, {Key: "meeting.provider", Value: 1}, {Key: "meeting.status", Value: 1}}}); e != nil {
			return e
		}
	}
	if _, e := s.C("outbox").Indexes().CreateOne(ctx, mongo.IndexModel{Keys: bson.D{{Key: "payload.organizerId", Value: 1}, {Key: "kind", Value: 1}, {Key: "status", Value: 1}}}); e != nil {
		return e
	}
	_, e := s.C("migrations").UpdateOne(ctx, bson.M{"_id": "010-google-interviews"}, bson.M{"$setOnInsert": bson.M{"appliedAt": time.Now().UTC()}}, options.UpdateOne().SetUpsert(true))
	return e
}
