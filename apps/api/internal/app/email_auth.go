package app

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"math/big"
	"net/http"
	"regexp"
	"time"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/password"
	"tutorplatform/internal/storage"
)

type emailChallenge struct {
	ID             string    `bson:"_id"`
	Email          string    `bson:"email,omitempty"`
	UserID         string    `bson:"userId"`
	Purpose        string    `bson:"purpose"`
	CodeHash       string    `bson:"codeHash"`
	CredentialHash string    `bson:"credentialHash"`
	ExpiresAt      time.Time `bson:"expiresAt"`
	Attempts       int       `bson:"attempts"`
	Consumed       bool      `bson:"consumed"`
	GuardID        string    `bson:"guardId"`
	CurrentID      string    `bson:"currentId"`
	LastSentAt     time.Time `bson:"lastSentAt"`
}

func (a *App) mailAvailable(w http.ResponseWriter, r *http.Request) bool {
	if !a.passwordAvailable(w, r) {
		return false
	}
	key, err := base64.StdEncoding.DecodeString(a.Config.MailTokenKey)
	if a.Mail == nil || err != nil || len(key) != 32 {
		a.error(w, r, domain.Fail(503, "email_unconfigured", "Email delivery is not configured. Contact support@gocoaching.in."))
		return false
	}
	return true
}
func (a *App) emailCodeHash(id, purpose, code string) string {
	key, _ := base64.StdEncoding.DecodeString(a.Config.MailTokenKey)
	h := hmac.New(sha256.New, key)
	h.Write([]byte(id + "\x00" + purpose + "\x00" + code))
	return hex.EncodeToString(h.Sum(nil))
}
func (a *App) protectCode(id, value string, seal bool) (string, error) {
	key, err := base64.StdEncoding.DecodeString(a.Config.MailTokenKey)
	if err != nil || len(key) != 32 {
		return "", fmt.Errorf("email key unavailable")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	secure, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	if seal {
		nonce := make([]byte, secure.NonceSize())
		if _, err = rand.Read(nonce); err != nil {
			return "", err
		}
		return base64.StdEncoding.EncodeToString(secure.Seal(nonce, nonce, []byte(value), []byte(id))), nil
	}
	encrypted, err := base64.StdEncoding.DecodeString(value)
	if err != nil || len(encrypted) < secure.NonceSize() {
		return "", fmt.Errorf("invalid email code payload")
	}
	plain, err := secure.Open(nil, encrypted[:secure.NonceSize()], encrypted[secure.NonceSize():], []byte(id))
	return string(plain), err
}
func (a *App) emailSendLimit(r *http.Request, email string) error {
	if err := a.rate(r.Context(), "email-request:ip:"+a.authClientIP(r), 8); err != nil {
		return err
	}
	if err := a.rate(r.Context(), "email-request:address:"+email, 2); err != nil {
		return err
	}
	now := a.Now()
	var v struct {
		Count int `bson:"count"`
	}
	err := a.Store.C("rate_limits").FindOneAndUpdate(r.Context(), bson.M{"_id": digest("email-hour:" + email + fmt.Sprint(now.Unix()/3600))}, bson.M{"$inc": bson.M{"count": 1}, "$setOnInsert": bson.M{"expiresAt": now.Add(2 * time.Hour)}}, options.FindOneAndUpdate().SetUpsert(true).SetReturnDocument(options.After)).Decode(&v)
	if err != nil {
		return err
	}
	if v.Count > 6 {
		return domain.Fail(429, "rate_limited", "Too many email requests. Please try again later.")
	}
	return nil
}
func (a *App) requestEmailCode(w http.ResponseWriter, r *http.Request) {
	if !a.mailAvailable(w, r) {
		return
	}
	var in struct {
		Email   string `json:"email"`
		Purpose string `json:"purpose"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	if !enum(in.Purpose, "login", "reset", "signup") {
		a.error(w, r, domain.Fail(422, "validation", "Choose signup, sign-in or password recovery."))
		return
	}
	a.issueEmailCode(w, r, in.Email, in.Purpose, "")
}
func (a *App) requestVerification(w http.ResponseWriter, r *http.Request) {
	if !a.mailAvailable(w, r) {
		return
	}
	var in struct{}
	if !a.decode(w, r, &in) {
		return
	}
	a.issueEmailCode(w, r, user(r).Email, "verify", user(r).ID)
}
func (a *App) issueEmailCode(w http.ResponseWriter, r *http.Request, value, purpose, actor string) {
	email, valid := normalizeEmail(value)
	if !valid {
		a.error(w, r, domain.Fail(422, "validation", "Enter a valid email address."))
		return
	}
	if err := a.emailSendLimit(r, email); err != nil {
		a.error(w, r, err)
		return
	}
	id := token()
	number, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		a.error(w, r, err)
		return
	}
	code := fmt.Sprintf("%06d", number.Int64())
	encrypted, err := a.protectCode(id, code, true)
	if err != nil {
		a.error(w, r, err)
		return
	}
	expires := a.Now().Add(10 * time.Minute)
	err = a.Store.Tx(r.Context(), func(ctx context.Context) error {
		guardID := "recipient:" + digest(email+":"+purpose)
		var guard emailChallenge
		err := a.Store.C("email_challenges").FindOneAndUpdate(ctx, bson.M{"_id": guardID}, bson.M{"$setOnInsert": bson.M{"userId": "", "purpose": "guard", "codeHash": "", "credentialHash": "", "attempts": 0, "expiresAt": a.Now().Add(24 * time.Hour)}, "$inc": bson.M{"version": 1}}, options.FindOneAndUpdate().SetUpsert(true).SetReturnDocument(options.Before)).Decode(&guard)
		if err != nil && err != mongo.ErrNoDocuments {
			return err
		}
		if !guard.LastSentAt.IsZero() && a.Now().Before(guard.LastSentAt.Add(time.Minute)) {
			return domain.Fail(429, "rate_limited", "Wait 60 seconds before requesting another code.")
		}
		if _, err = a.Store.C("email_challenges").UpdateOne(ctx, bson.M{"_id": guardID}, bson.M{"$set": bson.M{"currentId": id, "lastSentAt": a.Now(), "expiresAt": a.Now().Add(24 * time.Hour)}}); err != nil {
			return err
		}
		c, err := storage.One[credential](ctx, a.Store, "credentials", bson.M{"_id": email})
		if purpose == "signup" {
			if err == nil {
				return nil // Same response for existing and new addresses; no account is created here.
			}
			if err != mongo.ErrNoDocuments {
				return err
			}
			challenge := emailChallenge{ID: id, Email: email, Purpose: purpose, CodeHash: a.emailCodeHash(id, purpose, code), ExpiresAt: expires, GuardID: guardID}
			if _, err = a.Store.C("email_challenges").InsertOne(ctx, challenge); err != nil {
				return err
			}
			return a.enqueue(ctx, "email-code:"+id, "email", bson.M{"event": "auth_code", "challengeId": id, "encryptedCode": encrypted}, "pending")
		}
		if err == mongo.ErrNoDocuments {
			return nil
		}
		if err != nil {
			return err
		}
		u, err := storage.One[domain.User](ctx, a.Store, "users", bson.M{"_id": c.UserID})
		if err != nil {
			return err
		}
		if a.accountAccessError(u) != nil || (purpose == "login" && !enum(u.Role, "parent", "tutor")) || (purpose == "verify" && u.ID != actor) {
			return nil
		}
		challenge := emailChallenge{ID: id, UserID: u.ID, Purpose: purpose, CodeHash: a.emailCodeHash(id, purpose, code), CredentialHash: digest(c.Hash), ExpiresAt: expires, GuardID: guardID}
		if _, err = a.Store.C("email_challenges").InsertOne(ctx, challenge); err != nil {
			return err
		}
		return a.enqueue(ctx, "email-code:"+id, "email", bson.M{"event": "auth_code", "recipientId": u.ID, "challengeId": id, "encryptedCode": encrypted}, "pending")
	})
	if err != nil {
		a.error(w, r, err)
		return
	}
	// Wake only after the transaction commits; never submit mail inside a retryable transaction.
	a.wakeEmailCodes()
	message := "If this account is eligible, a code will be emailed. It expires in 10 minutes."
	if purpose == "signup" {
		message = "If this email is available for signup, a code will be emailed. It expires in 10 minutes. Already have an account? Sign in instead."
	}
	a.json(w, 202, map[string]any{"challengeId": id, "expiresAt": expires, "resendAfterSeconds": 60, "message": message})
}
func (a *App) confirmEmailCode(w http.ResponseWriter, r *http.Request)    { a.confirmEmail(w, r, false) }
func (a *App) confirmVerification(w http.ResponseWriter, r *http.Request) { a.confirmEmail(w, r, true) }
func (a *App) confirmEmail(w http.ResponseWriter, r *http.Request, verification bool) {
	if !a.mailAvailable(w, r) {
		return
	}
	var in struct {
		ChallengeID string `json:"challengeId"`
		Code        string `json:"code"`
		NewPassword string `json:"newPassword,omitempty"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	if !regexp.MustCompile(`^[a-f0-9]{64}$`).MatchString(in.ChallengeID) || !regexp.MustCompile(`^[0-9]{6}$`).MatchString(in.Code) {
		a.error(w, r, domain.Fail(422, "validation", "Enter the six-digit code from your email."))
		return
	}
	if err := a.rate(r.Context(), "email-confirm:ip:"+a.authClientIP(r), 30); err != nil {
		a.error(w, r, err)
		return
	}
	var hash string
	if in.NewPassword != "" {
		if !password.Valid(in.NewPassword) {
			a.error(w, r, domain.Fail(422, "weak_password", "Choose a less common password of 8 to 128 characters."))
			return
		}
		if !a.passwordSlot(w, r) {
			return
		}
		var err error
		hash, err = password.Hash(in.NewPassword)
		<-a.PasswordSlots
		if err != nil {
			a.error(w, r, err)
			return
		}
	}
	raw, csrf := token(), token()
	valid := false
	purpose := ""
	var u domain.User
	err := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		valid = false
		c, err := storage.One[emailChallenge](ctx, a.Store, "email_challenges", bson.M{"_id": in.ChallengeID})
		if err == mongo.ErrNoDocuments {
			return nil
		}
		if err != nil {
			return err
		}
		if c.Consumed || !c.ExpiresAt.After(a.Now()) || c.Attempts >= 5 || !enum(c.Purpose, "login", "reset", "verify") {
			return nil
		}
		if (verification && (c.Purpose != "verify" || c.UserID != user(r).ID)) || (!verification && c.Purpose == "verify") {
			return nil
		}
		guard, err := storage.One[emailChallenge](ctx, a.Store, "email_challenges", bson.M{"_id": c.GuardID})
		if err != nil {
			return err
		}
		if guard.CurrentID != c.ID {
			return nil
		}
		// Failed guesses commit the attempt count; returning an error here would roll it back.
		if _, err = a.Store.C("email_challenges").UpdateOne(ctx, bson.M{"_id": c.ID}, bson.M{"$inc": bson.M{"attempts": 1}}); err != nil {
			return err
		}
		if !hmac.Equal([]byte(c.CodeHash), []byte(a.emailCodeHash(c.ID, c.Purpose, in.Code))) {
			return nil
		}
		u, err = storage.One[domain.User](ctx, a.Store, "users", bson.M{"_id": c.UserID})
		if err != nil {
			return err
		}
		if a.accountAccessError(u) != nil || c.Purpose == "login" && !enum(u.Role, "parent", "tutor") {
			return nil
		}
		cred, err := storage.One[credential](ctx, a.Store, "credentials", bson.M{"userId": u.ID})
		if err != nil {
			return err
		}
		if digest(cred.Hash) != c.CredentialHash {
			return nil
		}
		if c.Purpose == "reset" && hash == "" {
			return domain.Fail(422, "weak_password", "Enter a new password of 8 to 128 characters.")
		}
		if c.Purpose != "reset" && hash != "" {
			return domain.Fail(422, "validation", "A new password is only needed for recovery.")
		}
		if _, err = a.Store.C("email_challenges").UpdateOne(ctx, bson.M{"_id": c.ID}, bson.M{"$set": bson.M{"consumed": true}}); err != nil {
			return err
		}
		if _, err = a.Store.C("email_challenges").UpdateOne(ctx, bson.M{"_id": c.GuardID}, bson.M{"$set": bson.M{"currentId": ""}, "$inc": bson.M{"version": 1}}); err != nil {
			return err
		}
		update := bson.M{}
		if u.EmailVerifiedAt == nil {
			update["$set"] = bson.M{"emailVerifiedAt": a.Now()}
		}
		if c.Purpose == "reset" {
			result, err := a.Store.C("credentials").UpdateOne(ctx, bson.M{"_id": cred.Email, "passwordHash": cred.Hash}, bson.M{"$set": bson.M{"passwordHash": hash}})
			if err != nil {
				return err
			}
			if result.MatchedCount != 1 {
				return domain.Fail(409, "stale_version", "Account access changed. Request a new code.")
			}
			update["$inc"] = bson.M{"authVersion": 1}
			if _, err = a.Store.C("sessions").DeleteMany(ctx, bson.M{"userId": u.ID}); err != nil {
				return err
			}
		}
		if len(update) > 0 {
			if err = a.Store.C("users").FindOneAndUpdate(ctx, bson.M{"_id": u.ID}, update, options.FindOneAndUpdate().SetReturnDocument(options.After)).Decode(&u); err != nil {
				return err
			}
		}
		if c.Purpose == "login" {
			if err = a.saveSessionWithMethod(ctx, r, u, raw, csrf, a.emailSessionMethod()); err != nil {
				return err
			}
		}
		if c.Purpose == "reset" {
			if err = a.queueSecurityEmail(ctx, u.ID, "password_changed", c.ID); err != nil {
				return err
			}
		}
		valid = true
		purpose = c.Purpose
		return a.audit(ctx, u.ID, "auth.email_"+c.Purpose, u.ID)
	})
	if err != nil {
		a.error(w, r, err)
		return
	}
	if !valid {
		a.error(w, r, domain.Fail(401, "invalid_code", "This code is invalid or expired. Request a new code."))
		return
	}
	if purpose == "login" {
		a.authResponse(w, u, raw, csrf, 200)
		return
	}
	if purpose == "reset" {
		http.SetCookie(w, &http.Cookie{Name: "session", Value: "", Path: "/", MaxAge: -1, HttpOnly: true, Secure: a.Config.Env == "production", SameSite: http.SameSiteLaxMode})
	}
	a.json(w, 200, map[string]any{"ok": true, "message": map[string]string{"reset": "Password updated. Sign in with your new password.", "verify": "Email address verified."}[purpose]})
}
func (a *App) emailSessionMethod() string {
	if a.Config.Env == "production" {
		return "email-otp-production"
	}
	return "email-otp"
}
func (a *App) sessionMethods() bson.M {
	return bson.M{"$in": []string{a.sessionMethod(), a.emailSessionMethod()}}
}
