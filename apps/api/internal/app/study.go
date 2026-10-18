package app

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
)

// studyStudent resolves only the selected household-owned, consented student.
// A sibling's subscription must never authorize this student's content request.
func (a *App) studyStudent(ctx context.Context, owner, id string) (domain.Learner, error) {
	l, err := storage.One[domain.Learner](ctx, a.Store, "learners", bson.M{"_id": id, "ownerId": owner})
	if err == nil {
		err = a.checkLearnerConsent(ctx, owner, LearnerInput{Kind: l.Kind, ConsentID: l.ConsentID})
	}
	return l, err
}

// studyEntitlement checks the access window on every request; MongoDB TTL cleanup
// is not an authorization boundary. Simulation access requires explicit config.
func (a *App) studyEntitlement(ctx context.Context, owner, learner string) (domain.StudyAccess, bool, error) {
	v, err := storage.One[domain.StudyAccess](ctx, a.Store, "study_access", bson.M{"_id": learner, "ownerId": owner})
	if errors.Is(err, mongo.ErrNoDocuments) {
		return domain.StudyAccess{ID: learner, LearnerID: learner}, false, nil
	}
	active := err == nil && !v.StartsAt.After(a.Now()) && v.ExpiresAt.After(a.Now()) && (!v.Simulated || a.Config.PaymentProvider == "simulation")
	return v, active, err
}

func studyMatches(m domain.StudyMaterial, l domain.Learner) bool {
	return m.Status == "published" && m.Class == l.Class && (m.Board == "All" || m.Board == l.Board)
}

func (a *App) studyLibrary(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "parent") {
		return
	}
	l, err := a.studyStudent(r.Context(), user(r).ID, r.URL.Query().Get("learner"))
	if err != nil {
		a.error(w, r, err)
		return
	}
	v, active, err := a.studyEntitlement(r.Context(), user(r).ID, l.ID)
	if err != nil {
		a.error(w, r, err)
		return
	}
	f := bson.M{"status": "published", "class": l.Class, "board": bson.M{"$in": []string{"All", l.Board}}}
	if kind := r.URL.Query().Get("kind"); kind != "" {
		f["kind"] = kind
	}
	p := recordPage[domain.StudyMaterial]{Items: []domain.StudyMaterial{}}
	if active {
		p, err = pageRecords[domain.StudyMaterial](r.Context(), a.Store, "study_materials", f, r.URL.Query().Get("cursor"))
		if err != nil {
			a.error(w, r, err)
			return
		}
	}
	for i := range p.Items {
		p.Items[i].Questions = nil
		p.Items[i].FileID = ""
	}
	attempts, err := pageRecords[domain.StudyAttempt](r.Context(), a.Store, "study_attempts", bson.M{"ownerId": user(r).ID, "learnerId": l.ID}, r.URL.Query().Get("attemptCursor"))
	if err != nil {
		a.error(w, r, err)
		return
	}
	var pending *domain.PaymentIntent
	if v.IntentID != "" {
		intent, e := storage.One[domain.PaymentIntent](r.Context(), a.Store, "payment_intents", bson.M{"_id": v.IntentID, "ownerId": user(r).ID})
		if e != nil {
			a.error(w, r, e)
			return
		}
		if intent.PaymentID == "" {
			pending = &intent
		}
	}
	a.json(w, 200, map[string]any{"student": l, "subscription": v, "active": active, "pricePaise": domain.StudyPricePaise, "materials": p, "attempts": attempts, "pendingPayment": pending})
}

func (a *App) studyMaterialAccess(ctx context.Context, u domain.User, id, learner string) (domain.StudyMaterial, error) {
	m, err := storage.One[domain.StudyMaterial](ctx, a.Store, "study_materials", bson.M{"_id": id})
	if err != nil {
		return m, err
	}
	if u.Role == "admin" {
		return m, nil
	}
	if u.Role != "parent" {
		return m, mongo.ErrNoDocuments
	}
	l, err := a.studyStudent(ctx, u.ID, learner)
	if err != nil {
		return m, err
	}
	if !studyMatches(m, l) {
		return m, mongo.ErrNoDocuments
	}
	_, active, err := a.studyEntitlement(ctx, u.ID, l.ID)
	if err != nil {
		return m, err
	}
	if !active {
		return m, domain.Fail(403, "study_subscription_required", "Renew this student's study subscription to open materials.")
	}
	return m, nil
}

