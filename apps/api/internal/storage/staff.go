package storage

import (
	"context"
	"fmt"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// This additive migration only touches the existing core collections. It never
// creates collections or deletes records, including on capacity-limited Atlas.
func (s *Store) MigrateStaff(ctx context.Context) error {
	names, e := s.DB.ListCollectionNames(ctx, bson.M{})
	if e != nil {
		return e
	}
	exists := map[string]bool{}
	for _, name := range names {
		exists[name] = true
	}
	for _, name := range []string{"applications", "audit", "guards", "outbox", "users", "sessions"} {
		if !exists[name] {
			return fmt.Errorf("staff migration requires the core schema")
		}
	}
	validator := bson.M{"$jsonSchema": bson.M{"bsonType": "object", "required": []string{"_id", "status", "scope", "sample"}, "properties": bson.M{
		"interview":        bson.M{"bsonType": "object", "required": []string{"start", "end", "timezone", "joinUrl", "status"}, "properties": bson.M{"start": bson.M{"bsonType": "date"}, "end": bson.M{"bsonType": "date"}, "timezone": bson.M{"bsonType": "string"}, "joinUrl": bson.M{"bsonType": "string", "maxLength": 1000}, "status": bson.M{"enum": []string{"scheduled", "completed", "cancelled", "no_show"}}}},
		"conflictClear":    bson.M{"bsonType": "bool"},
		"formVersion":      bson.M{"bsonType": []string{"int", "long"}, "minimum": 0},
		"formStep":         bson.M{"bsonType": []string{"int", "long"}, "minimum": 0, "maximum": 6},
		"profile":          applicationProfileSchema(),
		"teachingLocation": bson.M{"bsonType": "object", "required": []string{"latitude", "longitude"}, "properties": bson.M{"latitude": bson.M{"bsonType": "double", "minimum": -90, "maximum": 90}, "longitude": bson.M{"bsonType": "double", "minimum": -180, "maximum": 180}}},
		"publicProfile":    bson.M{"bsonType": "object", "required": []string{"introduction", "photoFileId", "introVideoFileId", "publishVideo", "version", "updatedAt"}, "properties": bson.M{"introduction": bson.M{"bsonType": "string", "minLength": 40, "maxLength": 1200}, "photoFileId": bson.M{"bsonType": "string", "maxLength": 100}, "introVideoFileId": bson.M{"bsonType": "string", "maxLength": 100}, "publishVideo": bson.M{"bsonType": "bool"}, "version": bson.M{"bsonType": []string{"int", "long"}, "minimum": 1}, "updatedAt": bson.M{"bsonType": "date"}}},
		"attachments":      bson.M{"bsonType": "array", "maxItems": 20, "items": bson.M{"bsonType": "object", "required": []string{"_id", "targetKind", "targetId", "uploaderId", "objectKey", "checksum", "status", "size", "createdAt"}}},
	}}}
	if e = s.DB.RunCommand(ctx, bson.D{{Key: "collMod", Value: "applications"}, {Key: "validator", Value: validator}, {Key: "validationLevel", Value: "strict"}}).Err(); e != nil {
		return e
	}
	indexes := map[string][]mongo.IndexModel{
		"applications": {{Keys: bson.D{{Key: "assessorId", Value: 1}, {Key: "status", Value: 1}, {Key: "_id", Value: 1}}}, {Keys: bson.D{{Key: "interview.status", Value: 1}, {Key: "interview.start", Value: 1}, {Key: "_id", Value: 1}}}},
		"audit":        {{Keys: bson.D{{Key: "at", Value: -1}, {Key: "_id", Value: -1}}}, {Keys: bson.D{{Key: "target", Value: 1}, {Key: "at", Value: -1}, {Key: "_id", Value: -1}}}},
		"outbox":       {{Keys: bson.D{{Key: "kind", Value: 1}, {Key: "status", Value: 1}, {Key: "_id", Value: 1}}, Options: options.Index().SetName("staff_followups")}},
	}
	indexes["applications"] = append(indexes["applications"], mongo.IndexModel{Keys: bson.D{{Key: "profile.teachingAreas.modes", Value: 1}, {Key: "status", Value: 1}}})
	indexes["applications"] = append(indexes["applications"], mongo.IndexModel{Keys: bson.D{{Key: "attachments._id", Value: 1}}})
	for collection, models := range indexes {
		if _, e = s.C(collection).Indexes().CreateMany(ctx, models); e != nil {
			return e
		}
	}
	return nil
}
