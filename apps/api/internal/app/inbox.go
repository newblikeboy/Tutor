package app

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"math/big"
	"net/http"
	"regexp"
	"strings"

	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
)

func inboxPerson(u domain.User) domain.InboxPerson {
	return domain.InboxPerson{ID: u.ID, Name: u.Name, Role: u.Role, Sample: u.Sample}
}
func inboxB64(s string, min, max int) ([]byte, bool) {
	if len(s) > (max+2)/3*4 {
		return nil, false
	}
	b, err := base64.StdEncoding.Strict().DecodeString(s)
	return b, err == nil && len(b) >= min && len(b) <= max && base64.StdEncoding.EncodeToString(b) == s
}
func inboxSigningKey(s string) (*ecdsa.PublicKey, bool) {
	b, ok := inboxB64(s, 80, 150)
	if !ok {
		return nil, false
	}
	k, err := x509.ParsePKIXPublicKey(b)
	if err != nil {
		return nil, false
	}
	p, ok := k.(*ecdsa.PublicKey)
	return p, ok && p.Curve == elliptic.P256()
}
func inboxVerify(key, signature string, fields []string) bool {
	k, ok := inboxSigningKey(key)
	if !ok {
		return false
	}
	sig, ok := inboxB64(signature, 64, 64)
	if !ok {
		return false
	}
	// All canonical fields are base64, ASCII identifiers or protocol constants.
	encoded, _ := json.Marshal(fields)
	hash := sha256.Sum256(encoded)
	return ecdsa.Verify(k, hash[:], new(big.Int).SetBytes(sig[:32]), new(big.Int).SetBytes(sig[32:]))
}
func inboxKeyFields(k domain.InboxKey) []string {
	return []string{"gyansetu-inbox-key-v1", k.ID, k.EncryptionKey, k.SigningKey, k.Salt, k.IV, k.Vault}
}
func inboxEnvelopeFields(senderID string, v domain.InboxEnvelope) []string {
	return []string{"gyansetu-update-v1", v.Nonce, senderID, v.RecipientID, v.EnrollmentID, v.SenderFingerprint, v.RecipientFingerprint, v.IV, v.Ciphertext, v.SenderWrappedKey, v.RecipientWrappedKey}
}
func inboxPublic(k domain.InboxKey) map[string]string {
	return map[string]string{"userId": k.ID, "encryptionKey": k.EncryptionKey, "signingKey": k.SigningKey, "fingerprint": k.Fingerprint}
}

type inboxPage struct {
	recordPage[domain.InboxUpdate]
	Keys map[string]map[string]string `json:"keys"`
}

