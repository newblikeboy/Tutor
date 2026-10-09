package app

import (
	"context"
	"net/http"
	"slices"
	"strings"

	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
)

// Read the complete owned history; the generic list helper limits results to 100.
func progressRecords[T any](ctx context.Context, s *storage.Store, collection string, filter bson.M) ([]T, error) {
	rows := []T{}
	cur, err := s.C(collection).Find(ctx, filter, options.Find().SetSort(bson.D{{Key: "_id", Value: 1}}))
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	err = cur.All(ctx, &rows)
	return rows, err
}

func agreementSubjects(agreement domain.Agreement) []string {
	if len(agreement.Subjects) > 0 {
		return agreement.Subjects
	}
	return []string{agreement.Subject}
}

func (a *App) learnerProgress(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "parent") {
		return
	}
	ctx := r.Context()
	learner, err := storage.One[domain.Learner](ctx, a.Store, "learners", bson.M{"_id": chi.URLParam(r, "id"), "ownerId": user(r).ID})
	if err != nil {
		a.error(w, r, err)
		return
	}
	out := domain.LearnerProgress{Enrollments: []domain.Enrollment{}, Sessions: []domain.ProgressSession{}, Trials: []domain.ProgressTrial{}, Plans: []domain.ProgressPlan{}, Handovers: []domain.Handover{}}
	out.Enrollments, err = progressRecords[domain.Enrollment](ctx, a.Store, "enrollments", bson.M{"learnerId": learner.ID, "ownerId": user(r).ID, "status": bson.M{"$in": []string{"active", "paused", "completed", "cancelled"}}})
	if err != nil {
		a.error(w, r, err)
		return
	}
	ids := []string{}
	cancelled := []string{}
	for _, enrollment := range out.Enrollments {
		if enrollment.Status == "cancelled" {
			cancelled = append(cancelled, enrollment.ID)
		}
	}
	if len(cancelled) > 0 {
		captured, er := progressRecords[domain.PaymentIntent](ctx, a.Store, "payment_intents", bson.M{"enrollmentId": bson.M{"$in": cancelled}, "ownerId": user(r).ID, "state": "captured"})
		if er != nil {
			a.error(w, r, er)
			return
		}
		// Historical recorded learning remains with the family even if the old agreement predates provider billing.
		learned, er := progressRecords[domain.ClassSession](ctx, a.Store, "classes", bson.M{"enrollmentId": bson.M{"$in": cancelled}, "status": bson.M{"$in": []string{"completed", "reviewed", "missed", "awaiting_review"}}})
		if er != nil {
			a.error(w, r, er)
			return
		}
		retained := map[string]bool{}
		for _, payment := range captured {
			retained[payment.EnrollmentID] = true
		}
		for _, session := range learned {
			retained[session.EnrollmentID] = true
		}
		out.Enrollments = slices.DeleteFunc(out.Enrollments, func(enrollment domain.Enrollment) bool {
			return enrollment.Status == "cancelled" && !retained[enrollment.ID]
		})
	}
	byID := map[string]domain.Enrollment{}
	for _, enrollment := range out.Enrollments {
		ids = append(ids, enrollment.ID)
		byID[enrollment.ID] = enrollment
	}
	sessions, err := progressRecords[domain.ClassSession](ctx, a.Store, "classes", bson.M{"enrollmentId": bson.M{"$in": ids}, "status": bson.M{"$nin": []string{"planned", "held"}}})
	if err != nil {
		a.error(w, r, err)
		return
	}
	plans, err := progressRecords[domain.LearningPlan](ctx, a.Store, "learning_plans", bson.M{"enrollmentId": bson.M{"$in": ids}})
	if err != nil {
		a.error(w, r, err)
		return
	}
	trials, err := progressRecords[domain.Trial](ctx, a.Store, "trials", bson.M{"learnerId": learner.ID, "ownerId": user(r).ID, "status": bson.M{"$in": []string{"completed", "reviewed"}}})
	if err != nil {
		a.error(w, r, err)
		return
	}
	out.Handovers, err = progressRecords[domain.Handover](ctx, a.Store, "handovers", bson.M{"enrollmentId": bson.M{"$in": ids}, "status": "accepted"})
	if err != nil {
		a.error(w, r, err)
		return
	}
	people := []string{}
	for _, session := range sessions {
		people = append(people, session.TutorID)
	}
	for _, trial := range trials {
		people = append(people, trial.TutorID)
	}
	for _, plan := range plans {
		people = append(people, plan.AuthorID)
	}
	names := map[string]string{}
	cur, err := a.Store.C("users").Find(ctx, bson.M{"_id": bson.M{"$in": people}}, options.Find().SetProjection(bson.M{"_id": 1, "name": 1}))
	if err != nil {
		a.error(w, r, err)
		return
	}
	defer cur.Close(ctx)
	var authors []struct {
		ID   string `bson:"_id"`
		Name string `bson:"name"`
	}
	if err = cur.All(ctx, &authors); err != nil {
		a.error(w, r, err)
		return
	}
	for _, author := range authors {
		names[author.ID] = author.Name
	}
	for _, session := range sessions {
		out.Sessions = append(out.Sessions, domain.ProgressSession{ClassSession: session, TutorName: names[session.TutorID], Subjects: agreementSubjects(byID[session.EnrollmentID].Agreement)})
	}
	for _, trial := range trials {
		out.Trials = append(out.Trials, domain.ProgressTrial{Trial: trial, TutorName: names[trial.TutorID]})
	}
	for _, plan := range plans {
		out.Plans = append(out.Plans, domain.ProgressPlan{LearningPlan: plan, AuthorName: names[plan.AuthorID], Subjects: agreementSubjects(byID[plan.EnrollmentID].Agreement)})
	}
	a.json(w, 200, out)
}

func validateClassProgress(progress *domain.ClassProgress, enrollment domain.Enrollment) error {
	bad := domain.Fail(422, "validation", "Record a booked subject, 1–10 topics with evidence and practice, homework status, feedback and next steps. Test marks must be between zero and the maximum.")
	if progress == nil {
		return bad
	}
	subjects := agreementSubjects(enrollment.Agreement)
	if !slices.Contains(subjects, progress.Subject) && !(enrollment.Class <= 5 && slices.Contains(subjects, domain.AllSubjects) && slices.Contains(domain.TeachingSubjects, progress.Subject)) {
		return bad
	}
	if len(progress.Topics) < 1 || len(progress.Topics) > 10 || !enum(progress.HomeworkStatus, "not_checked", "assigned", "completed", "needs_help") || !validText(progress.Feedback, 5, 2000) || !validText(progress.NextSteps, 5, 1200) {
		return bad
	}
	seen := map[string]bool{}
	for _, topic := range progress.Topics {
		key := strings.ToLower(strings.TrimSpace(topic.Title))
		if !validText(topic.Title, 2, 160) || seen[key] || !enum(topic.Status, "introduced", "practising", "independent", "needs_review") || !validText(topic.Evidence, 5, 1200) || !validText(topic.Practice, 5, 1200) {
			return bad
		}
		seen[key] = true
	}
	if test := progress.Test; test != nil && (!validText(test.Title, 2, 160) || test.Maximum < 1 || test.Maximum > 10000 || test.Score < 0 || test.Score > test.Maximum) {
		return bad
	}
	return nil
}
