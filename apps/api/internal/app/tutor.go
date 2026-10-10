package app

import (
	"context"
	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"net/http"
	"slices"
	"time"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
)

func progressCorrectionOpen(s domain.ClassSession, now time.Time) bool {
	recorded := s.End
	if s.RecordedAt != nil {
		recorded = *s.RecordedAt
	}
	return !now.After(recorded.Add(7 * 24 * time.Hour))
}

func (a *App) validatePlannedSubject(ctx context.Context, tutorID, subject string, en domain.Enrollment) error {
	subjects := agreementSubjects(en.Agreement)
	if !slices.Contains(subjects, subject) && !(en.Class <= 5 && slices.Contains(subjects, domain.AllSubjects) && slices.Contains(domain.TeachingSubjects, subject)) {
		return domain.Fail(422, "validation", "Choose a subject included in this booking.")
	}
	// A write to the approval serializes planning against suspension and changes of scope.
	var app domain.Application
	err := a.Store.C("applications").FindOneAndUpdate(ctx, bson.M{"_id": tutorID}, bson.M{"$inc": bson.M{"version": 1}}, options.FindOneAndUpdate().SetReturnDocument(options.After)).Decode(&app)
	if err != nil {
		return err
	}
	if !domain.EligibleForMode(app, en.Class, en.Agreement.Mode, a.Now()) || !app.Scope.CoversSubjects(subjects) {
		return domain.Fail(403, "scope_unavailable", "Approval must cover the booked subjects and teaching mode.")
	}
	return nil
}

// Retry-safe activity creation never resets an existing recipient's read state.
func (a *App) notifyActivity(ctx context.Context, recipient, kind, target string) error {
	n := domain.Notification{ID: kind + ":" + target + ":" + recipient, OwnerID: recipient, Kind: kind, TargetID: target, CreatedAt: a.Now()}
	_, err := a.Store.C("notifications").UpdateOne(ctx, bson.M{"_id": n.ID}, bson.M{"$setOnInsert": n}, options.UpdateOne().SetUpsert(true))
	return err
}

func (a *App) tutorTeachingAccess(ctx context.Context, id string) error {
	app, err := storage.One[domain.Application](ctx, a.Store, "applications", bson.M{"_id": id})
	if err != nil {
		return err
	}
	if app.Status != "approved" || !app.Scope.ExpiresAt.After(a.Now()) {
		return domain.Fail(403, "tutor_restricted", "Teaching access is restricted.")
	}
	return nil
}

// Archives are read-only. Operational access for files, messages and handovers
// continues to use tuitionAccess, which excludes finished assignments.
func (a *App) tuitionReadAccess(ctx context.Context, u domain.User, id string) (domain.Enrollment, error) {
	if u.Role != "tutor" {
		return a.tuitionAccess(ctx, u, id)
	}
	if err := a.tutorTeachingAccess(ctx, u.ID); err != nil {
		return domain.Enrollment{}, err
	}
	en, err := storage.One[domain.Enrollment](ctx, a.Store, "enrollments", bson.M{"_id": id, "tutorId": u.ID, "status": bson.M{"$in": []string{"active", "paused", "completed", "cancelled", "pending_agreement"}}})
	if err != nil {
		return en, err
	}
	visible, err := a.tutorArchiveVisible(ctx, en)
	if err != nil {
		return en, err
	}
	if !visible {
		return domain.Enrollment{}, domain.Fail(404, "not_found", "This booking is unavailable.")
	}
	return en, nil
}

func (a *App) tutorArchiveVisible(ctx context.Context, en domain.Enrollment) (bool, error) {
	if en.Status != "cancelled" {
		return true, nil
	}
	paid, err := a.Store.C("finance_bookings").CountDocuments(ctx, bson.M{"enrollmentId": en.ID})
	if err != nil {
		return false, err
	}
	if paid > 0 {
		return true, nil
	}
	taught, err := a.Store.C("classes").CountDocuments(ctx, bson.M{"enrollmentId": en.ID, "status": bson.M{"$in": []string{"completed", "reviewed", "missed", "awaiting_review"}}})
	return taught > 0, err
}

