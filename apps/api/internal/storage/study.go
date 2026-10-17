package storage

import (
	"context"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

func (s *Store) MigrateStudy(ctx context.Context) error {
	for name, fields := range map[string][]string{
		"study_materials": {"title", "kind", "class", "board", "subject", "status", "version", "updatedAt"},
		"study_access":    {"ownerId", "learnerId", "startsAt", "expiresAt", "simulated", "version"},
		"study_attempts":  {"ownerId", "learnerId", "materialId", "materialVersion", "score", "total", "snapshot", "createdAt"},
	} {
		names, err := s.DB.ListCollectionNames(ctx, bson.M{"name": name})
		if err != nil {
			return err
		}
		validator := bson.M{"$jsonSchema": bson.M{"bsonType": "object", "required": append([]string{"_id"}, fields...)}}
		if len(names) == 0 {
			if err = s.DB.CreateCollection(ctx, name); err != nil {
				return err
			}
		}
		if err = s.DB.RunCommand(ctx, bson.D{{Key: "collMod", Value: name}, {Key: "validator", Value: validator}, {Key: "validationLevel", Value: "strict"}}).Err(); err != nil {
			return err
		}
	}
	for name, models := range map[string][]mongo.IndexModel{
		"study_materials": {{Keys: bson.D{{Key: "status", Value: 1}, {Key: "class", Value: 1}, {Key: "board", Value: 1}, {Key: "_id", Value: 1}}}},
		"study_access":    {{Keys: bson.D{{Key: "ownerId", Value: 1}, {Key: "learnerId", Value: 1}}}},
		"study_attempts":  {{Keys: bson.D{{Key: "ownerId", Value: 1}, {Key: "learnerId", Value: 1}, {Key: "_id", Value: 1}}}},
	} {
		if _, err := s.C(name).Indexes().CreateMany(ctx, models); err != nil {
			return err
		}
	}
	return nil
}
