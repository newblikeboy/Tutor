package app

import (
	"context"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"net/http"
	"slices"
	"time"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
)

func (a *App) ownApprovedTutor(ctx context.Context, u domain.User) (domain.Application, error) {
	if u.Role != "tutor" {
		return domain.Application{}, domain.Fail(403, "forbidden", "Only an approved tutor can manage their public profile.")
	}
	return storage.One[domain.Application](ctx, a.Store, "applications", bson.M{"_id": u.ID, "status": "approved", "scope.expiresAt": bson.M{"$gt": a.Now()}})
}

func publicProfile(v domain.Application) domain.TutorPublicProfile {
	if v.PublicProfile != nil {
		return *v.PublicProfile
	}
	p := domain.TutorPublicProfile{Introduction: v.Approach}
	if v.Profile != nil {
		p.PhotoFileID = v.Profile.About.PhotoFileID
	}
	return p
}

func bookingModes(v domain.Application, av domain.Availability, online bool) []string {
	modes := []string{}
	if av.Paused || len(av.Windows) == 0 {
		return modes
	}
	for _, mode := range v.Scope.ApprovedModes() {
		if mode == "home" || online {
			modes = append(modes, mode)
		}
	}
	return modes
}

func (a *App) publicTutor(ctx context.Context, v domain.Application) (domain.PublicTutor, error) {
	out := v.Public()
	av, e := storage.One[domain.Availability](ctx, a.Store, "availability", bson.M{"_id": v.ID})
	if e != nil && e != mongo.ErrNoDocuments {
		return out, e
	}
	c, e := storage.One[googleConnection](ctx, a.Store, "google_connections", bson.M{"_id": v.ID, "status": "connected"})
	if e != nil && e != mongo.ErrNoDocuments {
		return out, e
	}
	out.TeachingHoursSet = len(av.Windows) > 0 && !av.Paused
	out.BookingModes = bookingModes(v, av, a.Google != nil && a.Config.MeetingProvider == "google" && c.ID != "")
	return out, nil
}

func (a *App) ownTutorProfile(w http.ResponseWriter, r *http.Request) {
	v, e := a.ownApprovedTutor(r.Context(), user(r))
	if e != nil {
		a.error(w, r, e)
		return
	}
	tutor, e := a.publicTutor(r.Context(), v)
	if e != nil {
		a.error(w, r, e)
		return
	}
	files, e := a.applicationFilePage(r.Context(), v.ID, "")
	if e != nil {
		a.error(w, r, e)
		return
	}
	extra, e := storage.Many[domain.PrivateFile](r.Context(), a.Store, "files", bson.M{"targetKind": "public_profile", "targetId": v.ID, "status": bson.M{"$ne": "archived"}})
	if e != nil {
		a.error(w, r, e)
		return
	}
	files.Items = append(files.Items, extra...)
	permitted := make([]domain.PrivateFile, 0, len(files.Items))
	for _, file := range files.Items {
		if publicApplicationMedia(v, file) {
			permitted = append(permitted, file)
		}
	}
	a.json(w, 200, map[string]any{"profile": publicProfile(v), "tutor": tutor, "files": permitted})
}

