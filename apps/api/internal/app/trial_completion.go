package app

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
)

// Completion closes a confirmed schedule. It does not assert attendance or
// create academic evidence. Call within the transaction that read the trial.
func (a *App) finishTrial(ctx context.Context, trial domain.Trial, now time.Time) (domain.Trial, error) {
	if trial.Status != "confirmed" || trial.End.After(now) {
		return trial, nil
	}
	if err := a.clearLessonMeeting(ctx, "trials", trial.ID, &trial.Meeting); err != nil {
		return trial, err
	}
	ended := trial.End
	trial.Status = "completed"
	trial.CompletedAt = &ended
	trial.CompletionMethod = "scheduled_end"
	trial.Version++
	changes := bson.M{"status": trial.Status, "completedAt": ended, "completionMethod": trial.CompletionMethod}
	if trial.Meeting != nil {
		changes["meeting.status"] = trial.Meeting.Status
		if trial.Meeting.Provider == "google" {
			changes["meeting.joinUrl"] = trial.Meeting.JoinURL
			changes["meeting.jobId"] = trial.Meeting.JobID
		}
	}
	result, err := a.Store.C("trials").UpdateOne(ctx, bson.M{"_id": trial.ID, "status": "confirmed"}, bson.M{"$set": changes, "$inc": bson.M{"version": 1}})
	if err != nil {
		return trial, err
	}
	if result.MatchedCount != 1 {
		return trial, domain.Fail(409, "stale_version", "This trial changed. Reload first.")
	}
	if err = a.queueTrialEmail(ctx, trial, "trial_completed"); err != nil {
		return trial, err
	}
	return trial, a.audit(ctx, "system", "trial.auto_completed", trial.ID)
}

func (a *App) finishTrialByID(ctx context.Context, id string, now time.Time) (domain.Trial, error) {
	var trial domain.Trial
	err := a.Store.Tx(ctx, func(ctx context.Context) error {
		var err error
		trial, err = storage.One[domain.Trial](ctx, a.Store, "trials", bson.M{"_id": id})
		if err != nil {
			return err
		}
		trial, err = a.finishTrial(ctx, trial, now)
		return err
	})
	return trial, err
}

// Reads catch up their own authorised records even if the worker was offline.
func (a *App) finishVisibleTrials(ctx context.Context, trials []domain.Trial) error {
	now := a.Now()
	for i := range trials {
		if trials[i].Status == "confirmed" && !trials[i].End.After(now) {
			trial, err := a.finishTrialByID(ctx, trials[i].ID, now)
			if err != nil {
				return err
			}
			trials[i] = trial
		}
	}
	return nil
}

// A bounded, restart-safe sweep uses persisted end times; concurrent workers
// contend on the trial transaction, so emails and audits are created once.
func (a *App) completeEndedTrials(ctx context.Context) error {
	now := a.Now()
	cur, err := a.Store.C("trials").Find(ctx,
		bson.M{"status": "confirmed", "end": bson.M{"$lte": now}},
		options.Find().SetSort(bson.D{{Key: "end", Value: 1}, {Key: "_id", Value: 1}}).SetLimit(100))
	if err != nil {
		return err
	}
	defer cur.Close(ctx)
	var trials []domain.Trial
	if err = cur.All(ctx, &trials); err != nil {
		return err
	}
	return a.finishVisibleTrials(ctx, trials)
}
