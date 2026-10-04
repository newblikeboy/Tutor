package app

import (
	"bytes"
	"mime"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
)

func (a *App) approvedPublicTutor(r *http.Request) (domain.Application, error) {
	f := bson.M{"_id": chi.URLParam(r, "id"), "status": "approved", "scope.expiresAt": bson.M{"$gt": a.Now()}}
	if a.Config.Env == "production" {
		f["sample"] = false
	}
	return storage.One[domain.Application](r.Context(), a.Store, "applications", f)
}

func (a *App) tutorPhoto(w http.ResponseWriter, r *http.Request) {
	a.tutorMedia(w, r, "photo")
}

func (a *App) tutorIntroVideo(w http.ResponseWriter, r *http.Request) {
	a.tutorMedia(w, r, "video")
}

func (a *App) tutorMedia(w http.ResponseWriter, r *http.Request, kind string) {
	v, e := a.approvedPublicTutor(r)
	if e != nil {
		a.error(w, r, e)
		return
	}
	if v.Profile == nil {
		a.error(w, r, domain.Fail(404, "not_found", "Tutor media unavailable."))
		return
	}
	id := v.Profile.About.PhotoFileID
	if kind == "video" {
		id = v.Profile.Approach.DemoFileID
	}
	if id == "" {
		a.error(w, r, domain.Fail(404, "not_found", "Tutor media unavailable."))
		return
	}
	f, e := a.privateFile(r.Context(), id)
	if e != nil {
		a.error(w, r, e)
		return
	}
	if f.TargetKind != "application" || f.TargetID != v.ID || f.Status == "archived" {
		a.error(w, r, domain.Fail(404, "not_found", "Tutor media unavailable."))
		return
	}
	if kind == "photo" && f.ContentType != "image/jpeg" && f.ContentType != "image/png" {
		a.error(w, r, domain.Fail(404, "not_found", "Tutor photo unavailable."))
		return
	}
	if kind == "video" && f.ContentType != "video/mp4" {
		a.error(w, r, domain.Fail(404, "not_found", "Tutor introduction video unavailable."))
		return
	}
	if f.Provider == "cloudinary" {
		if a.DirectFiles == nil || f.Status != "ready" {
			a.error(w, r, domain.Fail(404, "not_found", "Tutor media unavailable."))
			return
		}
		format := map[string]string{"image/jpeg": "jpg", "image/png": "png", "video/mp4": "mp4"}[f.ContentType]
		w.Header().Set("Cache-Control", "private, no-store")
		w.Header().Set("Referrer-Policy", "no-referrer")
		http.Redirect(w, r, a.DirectFiles.Delivery(f.PublicID, f.ResourceType, format, false, a.Now()), http.StatusFound)
		return
	}
	if f.Status != "clean" || f.ScannedAt == nil {
		a.error(w, r, domain.Fail(404, "not_found", "Tutor media unavailable."))
		return
	}
	store := a.fileStore(f)
	if store == nil {
		a.error(w, r, domain.Fail(503, "storage_unconfigured", "Private storage is unavailable."))
		return
	}
	data, e := store.Read(r.Context(), f.ObjectKey)
	if e != nil || len(data) != f.Size || digest(string(data)) != f.Checksum {
		a.error(w, r, domain.Fail(503, "storage_unavailable", "Private file integrity could not be verified."))
		return
	}
	if _, e = a.approvedPublicTutor(r); e != nil {
		a.error(w, r, e)
		return
	}
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("Content-Disposition", mime.FormatMediaType("inline", map[string]string{"filename": f.Name}))
	w.Header().Set("Content-Type", f.ContentType)
	if kind == "video" {
		http.ServeContent(w, r, "introduction.mp4", f.CreatedAt, bytes.NewReader(data))
		return
	}
	w.Header().Set("Content-Security-Policy", "sandbox; default-src 'none'")
	w.Header().Set("Content-Length", strconv.Itoa(len(data)))
	if !strings.HasPrefix(f.ContentType, "image/") {
		a.error(w, r, domain.Fail(404, "not_found", "Tutor photo unavailable."))
		return
	}
	w.WriteHeader(200)
	_, _ = w.Write(data)
}