func (a *App) studyDetail(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "parent", "admin") {
		return
	}
	m, err := a.studyMaterialAccess(r.Context(), user(r), chi.URLParam(r, "id"), r.URL.Query().Get("learner"))
	if err != nil {
		a.error(w, r, err)
		return
	}
	if user(r).Role != "admin" {
		for i := range m.Questions {
			m.Questions[i].CorrectOption = nil
		}
	}
	a.json(w, 200, m)
}

func (a *App) adminStudyMaterials(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "admin") {
		return
	}
	f := bson.M{}
	if s := r.URL.Query().Get("status"); s != "" {
		f["status"] = s
	}
	p, err := pageRecords[domain.StudyMaterial](r.Context(), a.Store, "study_materials", f, r.URL.Query().Get("cursor"))
	if err != nil {
		a.error(w, r, err)
		return
	}
	// The library list never needs an answer key or a potentially large question set.
	for i := range p.Items {
		p.Items[i].Questions = nil
	}
	a.json(w, 200, p)
}

func validateStudyMaterial(m domain.StudyMaterial) error {
	if !validText(m.Title, 3, 160) || !validText(m.Description, 0, 1200) || !validText(m.Subject, 2, 80) || m.Class < 1 || m.Class > 12 || !enum(m.Board, "All", "CBSE", "BSEB", "ICSE") || !enum(m.Kind, "unit_test", "mid_term", "monthly_test", "quiz", "notes") || !enum(m.Status, "draft", "published", "archived") {
		return domain.Fail(422, "validation", "Enter a title, subject, class, board and material type.")
	}
	if m.Kind == "quiz" {
		if len(m.Questions) > 50 || m.Status == "published" && len(m.Questions) == 0 {
			return domain.Fail(422, "validation", "A published quiz needs 1–50 questions.")
		}
		for _, q := range m.Questions {
			if !validText(q.Prompt, 3, 1000) || len(q.Options) < 2 || len(q.Options) > 6 || q.CorrectOption == nil || *q.CorrectOption < 0 || *q.CorrectOption >= len(q.Options) {
				return domain.Fail(422, "validation", "Each question needs 2–6 options and one correct answer.")
			}
			seen := map[string]bool{}
			for _, o := range q.Options {
				if !validText(o, 1, 300) || seen[clean(o)] {
					return domain.Fail(422, "validation", "Answer options must be non-empty and distinct.")
				}
				seen[clean(o)] = true
			}
		}
	} else if len(m.Questions) != 0 {
		return domain.Fail(422, "validation", "Questions belong to quizzes only.")
	}
	return nil
}