func (a *App) tutorWorkspace(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "tutor") {
		return
	}
	ctx, u := r.Context(), user(r)
	if err := a.tutorTeachingAccess(ctx, u.ID); err != nil {
		a.error(w, r, err)
		return
	}
	out := domain.TutorWorkspace{Briefs: []domain.TutorLearnerBrief{}, Learners: []domain.Learner{}, Enrollments: []domain.Enrollment{}, Sessions: []domain.ClassSession{}, Trials: []domain.Trial{}, Notifications: []domain.Notification{}}
	var err error
	out.Enrollments, err = progressRecords[domain.Enrollment](ctx, a.Store, "enrollments", bson.M{"tutorId": u.ID, "status": bson.M{"$in": []string{"active", "paused", "completed", "cancelled"}}})
	if err != nil {
		a.error(w, r, err)
		return
	}
	retained := []domain.Enrollment{}
	for _, en := range out.Enrollments {
		visible, er := a.tutorArchiveVisible(ctx, en)
		if er != nil {
			a.error(w, r, er)
			return
		}
		if visible {
			retained = append(retained, en)
		}
	}
	out.Enrollments = retained
	ids, learners := []string{}, []string{}
	for _, en := range out.Enrollments {
		ids = append(ids, en.ID)
		if enum(en.Status, "active", "paused") {
			learners = append(learners, en.LearnerID)
		}
	}
	out.Sessions, err = progressRecords[domain.ClassSession](ctx, a.Store, "classes", bson.M{"enrollmentId": bson.M{"$in": ids}, "tutorId": u.ID})
	if err != nil {
		a.error(w, r, err)
		return
	}
	out.Trials, err = progressRecords[domain.Trial](ctx, a.Store, "trials", bson.M{"tutorId": u.ID})
	if err != nil {
		a.error(w, r, err)
		return
	}
	for _, trial := range out.Trials {
		if enum(trial.Status, "requested", "confirmed") {
			learners = append(learners, trial.LearnerID)
		}
	}
	out.Learners, err = progressRecords[domain.Learner](ctx, a.Store, "learners", bson.M{"_id": bson.M{"$in": learners}})
	if err != nil {
		a.error(w, r, err)
		return
	}
	approval, err := storage.One[domain.Application](ctx, a.Store, "applications", bson.M{"_id": u.ID})
	if err != nil {
		a.error(w, r, err)
		return
	}
	homeOwners := map[string]string{}
	for _, en := range out.Enrollments {
		if enum(en.Status, "active", "paused") && en.Agreement.Mode == "home" && domain.EligibleForMode(approval, en.Class, "home", a.Now()) && approval.Scope.CoversSubjects(agreementSubjects(en.Agreement)) {
			homeOwners[en.LearnerID] = en.OwnerID
		}
	}
	for _, trial := range out.Trials {
		if trial.Status == "confirmed" && trial.Mode == "home" && domain.EligibleForMode(approval, trial.Class, "home", a.Now()) && approval.Scope.CoversSubjects(trial.Subjects) {
			homeOwners[trial.LearnerID] = trial.OwnerID
		}
	}
	for learner, owner := range homeOwners {
		p, er := storage.One[accountPreferences](ctx, a.Store, "preferences", bson.M{"_id": owner})
		if er != nil && er != mongo.ErrNoDocuments {
			a.error(w, r, er)
			return
		}
		out.Briefs = append(out.Briefs, domain.TutorLearnerBrief{LearnerID: learner, Location: p.Location})
	}
	out.Notifications, err = progressRecords[domain.Notification](ctx, a.Store, "notifications", bson.M{"ownerId": u.ID, "kind": "booking_confirmed", "read": false, "targetId": bson.M{"$in": ids}})
	if err != nil {
		a.error(w, r, err)
		return
	}
	a.json(w, 200, out)
}

func (a *App) tutorLearnerProgress(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "tutor") {
		return
	}
	ctx, u := r.Context(), user(r)
	if err := a.tutorTeachingAccess(ctx, u.ID); err != nil {
		a.error(w, r, err)
		return
	}
	// No report access based solely on an old trial or former assignment.
	assigned, err := a.Store.C("enrollments").CountDocuments(ctx, bson.M{"learnerId": chi.URLParam(r, "id"), "tutorId": u.ID, "status": bson.M{"$in": []string{"active", "paused"}}})
	if err != nil {
		a.error(w, r, err)
		return
	}
	if assigned == 0 {
		a.error(w, r, domain.Fail(404, "not_found", "This learner is no longer in your current assignments. Use package history for your saved lesson records."))
		return
	}

	ens, err := progressRecords[domain.Enrollment](ctx, a.Store, "enrollments", bson.M{"learnerId": chi.URLParam(r, "id"), "tutorId": u.ID, "status": bson.M{"$in": []string{"active", "paused", "completed"}}})
	if err != nil {
		a.error(w, r, err)
		return
	}
	if len(ens) == 0 {
		a.error(w, r, domain.Fail(404, "not_found", "This learner report is unavailable."))
		return
	}
	out := domain.LearnerProgress{Enrollments: ens, Sessions: []domain.ProgressSession{}, Trials: []domain.ProgressTrial{}, Plans: []domain.ProgressPlan{}, Handovers: []domain.Handover{}}
	ids := []string{}
	byID := map[string]domain.Enrollment{}
	for _, en := range ens {
		ids = append(ids, en.ID)
		byID[en.ID] = en
	}
	sessions, err := progressRecords[domain.ClassSession](ctx, a.Store, "classes", bson.M{"enrollmentId": bson.M{"$in": ids}, "tutorId": u.ID, "status": bson.M{"$nin": []string{"held", "planned"}}})
	if err != nil {
		a.error(w, r, err)
		return
	}
	for _, s := range sessions {
		out.Sessions = append(out.Sessions, domain.ProgressSession{ClassSession: s, TutorName: u.Name, Subjects: agreementSubjects(byID[s.EnrollmentID].Agreement)})
	}
	plans, err := progressRecords[domain.LearningPlan](ctx, a.Store, "learning_plans", bson.M{"enrollmentId": bson.M{"$in": ids}})
	if err != nil {
		a.error(w, r, err)
		return
	}
	for _, p := range plans {
		author, er := storage.One[domain.User](ctx, a.Store, "users", bson.M{"_id": p.AuthorID})
		if er != nil && er != mongo.ErrNoDocuments {
			a.error(w, r, er)
			return
		}
		out.Plans = append(out.Plans, domain.ProgressPlan{LearningPlan: p, AuthorName: author.Name, Subjects: agreementSubjects(byID[p.EnrollmentID].Agreement)})
	}
	trials, err := progressRecords[domain.Trial](ctx, a.Store, "trials", bson.M{"learnerId": chi.URLParam(r, "id"), "tutorId": u.ID, "status": bson.M{"$in": []string{"completed", "reviewed"}}})
	if err != nil {
		a.error(w, r, err)
		return
	}
	for _, t := range trials {
		out.Trials = append(out.Trials, domain.ProgressTrial{Trial: t, TutorName: u.Name})
	}
	a.json(w, 200, out)
}
