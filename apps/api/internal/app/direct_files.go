package app

import (
	"context"
	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"net/http"
	"strings"
	"time"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/media"
)

func (a *App) createUploadIntent(w http.ResponseWriter, r *http.Request) {
	kind, target := mediaTarget(r)
	u := user(r)
	if e := a.fileAccess(r.Context(), u, kind, target, false); e != nil {
		a.error(w, r, e)
		return
	}
	if a.DirectFiles == nil {
		a.error(w, r, domain.Fail(503, "storage_unconfigured", "Cloudinary uploads are not configured."))
		return
	}
	if e := a.rate(r.Context(), "upload:"+u.ID, 8); e != nil {
		a.error(w, r, e)
		return
	}
	var in struct {
		Name        string `json:"name"`
		ContentType string `json:"contentType"`
		Size        int    `json:"size"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	name, resource, format, e := media.UploadMetadata(in.Name, in.ContentType, in.Size, kind == "application")
	if e != nil {
		a.error(w, r, domain.Fail(422, "application_file", "Choose a JPG, PNG or PDF up to 3 MiB, or an application MP4 up to 25 MiB."))
		return
	}
	if resource == "video" && a.Config.VideoProvider != "cloudinary" || resource != "video" && a.Config.MediaProvider != "cloudinary" {
		a.error(w, r, domain.Fail(503, "storage_unconfigured", "Cloudinary uploads are not configured for this file type."))
		return
	}
	id, object := a.chronologicalID(), token()
	if kind == "application" {
		id = applicationFilePrefix + id
	}
	publicID := "private-uploads/" + object
	if resource == "raw" {
		publicID += "." + format
	}
	var file domain.PrivateFile
	resume := false
	e = a.Store.Tx(r.Context(), func(ctx context.Context) error {
		prior, fp, e := a.receipt(ctx, "direct-file:"+u.ID, r.Header.Get("Idempotency-Key"), map[string]any{"kind": kind, "target": target, "name": name, "type": in.ContentType, "size": in.Size})
		if e != nil {
			return e
		}
		if prior != "" {
			resume = true
			file, e = a.privateFile(ctx, prior)
			if e == nil && file.Status == "uploading" {
				e = a.fileAccess(ctx, u, kind, target, true)
			}
			return e
		}
		if e = a.fileAccess(ctx, u, kind, target, true); e != nil {
			return e
		}
		var quota struct {
			Bytes int64 `bson:"bytes"`
		}
		e = a.Store.C("guards").FindOneAndUpdate(ctx, bson.M{"_id": "files:" + u.ID}, bson.M{"$inc": bson.M{"bytes": in.Size, "version": 1}}, options.FindOneAndUpdate().SetUpsert(true).SetReturnDocument(options.After)).Decode(&quota)
		if e != nil {
			return e
		}
		if quota.Bytes > 100*1024*1024 {
			return domain.Fail(409, "file_quota", "Private file allowance is reached. Contact support.")
		}
		expiry := a.Now().Add(time.Hour)
		file = domain.PrivateFile{ID: id, TargetKind: kind, TargetID: target, UploaderID: u.ID, UploaderName: u.Name, Name: name, ContentType: in.ContentType, Size: in.Size, ObjectKey: object, Provider: "cloudinary", PublicID: publicID, ResourceType: resource, Status: "uploading", CreatedAt: a.Now(), UploadExpiresAt: &expiry}
		if e = a.insertPrivateFile(ctx, file); e != nil {
			return e
		}
		return a.saveReceipt(ctx, "direct-file:"+u.ID, r.Header.Get("Idempotency-Key"), fp, id)
	})
	if e != nil {
		a.error(w, r, e)
		return
	}
	if file.Status == "uploading" {
		if file.UploadExpiresAt == nil || !file.UploadExpiresAt.After(a.Now()) {
			a.error(w, r, domain.Fail(409, "upload_expired", "This upload expired. Select the file again."))
			return
		}
		// Never extend the signed capability when retrying an intent.
		a.json(w, 200, map[string]any{"file": file, "upload": a.DirectFiles.Grant(file.PublicID, file.ResourceType, format, file.CreatedAt), "resume": resume})
		return
	}
	a.json(w, 200, map[string]any{"file": file})
}

func (a *App) verifyDirectFile(ctx context.Context, f domain.PrivateFile, actor domain.User) (domain.PrivateFile, error) {
	if f.Provider != "cloudinary" || a.DirectFiles == nil {
		return f, domain.Fail(503, "storage_unconfigured", "Cloudinary is unavailable.")
	}
	if f.Status == "ready" {
		return f, nil
	}
	if !enum(f.Status, "uploading", "quarantined", "clean") {
		return f, domain.Fail(409, "file_unavailable", "This file is unavailable.")
	}
	if f.Status == "uploading" && (f.UploadExpiresAt == nil || !f.UploadExpiresAt.After(a.Now())) {
		return f, domain.Fail(409, "upload_expired", "This upload expired. Select the file again.")
	}
	id, resource := f.PublicID, f.ResourceType
	if id == "" { // Existing Cloudinary records retain their original private object.
		id, resource = "private-documents/"+f.ObjectKey, "raw"
		if f.ContentType == "video/mp4" {
			id, resource = "tutor-applications/"+f.ObjectKey, "video"
		}
	}
	asset, e := a.DirectFiles.Verify(ctx, id, resource)
	if e != nil {
		return f, domain.Fail(503, "storage_unavailable", "Cloudinary could not confirm this upload. Retry shortly.")
	}
	format := map[string]string{"image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf", "video/mp4": "mp4"}[f.ContentType]
	if asset.Bytes != f.Size || format == "" || resource != "raw" && asset.Format != format {
		return f, domain.Fail(422, "application_file", "The uploaded file does not match its reserved type or size.")
	}
	e = a.Store.Tx(ctx, func(ctx context.Context) error {
		if f.Status == "uploading" {
			if e := a.fileAccess(ctx, actor, f.TargetKind, f.TargetID, true); e != nil {
				return e
			}
		}
		changed, e := a.updatePrivateFile(ctx, f.ID, f.Status, bson.M{"status": "ready", "url": asset.URL, "publicId": id, "resourceType": resource, "assetId": asset.AssetID, "assetVersion": asset.Version, "checksum": asset.ETag})
		if e != nil || !changed {
			return e
		}
		return a.audit(ctx, actor.ID, "file.cloudinary_ready", f.ID)
	})
	if e != nil {
		return f, e
	}
	return a.privateFile(ctx, f.ID)
}
func (a *App) completeDirectUpload(w http.ResponseWriter, r *http.Request) {
	var in struct{}
	if !a.decode(w, r, &in) {
		return
	}
	f, e := a.privateFile(r.Context(), chi.URLParam(r, "id"))
	if e != nil {
		a.error(w, r, e)
		return
	}
	u := user(r)
	if f.UploaderID != u.ID {
		a.error(w, r, domain.Fail(404, "not_found", "This upload is unavailable."))
		return
	}
	if e = a.fileAccess(r.Context(), u, f.TargetKind, f.TargetID, false); e != nil {
		a.error(w, r, e)
		return
	}
	if e = a.rate(r.Context(), "upload-confirm:"+u.ID, 20); e != nil {
		a.error(w, r, e)
		return
	}
	f, e = a.verifyDirectFile(r.Context(), f, u)
	if e != nil {
		a.error(w, r, e)
		return
	}
	if e = a.fileAccess(r.Context(), u, f.TargetKind, f.TargetID, false); e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 200, f)
}
func (a *App) viewDirectFile(w http.ResponseWriter, r *http.Request) {
	f, e := a.privateFile(r.Context(), chi.URLParam(r, "id"))
	if e != nil {
		a.error(w, r, e)
		return
	}
	if e = a.fileAccess(r.Context(), user(r), f.TargetKind, f.TargetID, false); e != nil {
		a.error(w, r, e)
		return
	}
	a.deliverDirectFile(w, r, f, false)
}
func (a *App) deliverDirectFile(w http.ResponseWriter, r *http.Request, f domain.PrivateFile, attachment bool) {
	if strings.HasSuffix(r.URL.Path, "/play") && f.ContentType != "video/mp4" {
		a.error(w, r, domain.Fail(404, "not_found", "Video unavailable."))
		return
	}
	f, e := a.verifyDirectFile(r.Context(), f, user(r))
	if e != nil {
		a.error(w, r, e)
		return
	}
	if e = a.fileAccess(r.Context(), user(r), f.TargetKind, f.TargetID, false); e != nil {
		a.error(w, r, e)
		return
	}
	format := map[string]string{"image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf", "video/mp4": "mp4"}[f.ContentType]
	location := a.DirectFiles.Delivery(f.PublicID, f.ResourceType, format, attachment, a.Now())
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("Referrer-Policy", "no-referrer")
	http.Redirect(w, r, location, http.StatusFound)
}
