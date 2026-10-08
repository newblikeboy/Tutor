package app

import (
	"context"
	"go.mongodb.org/mongo-driver/v2/bson"
	"time"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
)

// Reports explicitly aggregate complete totals or project compact summary rows.
// They must not use the bounded list helper, which truncates at 100 records.
func reportRows[T any](ctx context.Context, store *storage.Store, collection string, pipeline bson.A) ([]T, error) {
	rows := []T{}
	cur, err := store.C(collection).Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	err = cur.All(ctx, &rows)
	return rows, err
}

func (a *App) mentorTutorReports(ctx context.Context, tutors []domain.Application, assignments []domain.Enrollment) ([]domain.MentorTutorReport, error) {
	out := []domain.MentorTutorReport{}
	if len(tutors) == 0 {
		return out, nil
	}
	ids := make([]string, 0, len(tutors))
	active := map[string]int64{}
	for _, tutor := range tutors {
		ids = append(ids, tutor.ID)
	}
	for _, enrollment := range assignments {
		if enum(enrollment.Status, "active", "paused") {
			active[enrollment.TutorID]++
		}
	}
	type count struct {
		ID struct {
			Tutor  string `bson:"tutor"`
			Status string `bson:"status"`
		} `bson:"_id"`
		Count int64 `bson:"count"`
	}
	rows, err := reportRows[count](ctx, a.Store, "classes", bson.A{
		bson.M{"$match": bson.M{"tutorId": bson.M{"$in": ids}, "status": bson.M{"$in": []string{"reviewed", "missed", "awaiting_review"}}}},
		bson.M{"$group": bson.M{"_id": bson.M{"tutor": "$tutorId", "status": "$status"}, "count": bson.M{"$sum": 1}}},
	})
	if err != nil {
		return nil, err
	}
	counts := map[string]map[string]int64{}
	for _, row := range rows {
		if counts[row.ID.Tutor] == nil {
			counts[row.ID.Tutor] = map[string]int64{}
		}
		counts[row.ID.Tutor][row.ID.Status] = row.Count
	}
	for _, tutor := range tutors {
		c := counts[tutor.ID]
		out = append(out, domain.MentorTutorReport{TutorID: tutor.ID, TutorName: tutor.Name, Status: tutor.Status, ActiveLearners: active[tutor.ID], ReviewedClasses: c["reviewed"], MissedClasses: c["missed"], AwaitingReviews: c["awaiting_review"]})
	}
	return out, nil
}

func (a *App) mentorAssignmentReports(ctx context.Context, assignments []domain.Enrollment) ([]domain.MentorAssignmentReport, error) {
	out := []domain.MentorAssignmentReport{}
	if len(assignments) == 0 {
		return out, nil
	}
	ids := make([]string, 0, len(assignments))
	for _, assignment := range assignments {
		ids = append(ids, assignment.ID)
	}
	type count struct {
		ID struct {
			Enrollment string `bson:"enrollment"`
			Status     string `bson:"status"`
		} `bson:"_id"`
		Count int64 `bson:"count"`
	}
	classes, err := reportRows[count](ctx, a.Store, "classes", bson.A{
		bson.M{"$match": bson.M{"enrollmentId": bson.M{"$in": ids}}},
		bson.M{"$group": bson.M{"_id": bson.M{"enrollment": "$enrollmentId", "status": "$status"}, "count": bson.M{"$sum": 1}}},
	})
	if err != nil {
		return nil, err
	}
	delivered, remaining := map[string]int64{}, map[string]int64{}
	for _, row := range classes {
		if row.ID.Status == "reviewed" {
			delivered[row.ID.Enrollment] += row.Count
		}
		if !enum(row.ID.Status, "reviewed", "missed", "cancelled_consumed", "cancelled") {
			remaining[row.ID.Enrollment] += row.Count
		}
	}
	type review struct {
		ID   string    `bson:"_id"`
		Date time.Time `bson:"date"`
	}
	plans, err := reportRows[review](ctx, a.Store, "learning_plans", bson.A{
		bson.M{"$match": bson.M{"enrollmentId": bson.M{"$in": ids}}},
		bson.M{"$group": bson.M{"_id": "$enrollmentId", "date": bson.M{"$max": "$reviewDate"}}},
	})
	if err != nil {
		return nil, err
	}
	dates := map[string]string{}
	for _, row := range plans {
		dates[row.ID] = row.Date.UTC().Format(time.RFC3339)
	}
	for _, v := range assignments {
		out = append(out, domain.MentorAssignmentReport{EnrollmentID: v.ID, LearnerName: v.LearnerName, TutorID: v.TutorID, TutorName: v.TutorName, Status: v.Status, PlanVersion: v.PlanVersion, DeliveredClasses: delivered[v.ID], RemainingClasses: remaining[v.ID], NextReviewDate: dates[v.ID]})
	}
	return out, nil
}

func (a *App) paymentCollections(ctx context.Context) (domain.FounderRevenue, []domain.FinanceMonth, error) {
	type month struct {
		ID       string `bson:"_id"`
		Gross    int64  `bson:"gross"`
		Refunded int64  `bson:"refunded"`
		Payments int64  `bson:"payments"`
	}
	rows, err := reportRows[month](ctx, a.Store, "payment_intents", bson.A{
		bson.M{"$match": bson.M{"state": bson.M{"$in": []string{"captured", "refund_review"}}}},
		bson.M{"$set": bson.M{"collectionMonth": bson.M{"$dateToString": bson.M{"format": "%Y-%m", "date": "$createdAt", "timezone": "UTC", "onNull": "unknown"}}}},
		bson.M{"$group": bson.M{
			"_id":   bson.M{"$cond": bson.A{bson.M{"$eq": bson.A{"$collectionMonth", "0001-01"}}, "unknown", "$collectionMonth"}},
			"gross": bson.M{"$sum": "$amountPaise"}, "refunded": bson.M{"$sum": "$refundedPaise"}, "payments": bson.M{"$sum": 1},
		}},
		bson.M{"$sort": bson.M{"_id": -1}},
	})
	total, months := domain.FounderRevenue{}, []domain.FinanceMonth{}
	if err != nil {
		return total, nil, err
	}
	for _, row := range rows {
		total.GrossPaise += row.Gross
		total.RefundedPaise += row.Refunded
		months = append(months, domain.FinanceMonth{Month: row.ID, GrossPaise: row.Gross, RefundedPaise: row.Refunded, NetPaise: row.Gross - row.Refunded, Payments: row.Payments})
	}
	total.NetPaise = total.GrossPaise - total.RefundedPaise
	return total, months, nil
}
