package app

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"regexp"
	"strings"

	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
)

func (a *App) subjectCatalog(ctx context.Context) ([]domain.Subject, error) {
	cur, err := a.Store.C("subjects").Find(ctx, bson.M{}, options.Find().SetSort(bson.D{{Key: "sortOrder", Value: 1}, {Key: "_id", Value: 1}}).SetLimit(201))
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	rows := []domain.Subject{}
	if err = cur.All(ctx, &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, domain.Fail(503, "subjects_unconfigured", "The subject catalog is unavailable. Contact support.")
	}
	if len(rows) > 200 {
		return nil, domain.Fail(503, "subjects_capacity", "The subject catalog needs an administrator's review.")
	}
	return rows, nil
}

func (a *App) subjects(w http.ResponseWriter, r *http.Request) {
	rows, err := a.subjectCatalog(r.Context())
	if err != nil {
		a.error(w, r, err)
		return
	}
	a.json(w, 200, map[string]any{"items": rows})
}

func (a *App) saveSubject(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "admin") {
		return
	}
	var in struct {
		Name            string `json:"name"`
		Active          *bool  `json:"active"`
		SortOrder       *int   `json:"sortOrder"`
		ExpectedVersion *int   `json:"expectedVersion"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	if in.Active == nil || in.SortOrder == nil || in.ExpectedVersion == nil {
		a.error(w, r, domain.Fail(422, "validation", "Include the active state, display order and current version."))
		return
	}
	active, order, version := *in.Active, *in.SortOrder, *in.ExpectedVersion
	in.Name = strings.Join(strings.Fields(in.Name), " ")
	if !validText(in.Name, 2, 80) || !regexp.MustCompile(`^[\pL\pN][\pL\pN .&()+-]*$`).MatchString(in.Name) || order < 0 || order > 999 || version < 0 {
		a.error(w, r, domain.Fail(422, "validation", "Enter a subject name (2–80 characters) and display order from 0–999."))
		return
	}
	id := chi.URLParam(r, "id")
	if r.URL.RawPath != "" {
		decoded, err := url.PathUnescape(id)
		if err != nil {
			a.error(w, r, domain.Fail(422, "validation", "Invalid subject reference."))
			return
		}
		id = decoded
	}
	creating := id == ""
	if creating {
		if strings.EqualFold(in.Name, domain.AllSubjects) {
			a.error(w, r, domain.Fail(409, "subject_protected", "All Subjects is a protected package subject."))
			return
		}
		id = in.Name
	}
	var out domain.Subject
	err := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		// Bound catalog creation and reserve historical keys/names across admins.
		if _, err := a.Store.C("guards").UpdateOne(ctx, bson.M{"_id": "subject-master"}, bson.M{"$inc": bson.M{"version": 1}}, options.UpdateOne().SetUpsert(true)); err != nil {
			return err
		}
		var old domain.Subject
		if creating {
			if version != 0 {
				return domain.Fail(422, "validation", "New subjects start at version zero.")
			}
			n, err := a.Store.C("subjects").CountDocuments(ctx, bson.M{})
			if err != nil {
				return err
			}
			if n >= 200 {
				return domain.Fail(409, "subjects_capacity", "The subject master supports up to 200 retained subjects.")
			}
		} else {
			var err error
			old, err = storage.One[domain.Subject](ctx, a.Store, "subjects", bson.M{"_id": id})
			if err != nil {
				return err
			}
			if old.Version != version {
				return domain.Fail(409, "stale_version", "This subject changed. Reload before saving.")
			}
			if old.System && (in.Name != domain.AllSubjects || !active) {
				return domain.Fail(409, "subject_protected", "All Subjects is required for Classes 1–5 and cannot be renamed or deactivated.")
			}
		}
		normalized := strings.ToLower(in.Name)
		conflict := a.Store.C("subjects").FindOne(ctx, bson.M{"_id": bson.M{"$ne": id}, "$or": []bson.M{{"normalizedName": normalized}, {"_id": in.Name}}}).Err()
		if conflict == nil {
			return domain.Fail(409, "subject_exists", "This subject name is already in use.")
		}
		if conflict != mongo.ErrNoDocuments {
			return conflict
		}
		out = domain.Subject{ID: id, Name: in.Name, NormalizedName: normalized, Active: active, SortOrder: order, System: old.System, Version: old.Version + 1, UseRevision: old.UseRevision, UpdatedAt: a.Now()}
		if creating {
			if _, err := a.Store.C("subjects").InsertOne(ctx, out); err != nil {
				return err
			}
		} else if _, err := a.Store.C("subjects").ReplaceOne(ctx, bson.M{"_id": id, "version": version}, out); err != nil {
			return err
		}
		return a.audit(ctx, user(r).ID, "subject.saved", id)
	})
	if mongo.IsDuplicateKeyError(err) {
		err = domain.Fail(409, "subject_exists", "This subject name or original reference is already in use.")
	}
	if err != nil {
		a.error(w, r, err)
		return
	}
	status := 200
	if creating {
		status = 201
	}
	a.json(w, status, out)
}

func (a *App) activeSubject(ctx context.Context, id string, lock bool) error {
	filter := bson.M{"_id": id, "active": true}
	var err error
	if lock {
		err = a.Store.C("subjects").FindOneAndUpdate(ctx, filter, bson.M{"$inc": bson.M{"useRevision": 1}}).Err()
	} else {
		err = a.Store.C("subjects").FindOne(ctx, filter).Err()
	}
	if errors.Is(err, mongo.ErrNoDocuments) {
		return domain.Fail(409, "subject_unavailable", "This subject is unavailable for new selections. Choose an active subject.")
	}
	return err
}

func (a *App) bookingSubjects(ctx context.Context, class int, selected []string) ([]string, error) {
	rows, err := a.subjectCatalog(ctx)
	if err != nil {
		return nil, err
	}
	available := []string{}
	for _, row := range rows {
		if row.Active {
			available = append(available, row.ID)
		}
	}
	ordered, err := domain.BookingSubjects(class, selected, available)
	if err != nil {
		return nil, err
	}
	for _, id := range ordered {
		if err = a.activeSubject(ctx, id, true); err != nil {
			return nil, err
		}
	}
	return ordered, nil
}

func (a *App) applicationSubjects(ctx context.Context, p domain.TutorApplication, old *domain.TutorApplication, submit bool) error {
	for _, area := range p.TeachingAreas {
		if area.Subject == "" {
			continue
		}
		retained := false
		if !submit && old != nil {
			for _, previous := range old.TeachingAreas {
				if previous.Subject == area.Subject {
					retained = true
					break
				}
			}
		}
		if retained {
			continue
		}
		if err := a.activeSubject(ctx, area.Subject, true); err != nil {
			return err
		}
	}
	return nil
}

func (a *App) subjectReferences(ctx context.Context) ([]string, error) {
	rows, err := a.subjectCatalog(ctx)
	if err != nil {
		return nil, err
	}
	ids := []string{}
	for _, row := range rows {
		ids = append(ids, row.ID)
	}
	return ids, nil
}

func (a *App) validateClassProgress(ctx context.Context, progress *domain.ClassProgress, enrollment domain.Enrollment) error {
	var primary []string
	if enrollment.Class <= 5 {
		var err error
		primary, err = a.subjectReferences(ctx)
		if err != nil {
			return err
		}
	}
	return validateClassProgress(progress, enrollment, primary)
}