func (a *App) saveStudyMaterial(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "admin") {
		return
	}
	var in struct {
		Title           string                 `json:"title"`
		Description     string                 `json:"description"`
		Kind            string                 `json:"kind"`
		Class           int                    `json:"class"`
		Board           string                 `json:"board"`
		Subject         string                 `json:"subject"`
		Status          string                 `json:"status"`
		FileID          string                 `json:"fileId"`
		Questions       []domain.StudyQuestion `json:"questions"`
		ExpectedVersion int                    `json:"expectedVersion"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	id := chi.URLParam(r, "id")
	creating := id == ""
	if creating {
		id = a.chronologicalID()
	}
	m := domain.StudyMaterial{ID: id, Title: clean(in.Title), Description: clean(in.Description), Kind: in.Kind, Class: in.Class, Board: in.Board, Subject: clean(in.Subject), Status: in.Status, FileID: in.FileID, Questions: in.Questions, Version: in.ExpectedVersion + 1, UpdatedAt: a.Now(), UpdatedBy: user(r).ID}
	if m.Kind == "quiz" {
		m.FileID = ""
	}
	if err := validateStudyMaterial(m); err != nil {
		a.error(w, r, err)
		return
	}
	err := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		retained := false
		if creating {
			if in.ExpectedVersion != 0 {
				return domain.Fail(422, "validation", "New materials start at version zero.")
			}
		} else {
			old, err := storage.One[domain.StudyMaterial](ctx, a.Store, "study_materials", bson.M{"_id": id})
			if err != nil {
				return err
			}
			if old.Version != in.ExpectedVersion {
				return domain.Fail(409, "stale_version", "This material changed. Reload before saving.")
			}
			retained = old.Subject == m.Subject && m.Status != "published"
		}
		if !retained {
			if err := a.activeSubject(ctx, m.Subject, true); err != nil {
				return err
			}
		}
		if m.FileID != "" {
			f, err := a.privateFile(ctx, m.FileID)
			if err != nil {
				return err
			}
			if f.TargetKind != "study" || f.TargetID != id || f.Status != "ready" || f.ContentType != "application/pdf" {
				return domain.Fail(422, "validation", "Select a verified PDF uploaded to this material.")
			}
		}
		if m.Kind != "quiz" && m.Status == "published" && m.FileID == "" {
			return domain.Fail(422, "validation", "Upload a PDF before publishing.")
		}
		if creating {
			if _, err := a.Store.C("study_materials").InsertOne(ctx, m); err != nil {
				return err
			}
		} else if _, err := a.Store.C("study_materials").ReplaceOne(ctx, bson.M{"_id": id, "version": in.ExpectedVersion}, m); err != nil {
			return err
		}
		return a.audit(ctx, user(r).ID, "study.material_"+m.Status, id)
	})
	if err != nil {
		a.error(w, r, err)
		return
	}
	status := 200
	if creating {
		status = 201
	}
	a.json(w, status, m)
}

func (a *App) submitStudyQuiz(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "parent") {
		return
	}
	if err := a.rate(r.Context(), "study-quiz:"+user(r).ID, 30); err != nil {
		a.error(w, r, err)
		return
	}
	var in struct {
		LearnerID string `json:"learnerId"`
		Version   int    `json:"version"`
		Answers   []int  `json:"answers"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	var out domain.StudyAttempt
	id := a.chronologicalID()
	err := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		if _, err := a.referenceLearner(ctx, user(r).ID, in.LearnerID); err != nil {
			return err
		}
		prior, fp, err := a.receipt(ctx, "study-quiz:"+user(r).ID, r.Header.Get("Idempotency-Key"), map[string]any{"material": chi.URLParam(r, "id"), "input": in})
		if err != nil {
			return err
		}
		if prior != "" {
			out, err = storage.One[domain.StudyAttempt](ctx, a.Store, "study_attempts", bson.M{"_id": prior, "ownerId": user(r).ID})
			return err
		}
		m, err := a.studyMaterialAccess(ctx, user(r), chi.URLParam(r, "id"), in.LearnerID)
		if err != nil {
			return err
		}
		if m.Kind != "quiz" || m.Version != in.Version {
			return domain.Fail(409, "stale_version", "This quiz changed. Reopen it before submitting.")
		}
		if len(in.Answers) != len(m.Questions) {
			return domain.Fail(422, "validation", "Answer every question before submitting.")
		}
		score := 0
		for i, answer := range in.Answers {
			if answer < 0 || answer >= len(m.Questions[i].Options) {
				return domain.Fail(422, "validation", "Choose a valid answer for every question.")
			}
			if m.Questions[i].CorrectOption != nil && answer == *m.Questions[i].CorrectOption {
				score++
			}
		}
		// Lock the current published revision against concurrent unpublishing/editing.
		if _, err = a.Store.C("study_materials").UpdateOne(ctx, bson.M{"_id": m.ID, "version": m.Version}, bson.M{"$inc": bson.M{"attemptRevision": 1}}); err != nil {
			return err
		}
		access, err := a.Store.C("study_access").UpdateOne(ctx, bson.M{"_id": in.LearnerID, "ownerId": user(r).ID, "expiresAt": bson.M{"$gt": a.Now()}}, bson.M{"$inc": bson.M{"version": 1}})
		if err != nil {
			return err
		}
		if access.MatchedCount != 1 {
			return domain.Fail(403, "study_subscription_required", "Renew this student's study subscription before submitting.")
		}
		out = domain.StudyAttempt{ID: id, OwnerID: user(r).ID, LearnerID: in.LearnerID, MaterialID: m.ID, Title: m.Title, MaterialVersion: m.Version, Score: score, Total: len(m.Questions), Answers: in.Answers, Snapshot: m.Questions, CreatedAt: a.Now()}
		if _, err = a.Store.C("study_attempts").InsertOne(ctx, out); err != nil {
			return err
		}
		return a.saveReceipt(ctx, "study-quiz:"+user(r).ID, r.Header.Get("Idempotency-Key"), fp, id)
	})
	if err != nil {
		a.error(w, r, err)
		return
	}
	a.json(w, 201, out)
}

