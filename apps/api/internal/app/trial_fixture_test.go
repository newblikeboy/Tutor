package app

import (
	"context"
	"strings"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// Test setup only: move the fictional confirmed schedule into the past, then
// exercise the real completion service. No manual-completion API is available.
func endTrialFixture(t *testing.T, a *App, id string) {
	t.Helper()
	if a.Config.Env != "test" || !strings.HasPrefix(a.Store.DB.Name(), "tutor_test_") {
		t.Fatal("trial fixture requires an isolated test database")
	}
	end := a.Now().Add(-time.Second)
	result, err := a.Store.C("trials").UpdateOne(context.Background(), bson.M{"_id": id, "status": "confirmed"}, bson.M{"$set": bson.M{"start": end.Add(-time.Hour), "end": end}})
	if err != nil || result.MatchedCount != 1 {
		t.Fatal("fictional confirmed trial missing", err)
	}
	if err = a.completeEndedTrials(context.Background()); err != nil {
		t.Fatal(err)
	}
}
