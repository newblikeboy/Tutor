package storage

import (
	"context"
	"strings"
	"time"
	"unicode/utf8"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"tutorplatform/internal/domain"
)

func (s *Store) MigrateSubjects(ctx context.Context) error {
	names, err := s.DB.ListCollectionNames(ctx, bson.M{"name": "subjects"})
	if err != nil {
		return err
	}
	if len(names) == 0 {
		if err = s.DB.CreateCollection(ctx, "subjects"); err != nil {
			return err
		}
	}
	validator := bson.M{"$jsonSchema": bson.M{"bsonType": "object", "required": []string{"_id", "name", "normalizedName", "active", "sortOrder", "system", "version", "updatedAt"}}}
	if err = s.DB.RunCommand(ctx, bson.D{{Key: "collMod", Value: "subjects"}, {Key: "validator", Value: validator}}).Err(); err != nil {
		return err
	}
	if _, err = s.C("subjects").Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "normalizedName", Value: 1}}, Options: options.Index().SetUnique(true)},
		{Keys: bson.D{{Key: "active", Value: 1}, {Key: "sortOrder", Value: 1}, {Key: "_id", Value: 1}}},
	}); err != nil {
		return err
	}
	initial := append([]string{}, domain.InitialSubjectNames...)
	// Previously authored study subjects were free text. Import their exact keys
	// without changing any resource or inferring a tutor's academic approval.
	var legacy []string
	if err = s.C("study_materials").Distinct(ctx, "subject", bson.M{}).Decode(&legacy); err != nil {
		return err
	}
	initial = append(initial, legacy...)
	for i, name := range initial {
		name = strings.TrimSpace(name)
		if utf8.RuneCountInString(name) < 2 || utf8.RuneCountInString(name) > 80 {
			continue
		}
		normalized := strings.ToLower(name)
		found := s.C("subjects").FindOne(ctx, bson.M{"$or": []bson.M{{"_id": name}, {"normalizedName": normalized}}}).Err()
		if found == nil {
			continue
		}
		if found != mongo.ErrNoDocuments {
			return found
		}
		v := domain.Subject{ID: name, Name: name, NormalizedName: normalized, Active: true, SortOrder: i * 10, System: name == domain.AllSubjects, Version: 1, UpdatedAt: time.Now().UTC()}
		if _, err = s.C("subjects").UpdateOne(ctx, bson.M{"_id": name}, bson.M{"$setOnInsert": v}, options.UpdateOne().SetUpsert(true)); err != nil {
			return err
		}
	}
	return nil
}