// File endpoints re-check current publication, student ownership, consent and access.
func (a *App) studyFileAccess(ctx context.Context, u domain.User, id string, write bool) error {
	m, err := storage.One[domain.StudyMaterial](ctx, a.Store, "study_materials", bson.M{"_id": id})
	if err != nil {
		return err
	}
	if u.Role == "admin" {
		if write {
			_, err = a.Store.C("study_materials").UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$inc": bson.M{"assetRevision": 1}})
		}
		return err
	}
	if write || u.Role != "parent" || m.Status != "published" {
		return mongo.ErrNoDocuments
	}
	// Generic operations must never infer a licence from a different student.
	// Parent downloads use fileReadAccess with the explicit learner query.
	return domain.Fail(403, "study_subscription_required", "Choose a student with an active subscription.")
}

// Recheck the exact student and current PDF for every view/download, including
// legacy storage. Return the entitlement deadline to bound provider links.
func (a *App) fileReadAccess(r *http.Request, f domain.PrivateFile) (time.Time, error) {
	deadline := a.Now().Add(5 * time.Minute)
	if f.MessageDraft && f.MessageID == "" && f.UploaderID != user(r).ID {
		return deadline, mongo.ErrNoDocuments
	}
	if f.TargetKind != "study" || user(r).Role == "admin" {
		return deadline, a.fileAccess(r.Context(), user(r), f.TargetKind, f.TargetID, false)
	}
	if user(r).Role != "parent" {
		return deadline, mongo.ErrNoDocuments
	}
	learner := r.URL.Query().Get("learner")
	if learner == "" {
		return deadline, domain.Fail(403, "study_subscription_required", "Choose a student with an active subscription.")
	}
	m, err := a.studyMaterialAccess(r.Context(), user(r), f.TargetID, learner)
	if err != nil {
		return deadline, err
	}
	if m.FileID != f.ID || m.Kind == "quiz" {
		return deadline, mongo.ErrNoDocuments
	}
	v, active, err := a.studyEntitlement(r.Context(), user(r).ID, learner)
	if err != nil {
		return deadline, err
	}
	if !active {
		return deadline, domain.Fail(403, "study_subscription_required", "Renew this student's study subscription to open materials.")
	}
	if v.ExpiresAt.Before(deadline) {
		deadline = v.ExpiresAt
	}
	return deadline, nil
}

// Clamp month-end renewal dates in Indian service time, rather than overflowing
// 31 January into March. Expiry is exclusive and checked on every content request.
func studyMonthEnd(start time.Time) time.Time {
	zone := time.FixedZone("IST", 19800)
	s := start.In(zone)
	next := time.Date(s.Year(), s.Month()+1, 1, s.Hour(), s.Minute(), s.Second(), s.Nanosecond(), zone)
	last := time.Date(next.Year(), next.Month()+1, 0, 0, 0, 0, 0, zone).Day()
	day := s.Day()
	if day > last {
		day = last
	}
	return time.Date(next.Year(), next.Month(), day, s.Hour(), s.Minute(), s.Second(), s.Nanosecond(), zone).UTC()
}

func (a *App) lockStudyAccess(ctx context.Context, owner, learner string) (domain.StudyAccess, error) {
	var v domain.StudyAccess
	err := a.Store.C("study_access").FindOneAndUpdate(ctx, bson.M{"_id": learner, "ownerId": owner}, bson.M{"$setOnInsert": bson.M{"learnerId": learner, "startsAt": time.Time{}, "expiresAt": time.Time{}, "simulated": false}, "$inc": bson.M{"version": 1}}, options.FindOneAndUpdate().SetUpsert(true).SetReturnDocument(options.After)).Decode(&v)
	return v, err
}
