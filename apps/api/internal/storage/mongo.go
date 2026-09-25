package storage

import (
	"context"
	"fmt"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"go.mongodb.org/mongo-driver/v2/mongo/readconcern"
	"go.mongodb.org/mongo-driver/v2/mongo/writeconcern"
	"time"
)

type Store struct {
	Client *mongo.Client
	DB     *mongo.Database
}

func Connect(ctx context.Context, uri, name string) (*Store, error) {
	c, e := mongo.Connect(options.Client().ApplyURI(uri).SetServerSelectionTimeout(5 * time.Second))
	if e != nil {
		return nil, e
	}
	if e = c.Ping(ctx, nil); e != nil {
		return nil, e
	}
	var hello bson.M
	if e = c.Database("admin").RunCommand(ctx, bson.D{{Key: "hello", Value: 1}}).Decode(&hello); e != nil {
		return nil, e
	}
	if hello["setName"] == nil && hello["msg"] != "isdbgrid" {
		return nil, fmt.Errorf("MongoDB replica set or Atlas required for transactions")
	}
	return &Store{c, c.Database(name)}, nil
}
func (s *Store) C(name string) *mongo.Collection { return s.DB.Collection(name) }
func One[T any](ctx context.Context, s *Store, c string, f any) (T, error) {
	var v T
	e := s.C(c).FindOne(ctx, f).Decode(&v)
	return v, e
}
func Many[T any](ctx context.Context, s *Store, c string, f any) ([]T, error) {
	out := []T{}
	cur, e := s.C(c).Find(ctx, f, options.Find().SetLimit(100).SetSort(bson.D{{Key: "_id", Value: 1}}))
	if e != nil {
		return out, e
	}
	defer cur.Close(ctx)
	e = cur.All(ctx, &out)
	return out, e
}
func (s *Store) Tx(ctx context.Context, fn func(context.Context) error) error {
	sess, e := s.Client.StartSession()
	if e != nil {
		return e
	}
	defer sess.EndSession(ctx)
	_, e = sess.WithTransaction(ctx, func(c context.Context) (any, error) { return nil, fn(c) }, options.Transaction().SetReadConcern(readconcern.Snapshot()).SetWriteConcern(writeconcern.Majority()))
	return e
}
func (s *Store) Migrate(ctx context.Context) error {
	required := map[string][]string{"users": {"name", "role", "sample"}, "applications": {"status", "scope", "sample"}, "learners": {"ownerId", "name", "kind"}, "consents": {"ownerId", "version", "verification"}, "requirements": {"ownerId", "learnerId", "status"}, "trials": {"ownerId", "tutorId", "learnerId", "status", "start", "end"}, "sessions": {"userId", "expiresAt"}, "audit": {"actor", "action", "at"}, "guards": {"version"}, "requests": {"ownerId", "fingerprint", "resultId"}, "drafts": {"step"}, "rate_limits": {"expiresAt", "count"}, "outbox": {"status", "attempts", "availableAt"}}
	required["credentials"] = []string{"userId", "passwordHash"}
	required["preferences"] = []string{"language", "version"}
	required["files"] = []string{"targetKind", "targetId", "uploaderId", "objectKey", "checksum", "status", "size", "createdAt"}
	required["cases"] = []string{"ownerId", "kind", "title", "body", "status", "assignedTo", "version", "createdAt"}
	required["case_messages"] = []string{"caseId", "authorId", "body", "createdAt"}
	for c, fields := range map[string][]string{
		"availability":    {"timezone", "windows", "dailyCapacity", "version"},
		"enrollments":     {"ownerId", "learnerId", "tutorId", "mentorId", "status", "agreement", "version"},
		"agreements":      {"enrollmentId", "version", "totalPaise", "currency", "termsVersion"},
		"classes":         {"enrollmentId", "tutorId", "start", "end", "status", "version"},
		"learning_plans":  {"enrollmentId", "version", "topics", "authorId", "reviewDate"},
		"handovers":       {"enrollmentId", "oldTutorId", "newTutorId", "status", "familyConsentAt"},
		"migrations":      {"appliedAt"},
		"payment_intents": {"ownerId", "enrollmentId", "amountPaise", "currency", "state"},
		"refunds":         {"ownerId", "intentId", "amountPaise", "status", "requestedBy"},
		"ledger":          {"ownerId", "intentId", "amountPaise", "debit", "credit", "reference", "createdAt"},
		"webhook_events":  {"fingerprint", "kind", "receivedAt"},
		"messages":        {"enrollmentId", "authorId", "authorName", "authorRole", "body", "createdAt"},
		"notifications":   {"ownerId", "kind", "targetId", "read", "createdAt"},
	} {
		required[c] = fields
	}
	names, e := s.DB.ListCollectionNames(ctx, bson.M{})
	if e != nil {
		return e
	}
	exists := map[string]bool{}
	for _, n := range names {
		exists[n] = true
	}
	for c, fields := range required {
		validator := bson.M{"$jsonSchema": bson.M{"bsonType": "object", "required": append([]string{"_id"}, fields...)}}
		if !exists[c] {
			e = s.DB.CreateCollection(ctx, c, options.CreateCollection().SetValidator(validator))
		} else {
			e = s.DB.RunCommand(ctx, bson.D{{Key: "collMod", Value: c}, {Key: "validator", Value: validator}, {Key: "validationLevel", Value: "strict"}}).Err()
		}
		if e != nil {
			return e
		}
	}
	indexes := map[string][]mongo.IndexModel{
		"sessions":     {{Keys: bson.D{{Key: "expiresAt", Value: 1}}, Options: options.Index().SetExpireAfterSeconds(0)}, {Keys: bson.D{{Key: "userId", Value: 1}}}},
		"rate_limits":  {{Keys: bson.D{{Key: "expiresAt", Value: 1}}, Options: options.Index().SetExpireAfterSeconds(0)}},
		"applications": {{Keys: bson.D{{Key: "status", Value: 1}, {Key: "scope.subject", Value: 1}, {Key: "scope.expiresAt", Value: 1}}}},
		"learners":     {{Keys: bson.D{{Key: "ownerId", Value: 1}}}}, "consents": {{Keys: bson.D{{Key: "ownerId", Value: 1}}}}, "requirements": {{Keys: bson.D{{Key: "ownerId", Value: 1}, {Key: "status", Value: 1}}}},
		"trials": {{Keys: bson.D{{Key: "ownerId", Value: 1}, {Key: "start", Value: 1}}}, {Keys: bson.D{{Key: "tutorId", Value: 1}, {Key: "status", Value: 1}, {Key: "start", Value: 1}}}, {Keys: bson.D{{Key: "mentorId", Value: 1}, {Key: "status", Value: 1}}}},
		"audit":  {{Keys: bson.D{{Key: "target", Value: 1}, {Key: "at", Value: 1}}}}, "outbox": {{Keys: bson.D{{Key: "status", Value: 1}, {Key: "availableAt", Value: 1}}}},
	}
	indexes["credentials"] = []mongo.IndexModel{{Keys: bson.D{{Key: "userId", Value: 1}}, Options: options.Index().SetUnique(true)}}
	indexes["files"] = []mongo.IndexModel{{Keys: bson.D{{Key: "targetKind", Value: 1}, {Key: "targetId", Value: 1}, {Key: "_id", Value: 1}}}, {Keys: bson.D{{Key: "objectKey", Value: 1}}, Options: options.Index().SetUnique(true)}}
	indexes["cases"] = []mongo.IndexModel{{Keys: bson.D{{Key: "ownerId", Value: 1}, {Key: "_id", Value: 1}}}, {Keys: bson.D{{Key: "assignedTo", Value: 1}, {Key: "kind", Value: 1}, {Key: "_id", Value: 1}}}}
	indexes["case_messages"] = []mongo.IndexModel{{Keys: bson.D{{Key: "caseId", Value: 1}, {Key: "_id", Value: 1}}}}
	indexes["messages"] = []mongo.IndexModel{{Keys: bson.D{{Key: "enrollmentId", Value: 1}, {Key: "_id", Value: 1}}}}
	indexes["notifications"] = []mongo.IndexModel{{Keys: bson.D{{Key: "ownerId", Value: 1}, {Key: "_id", Value: 1}}}}
	indexes["enrollments"] = []mongo.IndexModel{{Keys: bson.D{{Key: "ownerId", Value: 1}, {Key: "_id", Value: 1}}}, {Keys: bson.D{{Key: "tutorId", Value: 1}, {Key: "status", Value: 1}, {Key: "_id", Value: 1}}}, {Keys: bson.D{{Key: "mentorId", Value: 1}, {Key: "_id", Value: 1}}}, {Keys: bson.D{{Key: "status", Value: 1}, {Key: "holdUntil", Value: 1}}}}
	indexes["classes"] = []mongo.IndexModel{{Keys: bson.D{{Key: "enrollmentId", Value: 1}, {Key: "status", Value: 1}, {Key: "start", Value: 1}}}, {Keys: bson.D{{Key: "tutorId", Value: 1}, {Key: "start", Value: 1}}}}
	indexes["payment_intents"] = []mongo.IndexModel{{Keys: bson.D{{Key: "ownerId", Value: 1}, {Key: "_id", Value: 1}}}, {Keys: bson.D{{Key: "orderId", Value: 1}}, Options: options.Index().SetUnique(true).SetPartialFilterExpression(bson.M{"orderId": bson.M{"$gt": ""}})}, {Keys: bson.D{{Key: "paymentId", Value: 1}}, Options: options.Index().SetUnique(true).SetPartialFilterExpression(bson.M{"paymentId": bson.M{"$gt": ""}})}}
	indexes["refunds"] = []mongo.IndexModel{{Keys: bson.D{{Key: "intentId", Value: 1}, {Key: "status", Value: 1}}}}
	indexes["ledger"] = []mongo.IndexModel{{Keys: bson.D{{Key: "intentId", Value: 1}, {Key: "createdAt", Value: 1}}}}
	for _, c := range []string{"agreements", "learning_plans"} {
		indexes[c] = []mongo.IndexModel{{Keys: bson.D{{Key: "enrollmentId", Value: 1}, {Key: "version", Value: 1}}, Options: options.Index().SetUnique(true)}}
	}
	indexes["handovers"] = []mongo.IndexModel{{Keys: bson.D{{Key: "enrollmentId", Value: 1}, {Key: "status", Value: 1}}}, {Keys: bson.D{{Key: "newTutorId", Value: 1}, {Key: "status", Value: 1}}}}
	for c, idx := range indexes {
		if _, e = s.C(c).Indexes().CreateMany(ctx, idx); e != nil {
			return e
		}
	}
	_, e = s.C("migrations").UpdateOne(ctx, bson.M{"_id": "002-tuition-continuity"}, bson.M{"$setOnInsert": bson.M{"appliedAt": time.Now().UTC()}}, options.UpdateOne().SetUpsert(true))
	if e != nil {
		return e
	}
	if e = s.MigrateStaff(ctx); e != nil {
		return e
	}
	return s.MigrateInbox(ctx)
}
