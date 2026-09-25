package app

import (
	"context"
	"errors"
	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"net/http"
	"regexp"
	"strings"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
	"unicode/utf8"
)

func inboxPerson(u domain.User) domain.InboxPerson {
	return domain.InboxPerson{ID: u.ID, Name: u.Name, Role: u.Role, Sample: u.Sample}
}

type inboxPage = recordPage[domain.InboxUpdate]

func emptyInboxPage() inboxPage { return inboxPage{Items: []domain.InboxUpdate{}} }
func (a *App) inboxTeaching(ctx context.Context, u domain.User) (bool, error) {
	app, err := storage.One[domain.Application](ctx, a.Store, "applications", bson.M{"_id": u.ID})
	if errors.Is(err, mongo.ErrNoDocuments) {
		return false, nil
	}
	return err == nil && app.Status == "approved" && app.Scope.ExpiresAt.After(a.Now()), err
}
func (a *App) inboxRecipient(ctx context.Context, u domain.User, id, enrollment string, lock bool) (domain.User, error) {
	var recipient domain.User
	if !enum(u.Role, "admin", "tutor") || id == u.ID {
		return recipient, domain.Fail(403, "forbidden", "You cannot send this update.")
	}
	if u.Role == "tutor" {
		ok, err := a.inboxTeaching(ctx, u)
		if err != nil {
			return recipient, err
		}
		if !ok {
			return recipient, domain.Fail(403, "tutor_restricted", "Teaching access is restricted.")
		}
		v, err := a.tuitionAccess(ctx, u, enrollment)
		if err != nil {
			return recipient, err
		}
		if v.OwnerID != id || !enum(v.Status, "active", "paused", "pending_agreement", "awaiting_payment") {
			return recipient, domain.Fail(404, "not_found", "Recipient unavailable.")
		}
		if lock {
			// Contend with assignment changes and suspension before committing delivery.
			if _, err = a.Store.C("enrollments").UpdateOne(ctx, bson.M{"_id": v.ID}, bson.M{"$inc": bson.M{"version": 1}}); err != nil {
				return recipient, err
			}
			if _, err = a.Store.C("applications").UpdateOne(ctx, bson.M{"_id": u.ID}, bson.M{"$inc": bson.M{"version": 1}}); err != nil {
				return recipient, err
			}
		}
	} else if enrollment != "" {
		return recipient, domain.Fail(422, "validation", "Administrative updates do not reference tuition records.")
	}
	f := bson.M{"_id": id, "role": bson.M{"$in": []string{"parent", "tutor"}}}
	if u.Role == "tutor" {
		f["role"] = "parent"
	}
	if a.Config.Env == "production" {
		f["sample"] = false
	}
	recipient, err := storage.One[domain.User](ctx, a.Store, "users", f)
	return recipient, err
}
func (a *App) inboxRecipients(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "admin", "tutor") {
		return
	}
	u := user(r)
	ctx := r.Context()
	cursor := r.URL.Query().Get("cursor")
	search := strings.TrimSpace(r.URL.Query().Get("search"))
	role := r.URL.Query().Get("role")
	if len(cursor) > 200 || len(search) > 80 || !enum(role, "", "parent", "tutor") {
		a.error(w, r, domain.Fail(422, "validation", "Invalid recipient filter."))
		return
	}
	p := recordPage[domain.InboxRecipient]{Items: []domain.InboxRecipient{}}
	var people []domain.User
	enrollments := []string{}
	if u.Role == "admin" {
		f := bson.M{"role": bson.M{"$in": []string{"parent", "tutor"}}}
		if role != "" {
			f["role"] = role
		}
		if search != "" {
			f["name"] = bson.M{"$regex": regexp.QuoteMeta(search), "$options": "i"}
		}
		if a.Config.Env == "production" {
			f["sample"] = false
		}
		page, err := pageRecords[domain.User](ctx, a.Store, "users", f, cursor)
		if err != nil {
			a.error(w, r, err)
			return
		}
		people = page.Items
		p.NextCursor = page.NextCursor
	} else {
		ok, err := a.inboxTeaching(ctx, u)
		if err != nil {
			a.error(w, r, err)
			return
		}
		if !ok {
			a.json(w, 200, p)
			return
		}
		f := bson.M{"tutorId": u.ID, "status": bson.M{"$in": []string{"active", "paused", "pending_agreement", "awaiting_payment"}}}
		page, err := pageRecords[domain.Enrollment](ctx, a.Store, "enrollments", f, cursor)
		if err != nil {
			a.error(w, r, err)
			return
		}
		p.NextCursor = page.NextCursor
		for _, v := range page.Items {
			person, err := storage.One[domain.User](ctx, a.Store, "users", bson.M{"_id": v.OwnerID, "role": "parent"})
			if err != nil {
				a.error(w, r, err)
				return
			}
			// One row per arrangement preserves the exact authorisation scope.
			people = append(people, person)
			enrollments = append(enrollments, v.ID)
		}
	}
	for i, person := range people {
		enrollmentID := ""
		if u.Role == "tutor" {
			enrollmentID = enrollments[i]
		}
		p.Items = append(p.Items, domain.InboxRecipient{InboxPerson: inboxPerson(person), EnrollmentID: enrollmentID})
	}
	a.json(w, 200, p)
}
func (a *App) inboxStatus(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "admin", "tutor", "parent") {
		return
	}
	n, err := a.Store.C("inbox_messages").CountDocuments(r.Context(), bson.M{"recipientId": user(r).ID, "readAt": nil})
	if err != nil {
		a.error(w, r, err)
		return
	}
	a.json(w, 200, map[string]int64{"unreadCount": n})
}
func (a *App) inboxAccess(ctx context.Context, u domain.User, id string) (domain.InboxUpdate, error) {
	v, err := storage.One[domain.InboxUpdate](ctx, a.Store, "inbox_messages", bson.M{"_id": id, "$or": []bson.M{{"senderId": u.ID}, {"recipientId": u.ID}}})
	if err != nil {
		return v, err
	}
	if u.Role == "tutor" && v.EnrollmentID != "" {
		ok, err := a.inboxTeaching(ctx, u)
		if err != nil {
			return v, err
		}
		if !ok {
			return v, domain.Fail(404, "not_found", "Update unavailable.")
		}
		_, err = a.inboxRecipient(ctx, u, v.RecipientID, v.EnrollmentID, false)
		if err != nil {
			return v, err
		}
	}
	return v, nil
}
func (a *App) inboxList(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "admin", "tutor", "parent") {
		return
	}
	u := user(r)
	folder := r.URL.Query().Get("folder")
	cursor := r.URL.Query().Get("cursor")
	if !enum(folder, "", "inbox", "sent", "unread") || len(cursor) > 200 {
		a.error(w, r, domain.Fail(422, "validation", "Invalid inbox filter."))
		return
	}
	f := bson.M{"recipientId": u.ID}
	if folder == "sent" {
		f = bson.M{"senderId": u.ID}
	}
	if folder == "unread" {
		f["readAt"] = nil
	}
	if cursor != "" {
		f["_id"] = bson.M{"$lt": cursor}
	}
	// Tutor sent records are filtered by current assignment before pagination.
	pipeline := mongo.Pipeline{{{Key: "$match", Value: f}}}
	if u.Role == "tutor" && folder == "sent" {
		ok, err := a.inboxTeaching(r.Context(), u)
		if err != nil {
			a.error(w, r, err)
			return
		}
		if !ok {
			a.json(w, 200, emptyInboxPage())
			return
		}
		pipeline = append(pipeline,
			bson.D{{Key: "$lookup", Value: bson.M{"from": "enrollments", "localField": "enrollmentId", "foreignField": "_id", "as": "assignment"}}},
			bson.D{{Key: "$match", Value: bson.M{
				"assignment": bson.M{"$elemMatch": bson.M{"tutorId": u.ID, "status": bson.M{"$in": []string{"active", "paused", "pending_agreement", "awaiting_payment"}}}},
				"$expr":      bson.M{"$eq": bson.A{bson.M{"$arrayElemAt": bson.A{"$assignment.ownerId", 0}}, "$recipientId"}},
			}}},
		)
	}
	pipeline = append(pipeline, bson.D{{Key: "$sort", Value: bson.D{{Key: "_id", Value: -1}}}}, bson.D{{Key: "$limit", Value: 26}})
	cur, err := a.Store.C("inbox_messages").Aggregate(r.Context(), pipeline)
	if err != nil {
		a.error(w, r, err)
		return
	}
	defer cur.Close(r.Context())
	p := emptyInboxPage()
	if err = cur.All(r.Context(), &p.Items); err != nil {
		a.error(w, r, err)
		return
	}
	if len(p.Items) > 25 {
		p.Items = p.Items[:25]
		p.NextCursor = p.Items[24].ID
	}
	a.json(w, 200, p)
}
func (a *App) inboxDetail(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "admin", "tutor", "parent") {
		return
	}
	v, err := a.inboxAccess(r.Context(), user(r), chi.URLParam(r, "id"))
	if err != nil {
		a.error(w, r, err)
		return
	}
	a.json(w, 200, map[string]any{"message": v})
}
func (a *App) inboxSend(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "admin", "tutor") {
		return
	}
	var in domain.InboxInput
	if !a.decode(w, r, &in) {
		return
	}
	in.Subject = strings.TrimSpace(in.Subject)
	in.Body = strings.TrimSpace(in.Body)
	if !regexp.MustCompile(`^[a-zA-Z0-9_-]{16,80}$`).MatchString(in.Nonce) || in.RecipientID == "" || len(in.RecipientID) > 200 || len(in.EnrollmentID) > 200 || utf8.RuneCountInString(in.Subject) < 1 || utf8.RuneCountInString(in.Subject) > 120 || utf8.RuneCountInString(in.Body) < 1 || utf8.RuneCountInString(in.Body) > 3000 {
		a.error(w, r, domain.Fail(422, "validation", "Choose a recipient, a subject up to 120 characters and a message up to 3,000 characters."))
		return
	}
	u := user(r)
	if err := a.rate(r.Context(), "inbox-send:"+u.ID, 20); err != nil {
		a.error(w, r, err)
		return
	}
	id := a.chronologicalID()
	var result domain.InboxUpdate
	err := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		recipient, err := a.inboxRecipient(ctx, u, in.RecipientID, in.EnrollmentID, true)
		if err != nil {
			return err
		}
		prior, fp, err := a.receipt(ctx, "updates:"+u.ID, r.Header.Get("Idempotency-Key"), in)
		if err != nil {
			return err
		}
		if prior != "" {
			result, err = a.inboxAccess(ctx, u, prior)
			return err
		}
		result = domain.InboxUpdate{ID: id, SenderID: u.ID, Sender: inboxPerson(u), Recipient: inboxPerson(recipient), InboxInput: in, CreatedAt: a.Now()}
		if _, err = a.Store.C("inbox_messages").InsertOne(ctx, result); err != nil {
			return err
		}
		if err = a.saveReceipt(ctx, "updates:"+u.ID, r.Header.Get("Idempotency-Key"), fp, id); err != nil {
			return err
		}
		return a.audit(ctx, u.ID, "inbox.update_sent", id)
	})
	if err != nil {
		a.error(w, r, err)
		return
	}
	a.json(w, 201, result)
}
func (a *App) inboxRead(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "parent", "tutor") {
		return
	}
	var in struct{}
	if !a.decode(w, r, &in) {
		return
	}
	u := user(r)
	if err := a.rate(r.Context(), "inbox-read:"+u.ID, 60); err != nil {
		a.error(w, r, err)
		return
	}
	id := chi.URLParam(r, "id")
	_, err := storage.One[domain.InboxUpdate](r.Context(), a.Store, "inbox_messages", bson.M{"_id": id, "recipientId": u.ID})
	if err != nil {
		a.error(w, r, err)
		return
	}
	// Only an authenticated recipient can acknowledge; preserve the first read time.
	_, err = a.Store.C("inbox_messages").UpdateOne(r.Context(), bson.M{"_id": id, "recipientId": u.ID, "readAt": nil}, bson.M{"$set": bson.M{"readAt": a.Now()}})
	if err != nil {
		a.error(w, r, err)
		return
	}
	a.json(w, 200, map[string]bool{"ok": true})
}