func (a *App) saveTutorProfile(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "tutor") {
		return
	}
	var in struct {
		Version          *int   `json:"version"`
		Introduction     string `json:"introduction"`
		PhotoFileID      string `json:"photoFileId"`
		IntroVideoFileID string `json:"introVideoFileId"`
		PublishVideo     bool   `json:"publishVideo"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	if in.Version == nil || *in.Version < 0 || !validText(in.Introduction, 40, 1200) || len(in.PhotoFileID) > 100 || len(in.IntroVideoFileID) > 100 || in.PublishVideo && in.IntroVideoFileID == "" {
		a.error(w, r, domain.Fail(422, "validation", "Write an introduction of 40–1200 characters and choose media before publishing it."))
		return
	}
	u := user(r)
	e := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		v, e := a.ownApprovedTutor(ctx, u)
		if e != nil {
			return e
		}
		old := publicProfile(v)
		if old.Version != *in.Version {
			return domain.Fail(409, "stale", "Your public profile changed. Reload before saving.")
		}
		for _, link := range []struct{ id, kind string }{{in.PhotoFileID, "photo"}, {in.IntroVideoFileID, "video"}} {
			if link.id == "" {
				continue
			}
			f, er := a.privateFile(ctx, link.id)
			if er != nil {
				if er == mongo.ErrNoDocuments {
					return domain.Fail(422, "profile_media", "Choose your own ready photo or introduction video.")
				}
				return er
			}
			ready := f.Provider == "cloudinary" && f.Status == "ready" || f.Provider != "cloudinary" && f.Status == "clean" && f.ScannedAt != nil
			if !publicApplicationMedia(v, f) {
				return domain.Fail(422, "profile_media", "Identity and education documents cannot be used as public profile media.")
			}
			if f.TargetID != u.ID || f.UploaderID != u.ID || !enum(f.TargetKind, "application", "public_profile") || !ready || link.kind == "photo" && !enum(f.ContentType, "image/jpeg", "image/png") || link.kind == "video" && f.ContentType != "video/mp4" {
				return domain.Fail(422, "profile_media", "Choose your own ready photo or introduction video.")
			}
		}
		p := domain.TutorPublicProfile{Introduction: clean(in.Introduction), PhotoFileID: in.PhotoFileID, IntroVideoFileID: in.IntroVideoFileID, PublishVideo: in.PublishVideo, Version: old.Version + 1, UpdatedAt: a.Now()}
		result, e := a.Store.C("applications").UpdateOne(ctx, bson.M{"_id": u.ID, "version": v.Version}, bson.M{"$set": bson.M{"publicProfile": p}, "$inc": bson.M{"version": 1}})
		if e != nil {
			return e
		}
		if result.ModifiedCount != 1 {
			return domain.Fail(409, "stale", "Your application changed. Reload before saving your public profile.")
		}
		_, e = a.Store.C("audit").InsertOne(ctx, bson.M{"_id": a.chronologicalID(), "actor": u.ID, "action": "tutor.public_profile_updated", "target": u.ID, "at": a.Now(), "publicProfileVersion": p.Version, "photoFileId": p.PhotoFileID, "introVideoFileId": p.IntroVideoFileID, "videoPublished": p.PublishVideo})
		return e
	})
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.ownTutorProfile(w, r)
}

// This snapshot excludes existing tutor reservations and expired holds; the request
// transaction still rechecks learner conflicts, scope, capacity and ownership.
func (a *App) tutorTrialTimes(w http.ResponseWriter, r *http.Request) {
	v, e := a.approvedPublicTutor(r)
	if e != nil {
		a.error(w, r, e)
		return
	}
	mode := r.URL.Query().Get("mode")
	if !enum(mode, "online", "home") || !v.Scope.HasMode(mode) {
		a.error(w, r, domain.Fail(422, "validation", "Choose an approved teaching mode."))
		return
	}
	out, e := a.publicTutor(r.Context(), v)
	if e != nil {
		a.error(w, r, e)
		return
	}
	av, e := storage.One[domain.Availability](r.Context(), a.Store, "availability", bson.M{"_id": v.ID})
	if e != nil && e != mongo.ErrNoDocuments {
		a.error(w, r, e)
		return
	}
	slots := []domain.PublicTrialTime{}
	if slices.Contains(out.BookingModes, mode) {
		loc, e := time.LoadLocation(av.Timezone)
		if e != nil {
			a.error(w, r, e)
			return
		}
		now := a.Now()
		today := now.In(loc)
		keys := []string{}
		for d := now.UTC().Truncate(24 * time.Hour); d.Before(now.AddDate(0, 1, 0).Add(48 * time.Hour)); d = d.Add(24 * time.Hour) {
			keys = append(keys, "t:"+v.ID+":"+d.Format("2006-01-02"))
		}
		guards, e := storage.Many[guard](r.Context(), a.Store, "guards", bson.M{"_id": bson.M{"$in": keys}})
		if e != nil {
			a.error(w, r, e)
			return
		}
		byDay := map[string][]interval{}
		for _, g := range guards {
			byDay[g.ID] = g.Intervals
		}
		for d := 0; d <= 31; d++ {
			day := time.Date(today.Year(), today.Month(), today.Day()+d, 0, 0, 0, 0, loc)
			for minute := 0; minute+60 <= 1440; minute += 30 {
				start, ok := availabilityBoundary(day, minute)
				end, okEnd := availabilityBoundary(day, minute+60)
				if !ok || !okEnd || !start.After(now.Add(5*time.Minute)) || start.After(now.AddDate(0, 1, 0)) || end.After(v.Scope.ExpiresAt) || !available(av, start, end) {
					continue
				}
				free := true
				buffer := time.Duration(av.BufferMinutes) * time.Minute
				for utcDay := start.Add(-buffer).UTC().Truncate(24 * time.Hour); utcDay.Before(end.Add(buffer)); utcDay = utcDay.Add(24 * time.Hour) {
					count := 0
					for _, iv := range byDay["t:"+v.ID+":"+utcDay.Format("2006-01-02")] {
						if iv.ExpiresAt != nil && !iv.ExpiresAt.After(now) {
							continue
						}
						count++
						if domain.Overlap(start.Add(-buffer), end.Add(buffer), iv.Start, iv.End) {
							free = false
						}
					}
					if count >= av.DailyCapacity {
						free = false
					}
				}
				if free {
					slots = append(slots, domain.PublicTrialTime{Start: start.UTC(), End: end.UTC()})
				}
			}
		}
	}
	a.json(w, 200, map[string]any{"mode": mode, "timezone": "Asia/Kolkata", "slots": slots})
}