func emptyInboxPage() inboxPage {
	return inboxPage{recordPage: recordPage[domain.InboxUpdate]{Items: []domain.InboxUpdate{}}, Keys: map[string]map[string]string{}}
}
func (a *App) inboxOwnKey(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "admin", "parent", "tutor") {
		return
	}
	k, err := storage.One[domain.InboxKey](r.Context(), a.Store, "inbox_keys", bson.M{"_id": user(r).ID})
	if errors.Is(err, mongo.ErrNoDocuments) {
		a.json(w, 200, map[string]any{"key": nil})
		return
	}
	if err != nil {
		a.error(w, r, err)
		return
	}
	a.json(w, 200, map[string]any{"key": k})
}
func (a *App) inboxCreateKey(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "admin", "parent", "tutor") {
		return
	}
	var in struct {
		domain.InboxKey
		Proof string `json:"proof"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	in.ID = user(r).ID
	raw, ok := inboxB64(in.EncryptionKey, 300, 600)
	parsed, err := x509.ParsePKIXPublicKey(raw)
	pub, rsaOK := parsed.(*rsa.PublicKey)
	_, sigOK := inboxSigningKey(in.SigningKey)
	_, saltOK := inboxB64(in.Salt, 32, 32)
	_, ivOK := inboxB64(in.IV, 12, 12)
	_, vaultOK := inboxB64(in.Vault, 1500, 6000)
	if !ok || err != nil || !rsaOK || pub.N.BitLen() != 3072 || pub.E != 65537 || !sigOK || !saltOK || !ivOK || !vaultOK || in.Version != 1 || !inboxVerify(in.SigningKey, in.Proof, inboxKeyFields(in.InboxKey)) {
		a.error(w, r, domain.Fail(422, "validation", "Invalid encrypted inbox identity."))
		return
	}
	hash := sha256.Sum256([]byte(in.EncryptionKey + "." + in.SigningKey))
	in.Fingerprint = hex.EncodeToString(hash[:])
	if err = a.rate(r.Context(), "inbox-key:"+user(r).ID, 10); err != nil {
		a.error(w, r, err)
		return
	}
	// Immutable identity: neither password reset nor another browser can replace it.
	_, err = a.Store.C("inbox_keys").InsertOne(r.Context(), in.InboxKey)
	if mongo.IsDuplicateKeyError(err) {
		prior, e := storage.One[domain.InboxKey](r.Context(), a.Store, "inbox_keys", bson.M{"_id": in.ID})
		if e == nil && prior == in.InboxKey {
			a.json(w, 200, map[string]any{"key": prior})
			return
		}
		a.error(w, r, domain.Fail(409, "inbox_key_exists", "An inbox identity already exists. Unlock it with your inbox passphrase."))
		return
	}
	if err != nil {
		a.error(w, r, err)
		return
	}
	a.json(w, 201, map[string]any{"key": in.InboxKey})
}

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
		count, err := a.Store.C("inbox_keys").CountDocuments(ctx, bson.M{"_id": person.ID}, options.Count().SetLimit(1))
		if err != nil {
			a.error(w, r, err)
			return
		}
		enrollmentID := ""
		if u.Role == "tutor" {
			enrollmentID = enrollments[i]
		}
		p.Items = append(p.Items, domain.InboxRecipient{InboxPerson: inboxPerson(person), EnrollmentID: enrollmentID, Ready: count == 1})
	}
	a.json(w, 200, p)
}
func (a *App) inboxRecipientKey(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "admin", "tutor") {
		return
	}
	recipient, err := a.inboxRecipient(r.Context(), user(r), chi.URLParam(r, "id"), r.URL.Query().Get("enrollmentId"), false)
	if err != nil {
		a.error(w, r, err)
		return
	}
	k, err := storage.One[domain.InboxKey](r.Context(), a.Store, "inbox_keys", bson.M{"_id": recipient.ID})
	if errors.Is(err, mongo.ErrNoDocuments) {
		a.error(w, r, domain.Fail(409, "inbox_not_ready", "The recipient has not activated their encrypted inbox."))
		return
	}
	if err != nil {
		a.error(w, r, err)
		return
	}
	a.json(w, 200, inboxPublic(k))
}
func (a *App) inboxStatus(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "admin", "tutor", "parent") {
		return
	}
	n, err := a.Store.C("inbox_updates").CountDocuments(r.Context(), bson.M{"recipientId": user(r).ID, "readAt": nil})
	if err != nil {
		a.error(w, r, err)
		return
	}
	a.json(w, 200, map[string]int64{"unreadCount": n})
}
func (a *App) inboxAccess(ctx context.Context, u domain.User, id string) (domain.InboxUpdate, error) {
	v, err := storage.One[domain.InboxUpdate](ctx, a.Store, "inbox_updates", bson.M{"_id": id, "$or": []bson.M{{"senderId": u.ID}, {"recipientId": u.ID}}})
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
		pipeline = append(pipeline, bson.D{{Key: "$lookup", Value: bson.M{"from": "enrollments", "localField": "enrollmentId", "foreignField": "_id", "as": "assignment"}}}, bson.D{{Key: "$match", Value: bson.M{"assignment": bson.M{"$elemMatch": bson.M{"tutorId": u.ID, "status": bson.M{"$in": []string{"active", "paused", "pending_agreement", "awaiting_payment"}}}}}}})
	}
	pipeline = append(pipeline, bson.D{{Key: "$sort", Value: bson.D{{Key: "_id", Value: -1}}}}, bson.D{{Key: "$limit", Value: 26}})
	cur, err := a.Store.C("inbox_updates").Aggregate(r.Context(), pipeline)
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
	// Only identities already present in this authorised page; never return vaults.
	ids := []string{}
	for _, item := range p.Items {
		ids = append(ids, item.SenderID, item.RecipientID)
	}
	if len(ids) > 0 {
		keys, err := storage.Many[domain.InboxKey](r.Context(), a.Store, "inbox_keys", bson.M{"_id": bson.M{"$in": ids}})
		if err != nil {
			a.error(w, r, err)
			return
		}
		for _, key := range keys {
			p.Keys[key.ID] = inboxPublic(key)
		}
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
	sender, err := storage.One[domain.InboxKey](r.Context(), a.Store, "inbox_keys", bson.M{"_id": v.SenderID})
	if err != nil {
		a.error(w, r, err)
		return
	}
	receiver, err := storage.One[domain.InboxKey](r.Context(), a.Store, "inbox_keys", bson.M{"_id": v.RecipientID})
	if err != nil {
		a.error(w, r, err)
		return
	}
	a.json(w, 200, map[string]any{"message": v, "senderKey": inboxPublic(sender), "recipientKey": inboxPublic(receiver)})
}
func (a *App) inboxSend(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "admin", "tutor") {
		return
	}
	var in domain.InboxEnvelope
	if !a.decode(w, r, &in) {
		return
	}
	_, ivOK := inboxB64(in.IV, 12, 12)
	_, bodyOK := inboxB64(in.Ciphertext, 32, 14000)
	_, sOK := inboxB64(in.SenderWrappedKey, 384, 384)
	_, rOK := inboxB64(in.RecipientWrappedKey, 384, 384)
	if in.Version != 1 || !ivOK || !bodyOK || !sOK || !rOK || !regexp.MustCompile(`^[a-zA-Z0-9_-]{16,80}$`).MatchString(in.Nonce) || len(in.RecipientID) > 200 || len(in.EnrollmentID) > 200 {
		a.error(w, r, domain.Fail(422, "validation", "Invalid encrypted update."))
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
		senderKey, err := storage.One[domain.InboxKey](ctx, a.Store, "inbox_keys", bson.M{"_id": u.ID})
		if err != nil {
			return err
		}
		recipientKey, err := storage.One[domain.InboxKey](ctx, a.Store, "inbox_keys", bson.M{"_id": recipient.ID})
		if err != nil {
			return domain.Fail(409, "inbox_not_ready", "The recipient must activate their inbox first.")
		}
		if in.SenderFingerprint != senderKey.Fingerprint || in.RecipientFingerprint != recipientKey.Fingerprint || !inboxVerify(senderKey.SigningKey, in.Signature, inboxEnvelopeFields(u.ID, in)) {
			return domain.Fail(422, "inbox_integrity", "The encrypted update could not be verified.")
		}
		prior, fp, err := a.receipt(ctx, "inbox:"+u.ID, r.Header.Get("Idempotency-Key"), in)
		if err != nil {
			return err
		}
		if prior != "" {
			result, err = a.inboxAccess(ctx, u, prior)
			return err
		}
		result = domain.InboxUpdate{ID: id, SenderID: u.ID, Sender: inboxPerson(u), Recipient: inboxPerson(recipient), InboxEnvelope: in, CreatedAt: a.Now()}
		if _, err = a.Store.C("inbox_updates").InsertOne(ctx, result); err != nil {
			return err
		}
		if err = a.saveReceipt(ctx, "inbox:"+u.ID, r.Header.Get("Idempotency-Key"), fp, id); err != nil {
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
	var in struct {
		Signature string `json:"signature"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	u := user(r)
	id := chi.URLParam(r, "id")
	v, err := storage.One[domain.InboxUpdate](r.Context(), a.Store, "inbox_updates", bson.M{"_id": id, "recipientId": u.ID})
	if err != nil {
		a.error(w, r, err)
		return
	}
	k, err := storage.One[domain.InboxKey](r.Context(), a.Store, "inbox_keys", bson.M{"_id": u.ID})
	if err != nil {
		a.error(w, r, err)
		return
	}
	if !inboxVerify(k.SigningKey, in.Signature, []string{"gyansetu-read-v1", v.ID, v.Nonce, v.RecipientFingerprint}) {
		a.error(w, r, domain.Fail(422, "inbox_integrity", "The read receipt could not be verified."))
		return
	}
	_, err = a.Store.C("inbox_updates").UpdateOne(r.Context(), bson.M{"_id": id, "recipientId": u.ID, "readAt": nil}, bson.M{"$set": bson.M{"readAt": a.Now(), "readSignature": in.Signature}})
	if err != nil {
		a.error(w, r, err)
		return
	}
	a.json(w, 200, map[string]bool{"ok": true})
}
