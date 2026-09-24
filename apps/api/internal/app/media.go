package app

import (
	"bytes"
	"context"
	"encoding/base64"
	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"mime"
	"net/http"
	"strconv"
	"strings"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/media"
	"tutorplatform/internal/storage"
)

func (a *App) ConfigureMedia() error {
	if a.Config.MediaProvider == "disk" {
		s, e := media.NewDisk(a.Config.MediaRoot)
		if e != nil {
			return e
		}
		a.Files = s
	}
	if a.Config.MediaProvider == "s3" {
		a.Files = media.NewS3(a.Config.S3Endpoint, a.Config.S3Region, a.Config.S3Bucket, a.Config.S3Key, a.Config.S3Secret)
	}
	if a.Config.MediaProvider == "cloudinary" {
		a.Files = media.NewCloudinaryDocuments(a.Config.CloudinaryCloud, a.Config.CloudinaryKey, a.Config.CloudinarySecret)
	}
	if a.Config.ScannerAddress != "" {
		a.Scanner = media.ClamAV{Address: a.Config.ScannerAddress}
	}
	if a.Config.VideoProvider == "cloudinary" {
		a.Videos = media.NewCloudinary(a.Config.CloudinaryCloud, a.Config.CloudinaryKey, a.Config.CloudinarySecret)
	} else if a.Config.VideoProvider == "disk" {
		a.Videos = a.Files
	}
	return nil
}

