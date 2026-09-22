package storage

import (
	"context"
	"errors"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"os"
	"time"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/password"
)

func (s *Store) Seed(ctx context.Context, env string) error {
	if env != "development" && env != "test" {
		return errors.New("sample seeding is prohibited outside development/test")
	}
	users := []domain.User{{ID: "parent-a", Name: "Sample family A", Role: "parent", Sample: true}, {ID: "parent-b", Name: "Sample family B", Role: "parent", Sample: true}, {ID: "adult-a", Name: "Sample adult learner", Role: "parent", Sample: true}, {ID: "tutor-a", Name: "Sample tutor applicant", Role: "tutor", Sample: true}, {ID: "tutor-meera", Name: "Meera · sample", Role: "tutor", Sample: true}, {ID: "tutor-arjun", Name: "Arjun · sample", Role: "tutor", Sample: true}, {ID: "mentor-a", Name: "Sample academic mentor", Role: "mentor", Sample: true}, {ID: "admin-a", Name: "Sample administrator", Role: "admin", Sample: true}, {ID: "support-a", Name: "Sample support operator", Role: "support", Sample: true}, {ID: "finance-a", Name: "Sample finance operator", Role: "finance", Sample: true}}
	for _, u := range users {
		if _, e := s.C("users").UpdateOne(ctx, bson.M{"_id": u.ID}, bson.M{"$setOnInsert": u}, options.UpdateOne().SetUpsert(true)); e != nil {
			return e
		}
		if value := os.Getenv("SEED_PASSWORD"); value != "" {
			email := u.ID + "@example.test"
			if n, e := s.C("credentials").CountDocuments(ctx, bson.M{"userId": u.ID}); e != nil {
				return e
			} else if n == 0 {
				hash, e := password.Hash(value)
				if e != nil {
					return e
				}
				if _, e = s.C("credentials").UpdateOne(ctx, bson.M{"_id": email}, bson.M{"$setOnInsert": bson.M{"userId": u.ID, "passwordHash": hash}}, options.UpdateOne().SetUpsert(true)); e != nil {
					return e
				}
				if _, e = s.C("users").UpdateOne(ctx, bson.M{"_id": u.ID}, bson.M{"$set": bson.M{"email": email}}); e != nil {
					return e
				}
			}
		}
	}
	assessed := time.Date(2026, 9, 1, 10, 0, 0, 0, time.UTC)
	for i, id := range []string{"tutor-meera", "tutor-arjun"} {
		names := []string{"Meera · sample", "Arjun · sample"}
		languages := []string{"Hindi", "English"}
		a := domain.Application{ID: id, Name: names[i], Education: "Fictional qualification for interface testing; not verified credentials.", Approach: "We begin with what the learner understands, work through one idea at a time, and use short practice tasks to decide what comes next.", Language: languages[i], Experience: 4 + i, Status: "approved", Scope: domain.Scope{Subject: "Mathematics", MinClass: 6, MaxClass: 10, Mode: "online", ExpiresAt: time.Date(2027, 3, 1, 0, 0, 0, 0, time.UTC)}, AssessorID: "mentor-a", AssessmentAt: assessed, Scores: []int{4, 4, 4, 4, 4, 4}, Reason: "Fictional seed approval for development only.", Evidence: "Fictional demonstration explaining fractions and checking misconceptions.", Sample: true, UpdatedAt: assessed}
		if _, e := s.C("applications").UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$setOnInsert": a}, options.UpdateOne().SetUpsert(true)); e != nil {
			return e
		}
	}
	return nil
}
