package app

import (
	"context"
	"fmt"
	"go.mongodb.org/mongo-driver/v2/bson"
	"net/http"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
)

func (a *App) queueClassCompletionEmail(ctx context.Context, en domain.Enrollment, s domain.ClassSession) error {
	if a.Mail == nil {
		return nil
	}
	return a.enqueue(ctx, "email:class-completed:"+s.ID+":"+en.OwnerID, "email", bson.M{"event": "class_completed", "recipientId": en.OwnerID, "targetKind": "class", "targetId": s.ID, "expectedStatus": s.Status, "start": s.Start.Format("2006-01-02T15:04:05.999999999Z07:00"), "tutorId": s.TutorID}, "pending")
}
func (a *App) recordedClassTutor(ctx context.Context, en domain.Enrollment, s domain.ClassSession) (string, error) {
	if s.TutorID == en.TutorID {
		return en.TutorName, nil
	}
	tutor, err := storage.One[domain.User](ctx, a.Store, "users", bson.M{"_id": s.TutorID})
	return tutor.Name, err
}
func (a *App) reportCompletedClass(w http.ResponseWriter, r *http.Request) {
	id, idError := decodedRouteID(r)
	if idError != nil {
		a.error(w, r, idError)
		return
	}
	if !a.role(w, r, "parent") {
		return
	}
	var in struct {
		Version int    `json:"version"`
		Reason  string `json:"reason"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	if !validText(in.Reason, 10, 2000) {
		a.error(w, r, domain.Fail(422, "validation", "Explain the class concern in 10–2,000 characters."))
		return
	}
	if err := a.rate(r.Context(), "class-report:"+user(r).ID, 8); err != nil {
		a.error(w, r, err)
		return
	}
	caseID := a.chronologicalID()
	var result domain.ServiceCase
	err := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		s, err := storage.One[domain.ClassSession](ctx, a.Store, "classes", bson.M{"_id": id})
		if err != nil {
			return err
		}
		en, err := a.tuitionReadAccess(ctx, user(r), s.EnrollmentID)
		if err != nil {
			return err
		}
		if en.OwnerID != user(r).ID {
			return domain.Fail(403, "forbidden", "Only the owning parent may report this class.")
		}
		prior, fp, err := a.receipt(ctx, "class-report:"+user(r).ID, r.Header.Get("Idempotency-Key"), struct {
			ClassID string
			Reason  string
		}{s.ID, in.Reason})
		if err != nil {
			return err
		}
		if prior != "" {
			result, err = storage.One[domain.ServiceCase](ctx, a.Store, "cases", bson.M{"_id": prior, "ownerId": en.OwnerID})
			return err
		}
		if s.Version != in.Version {
			return domain.Fail(409, "stale_version", "This class changed. Review its latest record before reporting.")
		}
		if !enum(s.Status, "completed", "reviewed") {
			return domain.Fail(409, "invalid_transition", "Only a class recorded as completed can be reported here.")
		}
		// Contend with progress/attendance updates without declaring the allegation an outcome.
		if _, err = a.Store.C("classes").UpdateOne(ctx, bson.M{"_id": s.ID, "version": s.Version}, bson.M{"$inc": bson.M{"version": 1}}); err != nil {
			return err
		}
		tutorName, err := a.recordedClassTutor(ctx, en, s)
		if err != nil {
			return err
		}
		result = domain.ServiceCase{ID: caseID, OwnerID: en.OwnerID, Kind: "support", Title: "Concern about a completed class", Body: fmt.Sprintf("Booking: %s\nClass: %s\nScheduled start: %s\nTutor: %s\n\n%s", en.ID, s.ID, s.Start.Format("2006-01-02T15:04:05Z07:00"), tutorName, clean(in.Reason)), Status: "open", Version: 1, CreatedAt: a.Now(), UpdatedAt: a.Now()}
		if _, err = a.Store.C("cases").InsertOne(ctx, result); err != nil {
			return err
		}
		if err = a.saveReceipt(ctx, "class-report:"+user(r).ID, r.Header.Get("Idempotency-Key"), fp, caseID); err != nil {
			return err
		}
		return a.audit(ctx, user(r).ID, "class.completion_reported", s.ID)
	})
	if err != nil {
		a.error(w, r, err)
		return
	}
	a.json(w, 201, caseView(result, user(r)))
}