func (a *App) fileStore(f domain.PrivateFile) media.Store {
	if f.Provider == "cloudinary" {
		if f.ContentType == "video/mp4" && a.Config.VideoProvider == "cloudinary" {
			return a.Videos
		}
		if f.ContentType != "video/mp4" && a.Config.MediaProvider == "cloudinary" {
			return a.Files
		}
		return nil
	}
	if a.Config.MediaProvider == "cloudinary" || (f.Provider != "" && f.Provider != a.Config.MediaProvider) {
		return nil
	}
	return a.Files
}
func mediaTarget(r *http.Request) (string, string) {
	if strings.Contains(r.URL.Path, "/applications/") {
		return "application", chi.URLParam(r, "id")
	}
	return "enrollment", chi.URLParam(r, "id")
}
func (a *App) fileAccess(ctx context.Context, u domain.User, kind, id string, write bool) error {
	if kind == "enrollment" {
		v, e := a.tuitionAccess(ctx, u, id)
		if e != nil {
			return e
		}
		if write {
			if !enum(v.Status, "active", "paused", "pending_agreement", "awaiting_payment") {
				return domain.Fail(409, "invalid_transition", "This arrangement is closed for new files.")
			}
			_, e = a.Store.C("enrollments").UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$inc": bson.M{"version": 1}})
		}
		return e
	}
	if kind != "application" {
		return mongo.ErrNoDocuments
	}
	f := bson.M{"_id": id}
	switch u.Role {
	case "tutor":
		if id != u.ID {
			return mongo.ErrNoDocuments
		}
	case "mentor":
		f["assessorId"] = u.ID
	case "admin":
	default:
		return mongo.ErrNoDocuments
	}
	application, e := storage.One[domain.Application](ctx, a.Store, "applications", f)
	if e != nil {
		return e
	}
	if write {
		if u.Role != "tutor" {
			return domain.Fail(403, "forbidden", "Only the applicant uploads application documents.")
		}
		if !enum(application.Status, "draft", "improvement_required") {
			return domain.Fail(409, "invalid_transition", "Application files can change while completing or revising a draft.")
		}
		_, e = a.Store.C("applications").UpdateOne(ctx, f, bson.M{"$inc": bson.M{"version": 1}})
	}
	return e
}
func (a *App) privateFiles(w http.ResponseWriter, r *http.Request) {
	kind, id := mediaTarget(r)
	if e := a.fileAccess(r.Context(), user(r), kind, id, false); e != nil {
		a.error(w, r, e)
		return
	}
	var p recordPage[domain.PrivateFile]
	var e error
	if kind == "application" {
		p, e = a.applicationFilePage(r.Context(), id, r.URL.Query().Get("cursor"))
	} else {
		p, e = pageRecords[domain.PrivateFile](r.Context(), a.Store, "files", bson.M{"targetKind": kind, "targetId": id, "status": bson.M{"$ne": "archived"}}, r.URL.Query().Get("cursor"))
	}
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 200, p)
}
func (a *App) uploadFile(w http.ResponseWriter, r *http.Request) {
	if a.Files == nil && a.Videos == nil {
		a.error(w, r, domain.Fail(503, "storage_unconfigured", "Private file storage is not configured."))
		return
	}
	select {
	case a.FileSlots <- struct{}{}:
		defer func() { <-a.FileSlots }()
	default:
		a.error(w, r, domain.Fail(503, "busy", "Please retry this upload shortly."))
		return
	}
	kind, target := mediaTarget(r)
	u := user(r)
	if e := a.fileAccess(r.Context(), u, kind, target, false); e != nil {
		a.error(w, r, e)
		return
	}
	if e := a.rate(r.Context(), "upload:"+u.ID, 8); e != nil {
		a.error(w, r, e)
		return
	}
	var in struct {
		Name    string `json:"name"`
		Content string `json:"content"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	data, e := base64.StdEncoding.Strict().DecodeString(in.Content)
	if e != nil {
		a.error(w, r, domain.Fail(422, "file_type", "Invalid file encoding."))
		return
	}
	name, contentType, e := media.Validate(in.Name, data)
	if kind == "application" {
		name, contentType, e = media.ValidateApplication(in.Name, data)
	}
	if e != nil {
		code := "file_type"
		if kind == "application" {
			code = "application_file"
		}
		a.error(w, r, domain.Fail(422, code, "Upload a valid document (3 MiB) or application MP4 (25 MiB)."))
		return
	}
	checksum := digest(string(data))
	provider := a.Config.MediaProvider
	if kind == "application" && contentType == "video/mp4" {
		if a.Videos == nil {
			a.error(w, r, domain.Fail(503, "video_unconfigured", "Video upload is not configured."))
			return
		}
		provider = a.Config.VideoProvider
	} else if a.Files == nil {
		a.error(w, r, domain.Fail(503, "storage_unconfigured", "Document upload is not configured."))
		return
	}
	id, object := a.chronologicalID(), token()
	if provider == "cloudinary" && contentType != "video/mp4" {
		object += map[string]string{"application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png"}[contentType]
	}
	if kind == "application" {
		id = applicationFilePrefix + id
	}
	var file domain.PrivateFile
	e = a.Store.Tx(r.Context(), func(ctx context.Context) error {
		if e := a.fileAccess(ctx, u, kind, target, false); e != nil {
			return e
		}
		prior, fp, e := a.receipt(ctx, "file:"+u.ID, r.Header.Get("Idempotency-Key"), map[string]any{"kind": kind, "target": target, "name": name, "checksum": checksum})
		if e != nil {
			return e
		}
		if prior != "" {
			file, e = a.privateFile(ctx, prior)
			return e
		}
		if e = a.fileAccess(ctx, u, kind, target, true); e != nil {
			return e
		}
		var quota struct {
			Bytes int64 `bson:"bytes"`
		}
		e = a.Store.C("guards").FindOneAndUpdate(ctx, bson.M{"_id": "files:" + u.ID}, bson.M{"$inc": bson.M{"bytes": len(data), "version": 1}}, options.FindOneAndUpdate().SetUpsert(true).SetReturnDocument(options.After)).Decode(&quota)
		if e != nil {
			return e
		}
		if quota.Bytes > 100*1024*1024 {
			return domain.Fail(409, "file_quota", "Private file allowance is reached. Contact support.")
		}
		file = domain.PrivateFile{ID: id, TargetKind: kind, TargetID: target, UploaderID: u.ID, UploaderName: u.Name, Name: name, ContentType: contentType, Size: len(data), ObjectKey: object, Checksum: checksum, Status: "uploading", CreatedAt: a.Now()}
		file.Provider = provider
		if e = a.insertPrivateFile(ctx, file); e != nil {
			return e
		}
		return a.saveReceipt(ctx, "file:"+u.ID, r.Header.Get("Idempotency-Key"), fp, id)
	})
	if e != nil {
		a.error(w, r, e)
		return
	}
	if file.Status == "uploading" {
		store := a.fileStore(file)
		if store == nil {
			a.error(w, r, domain.Fail(503, "storage_unconfigured", "Private file storage is unavailable."))
			return
		}
		if e = store.Put(r.Context(), file.ObjectKey, data); e != nil {
			a.error(w, r, domain.Fail(503, "storage_unavailable", "Upload is incomplete. Retry the same file."))
			return
		}
		e = a.Store.Tx(r.Context(), func(ctx context.Context) error {
			changed, e := a.updatePrivateFile(ctx, file.ID, "uploading", bson.M{"status": "quarantined"})
			if e != nil {
				return e
			}
			if !changed {
				return nil
			}
			if e = a.enqueue(ctx, "scan:"+file.ID, "file_scan", bson.M{"fileId": file.ID}, "pending"); e != nil {
				return e
			}
			return a.audit(ctx, u.ID, "file.quarantined", file.ID)
		})
		if e != nil {
			a.error(w, r, e)
			return
		}
	}
	file, e = a.privateFile(r.Context(), file.ID)
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 201, file)
}
func (a *App) downloadFile(w http.ResponseWriter, r *http.Request) {
	f, e := a.privateFile(r.Context(), chi.URLParam(r, "id"))
	if e != nil {
		a.error(w, r, e)
		return
	}
	if e = a.fileAccess(r.Context(), user(r), f.TargetKind, f.TargetID, false); e != nil {
		a.error(w, r, e)
		return
	}
	if f.Status != "clean" || f.ScannedAt == nil {
		a.error(w, r, domain.Fail(409, "file_quarantined", "This file has not passed the configured scanner."))
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
	// Recheck assignment after storage I/O; no bearer URL survives a handover.
	if e = a.fileAccess(r.Context(), user(r), f.TargetKind, f.TargetID, false); e != nil {
		a.error(w, r, e)
		return
	}
	if strings.HasSuffix(r.URL.Path, "/play") {
		if f.ContentType != "video/mp4" {
			a.error(w, r, domain.Fail(404, "not_found", "Video unavailable."))
			return
		}
		w.Header().Set("Content-Type", "video/mp4")
		w.Header().Set("Content-Disposition", "inline")
		http.ServeContent(w, r, "introduction.mp4", f.CreatedAt, bytes.NewReader(data))
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": f.Name}))
	w.Header().Set("Content-Security-Policy", "sandbox; default-src 'none'")
	w.Header().Set("Content-Length", strconv.Itoa(len(data)))
	w.WriteHeader(200)
	_, _ = w.Write(data)
}
func (a *App) retryFileScan(w http.ResponseWriter, r *http.Request) {
	f, e := a.privateFile(r.Context(), chi.URLParam(r, "id"))
	if e != nil {
		a.error(w, r, e)
		return
	}
	if e = a.fileAccess(r.Context(), user(r), f.TargetKind, f.TargetID, false); e != nil {
		a.error(w, r, e)
		return
	}
	if a.Scanner == nil || a.fileStore(f) == nil {
		a.error(w, r, domain.Fail(503, "scanner_unconfigured", "The file scanner still needs operator configuration."))
		return
	}
	_, e = a.Store.C("outbox").UpdateOne(r.Context(), bson.M{"_id": "scan:" + f.ID, "status": "failed"}, bson.M{"$set": bson.M{"status": "pending", "attempts": 0, "availableAt": a.Now()}})
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 200, map[string]bool{"ok": true})
}
func (a *App) scanFile(ctx context.Context, id string) error {
	f, e := a.privateFile(ctx, id)
	if e != nil {
		return e
	}
	if f.Status != "quarantined" {
		return nil
	}
	store := a.fileStore(f)
	if store == nil || a.Scanner == nil {
		return domain.Fail(503, "scanner_unconfigured", "Private storage and scanning must be configured.")
	}
	data, e := store.Read(ctx, f.ObjectKey)
	if e != nil {
		return e
	}
	if digest(string(data)) != f.Checksum {
		return domain.Fail(409, "file_integrity", "File integrity could not be verified.")
	}
	clean, e := a.Scanner.Scan(ctx, data)
	if e != nil {
		return e
	}
	state := "rejected"
	if clean {
		state = "clean"
	}
	return a.Store.Tx(ctx, func(ctx context.Context) error {
		changed, e := a.updatePrivateFile(ctx, id, "quarantined", bson.M{"status": state, "scannedAt": a.Now(), "scanner": "clamav"})
		if e != nil {
			return e
		}
		if !changed {
			return nil
		}
		return a.audit(ctx, "worker", "file.scan_"+state, id)
	})
}
