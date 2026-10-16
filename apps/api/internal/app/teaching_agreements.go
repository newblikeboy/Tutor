package app

import (
	"context"
	"encoding/json"
	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"net/http"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
)

func (a *App) teachingAgreementDraft(ctx context.Context, mode string) (domain.TeachingAgreementDraft, error) {
	d, err := storage.One[domain.TeachingAgreementDraft](ctx, a.Store, "teaching_agreements", bson.M{"_id": mode})
	if err == mongo.ErrNoDocuments {
		return domain.TeachingAgreementDraft{ID: mode, Mode: mode}, nil
	}
	return d, err
}
func (a *App) teachingAgreements(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "admin") {
		return
	}
	result := []domain.TeachingAgreementDraft{}
	for _, mode := range []string{"online", "home"} {
		d, err := a.teachingAgreementDraft(r.Context(), mode)
		if err != nil {
			a.error(w, r, err)
			return
		}
		result = append(result, d)
	}
	a.json(w, 200, map[string]any{"items": result})
}
func (a *App) saveTeachingAgreement(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "admin") {
		return
	}
	mode := chi.URLParam(r, "mode")
	var in struct {
		Version int                             `json:"version"`
		Action  string                          `json:"action"`
		Content domain.TeachingAgreementContent `json:"content"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	if !enum(mode, "online", "home") || !enum(in.Action, "save", "publish") || !validText(in.Content.Title, 3, 150) || !validText(in.Content.Body, 20, 20000) || len(in.Content.Privacy) > 15000 || len(in.Content.Education) > 15000 {
		a.error(w, r, domain.Fail(422, "validation", "Write a title and agreement of 20–20,000 characters. Each policy section allows up to 15,000 characters."))
		return
	}
	if in.Action == "publish" && (!validText(in.Content.Privacy, 10, 15000) || !validText(in.Content.Education, 10, 15000)) {
		a.error(w, r, domain.Fail(422, "validation", "Include the privacy and education conditions before publishing."))
		return
	}
	var result domain.TeachingAgreementDraft
	err := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		d, err := a.teachingAgreementDraft(ctx, mode)
		if err != nil {
			return err
		}
		if d.Version != in.Version {
			return domain.Fail(409, "stale_version", "This agreement changed. Reload the latest draft before saving.")
		}
		d.Version++
		d.Draft = in.Content
		if in.Action == "publish" {
			p := domain.TeachingAgreementVersion{TeachingAgreementContent: in.Content, Mode: mode, Version: d.Version, PublishedAt: a.Now()}
			d.Published = &p
			if _, err = a.Store.C("teaching_agreements").InsertOne(ctx, bson.M{"_id": mode + ":" + token(), "mode": mode, "version": p.Version, "published": p, "publishedBy": user(r).ID}); err != nil {
				return err
			}
		}
		if in.Version == 0 {
			_, err = a.Store.C("teaching_agreements").InsertOne(ctx, d)
		} else {
			_, err = a.Store.C("teaching_agreements").ReplaceOne(ctx, bson.M{"_id": mode, "version": in.Version}, d)
		}
		if err != nil {
			return err
		}
		result = d
		return a.audit(ctx, user(r).ID, "teaching_agreement."+in.Action, mode)
	})
	if err != nil {
		a.error(w, r, err)
		return
	}
	a.json(w, 200, result)
}
func (a *App) bookingTeachingAgreement(ctx context.Context, mode, id string, booking domain.Agreement) (*domain.TutorBookingAgreement, error) {
	d, err := a.teachingAgreementDraft(ctx, mode)
	if err != nil {
		return nil, err
	}
	if d.Published == nil {
		return nil, domain.Fail(409, "agreement_unpublished", "The administrator must publish the tutor agreement for this teaching mode before a new booking can be made.")
	}
	// Contend on the head so a checkout cannot race a policy publication.
	if _, err = a.Store.C("teaching_agreements").UpdateOne(ctx, bson.M{"_id": mode, "version": d.Version}, bson.M{"$inc": bson.M{"bookings": 1}}); err != nil {
		return nil, err
	}
	encoded, err := json.Marshal(struct {
		BookingID string
		Agreement domain.TeachingAgreementVersion
		Booking   domain.Agreement
	}{id, *d.Published, booking})
	if err != nil {
		return nil, err
	}
	return &domain.TutorBookingAgreement{TeachingAgreementVersion: *d.Published, DocumentHash: digest(string(encoded))}, nil
}
