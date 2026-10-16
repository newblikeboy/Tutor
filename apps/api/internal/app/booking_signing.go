package app

import (
	"context"
	"crypto/hmac"
	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"net/http"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
)

type bookingSigningBinding struct {
	EnrollmentID string
	DocumentHash string
	Version      int
}

func (a *App) signableBooking(ctx context.Context, u domain.User, b bookingSigningBinding) (domain.Enrollment, error) {
	if u.Role != "tutor" {
		return domain.Enrollment{}, domain.Fail(403, "forbidden", "Only the assigned tutor may sign this booking.")
	}
	v, err := a.tuitionAccess(ctx, u, b.EnrollmentID)
	if err != nil {
		return v, err
	}
	if v.TutorID != u.ID || v.Status != "pending_tutor_acceptance" || v.TutorAgreement == nil {
		return v, domain.Fail(409, "invalid_transition", "This booking is not awaiting a tutor signature.")
	}
	if v.Version != b.Version || v.TutorAgreement.DocumentHash != b.DocumentHash {
		return v, domain.Fail(409, "stale_version", "The booking or agreement changed. Review it again before signing.")
	}
	if err = a.tutorTeachingAccess(ctx, u.ID); err != nil {
		return v, err
	}
	p, err := storage.One[domain.PaymentIntent](ctx, a.Store, "payment_intents", bson.M{"_id": v.PaymentIntentID, "enrollmentId": v.ID, "ownerId": v.OwnerID, "state": "captured"})
	if err != nil {
		return v, err
	}
	if p.Amount != v.Agreement.TotalPaise || p.Currency != v.Agreement.Currency || p.Refunded > 0 || p.RefundReserved > 0 {
		return v, domain.Fail(409, "payment_review", "The booking payment needs review before acceptance.")
	}
	return v, nil
}
func (a *App) requestBookingSigningCode(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "tutor") || !a.mailAvailable(w, r) {
		return
	}
	var in struct {
		Version      int    `json:"version"`
		DocumentHash string `json:"documentHash"`
		Accepted     bool   `json:"accepted"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	if !in.Accepted {
		a.error(w, r, domain.Fail(422, "agreement_required", "Read and agree to the displayed terms before requesting a signature code."))
		return
	}
	b := bookingSigningBinding{chi.URLParam(r, "id"), in.DocumentHash, in.Version}
	current, err := a.signableBooking(r.Context(), user(r), b)
	if err != nil {
		a.error(w, r, err)
		return
	}
	if current.TutorAgreement.Signature != nil {
		a.error(w, r, domain.Fail(409, "already_signed", "The agreement is already signed. Continue to Accept booking."))
		return
	}
	a.issueEmailCode(w, r, user(r).Email, "booking_sign", user(r).ID, b)
}
func (a *App) signBookingAgreement(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "tutor") || !a.mailAvailable(w, r) {
		return
	}
	if err := a.rate(r.Context(), "booking-sign:"+a.authClientIP(r), 20); err != nil {
		a.error(w, r, err)
		return
	}
	var in struct {
		Version      int    `json:"version"`
		DocumentHash string `json:"documentHash"`
		Accepted     bool   `json:"accepted"`
		ChallengeID  string `json:"challengeId"`
		Code         string `json:"code"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	if !in.Accepted || len(in.Code) != 6 || len(in.ChallengeID) > 200 {
		a.error(w, r, domain.Fail(422, "validation", "Agree to the displayed document and enter its six-digit email code."))
		return
	}
	valid := false
	err := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		valid = false
		b := bookingSigningBinding{chi.URLParam(r, "id"), in.DocumentHash, in.Version}
		v, err := a.signableBooking(ctx, user(r), b)
		if err != nil {
			return err
		}
		if v.TutorAgreement.Signature != nil {
			return domain.Fail(409, "already_signed", "This booking agreement is already signed. Continue to Accept booking.")
		}
		c, err := storage.One[emailChallenge](ctx, a.Store, "email_challenges", bson.M{"_id": in.ChallengeID, "userId": user(r).ID, "purpose": "booking_sign", "enrollmentId": v.ID, "documentHash": b.DocumentHash, "enrollmentVersion": b.Version})
		if err == mongo.ErrNoDocuments {
			return nil
		}
		if err != nil {
			return err
		}
		if c.Consumed || c.Attempts >= 5 || !c.ExpiresAt.After(a.Now()) {
			return nil
		}
		var guard emailChallenge
		err = a.Store.C("email_challenges").FindOneAndUpdate(ctx, bson.M{"_id": c.GuardID}, bson.M{"$inc": bson.M{"version": 1}}).Decode(&guard)
		if err != nil {
			return err
		}
		if guard.CurrentID != c.ID {
			return nil
		}
		if _, err = a.Store.C("email_challenges").UpdateOne(ctx, bson.M{"_id": c.ID}, bson.M{"$inc": bson.M{"attempts": 1}}); err != nil {
			return err
		}
		if !hmac.Equal([]byte(c.CodeHash), []byte(a.emailCodeHash(c.ID, c.Purpose, in.Code))) {
			return nil
		}
		cred, err := storage.One[credential](ctx, a.Store, "credentials", bson.M{"userId": user(r).ID})
		if err != nil {
			return err
		}
		if digest(cred.Hash) != c.CredentialHash {
			return nil
		}
		u, err := storage.One[domain.User](ctx, a.Store, "users", bson.M{"_id": user(r).ID})
		if err != nil {
			return err
		}
		if err = a.accountAccessError(u); err != nil {
			return err
		}
		v.TutorAgreement.Signature = &domain.TutorBookingSignature{TutorID: u.ID, Name: u.Name, Email: u.Email, DocumentHash: b.DocumentHash, SignedAt: a.Now()}
		v.Version++
		if _, err = a.Store.C("enrollments").ReplaceOne(ctx, bson.M{"_id": v.ID}, v); err != nil {
			return err
		}
		if _, err = a.Store.C("email_challenges").UpdateOne(ctx, bson.M{"_id": c.ID}, bson.M{"$set": bson.M{"consumed": true}}); err != nil {
			return err
		}
		valid = true
		return a.audit(ctx, u.ID, "booking.agreement_signed", v.ID)
	})
	if err != nil {
		a.error(w, r, err)
		return
	}
	if !valid {
		a.error(w, r, domain.Fail(422, "invalid_code", "This code is invalid, expired or has already been used. Request a new code if needed."))
		return
	}
	a.json(w, 200, map[string]bool{"ok": true})
}
