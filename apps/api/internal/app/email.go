package app

import (
	"context"
	"errors"
	"fmt"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/mailer"
	"tutorplatform/internal/storage"
)

func (a *App) queueSecurityEmail(ctx context.Context, recipient, event, id string) error {
	if a.Mail == nil {
		return nil
	}
	return a.enqueue(ctx, "email:"+event+":"+id+":"+recipient, "email", bson.M{"event": event, "recipientId": recipient}, "pending")
}
func (a *App) queueTrialEmail(ctx context.Context, t domain.Trial, event string) error {
	if a.Mail == nil {
		return nil
	}
	for _, id := range []string{t.OwnerID, t.TutorID} {
		if err := a.enqueue(ctx, fmt.Sprintf("email:trial:%s:%s:%d:%s", t.ID, event, t.Version, id), "email", bson.M{"event": event, "recipientId": id, "targetKind": "trial", "targetId": t.ID, "expectedStatus": t.Status, "version": strconv.Itoa(t.Version)}, "pending"); err != nil {
			return err
		}
	}
	return nil
}
func (a *App) queueEnrollmentEmail(ctx context.Context, en domain.Enrollment, event string) error {
	if a.Mail == nil {
		return nil
	}
	if en.Status == "cancelled" {
		visible, err := a.tutorArchiveVisible(ctx, en)
		if err != nil {
			return err
		}
		if !visible {
			return nil
		}
	}
	for _, id := range []string{en.OwnerID, en.TutorID} {
		if err := a.enqueue(ctx, fmt.Sprintf("email:enrollment:%s:%s:%d:%s", en.ID, event, en.Version, id), "email", bson.M{"event": event, "recipientId": id, "targetKind": "enrollment", "targetId": en.ID, "expectedStatus": en.Status, "tutorId": en.TutorID}, "pending"); err != nil {
			return err
		}
	}
	return nil
}
func (a *App) queueClassEmail(ctx context.Context, en domain.Enrollment, s domain.ClassSession, event string) error {
	if a.Mail == nil {
		return nil
	}
	for _, id := range []string{en.OwnerID, s.TutorID} {
		if err := a.enqueue(ctx, fmt.Sprintf("email:class:%s:%s:%d:%s", s.ID, event, s.Version, id), "email", bson.M{"event": event, "recipientId": id, "targetKind": "class", "targetId": s.ID, "expectedStatus": s.Status, "start": s.Start.Format(time.RFC3339Nano), "tutorId": s.TutorID, "version": strconv.Itoa(s.Version)}, "pending"); err != nil {
			return err
		}
	}
	return nil
}

func emailSkip(code string) error {
	return domain.Fail(409, "email_skip_"+code, "This email no longer applies.")
}
func (a *App) emailTemplate(ctx context.Context, j job, u domain.User) (mailer.TemplateData, error) {
	p := j.Payload
	d := mailer.TemplateData{Name: u.Name, Support: a.Config.SMTPFrom}
	if d.Support == "" {
		d.Support = "support@gocoaching.in"
	}
	switch p["event"] {
	case "auth_code":
		c, err := storage.One[emailChallenge](ctx, a.Store, "email_challenges", bson.M{"_id": p["challengeId"]})
		if err == mongo.ErrNoDocuments {
			return d, emailSkip("expired")
		}
		if err != nil {
			return d, err
		}
		guard, err := storage.One[emailChallenge](ctx, a.Store, "email_challenges", bson.M{"_id": c.GuardID})
		if err == mongo.ErrNoDocuments {
			return d, emailSkip("expired")
		}
		if err != nil {
			return d, err
		}
		if c.UserID != u.ID || c.Consumed || c.Attempts >= 5 || !c.ExpiresAt.After(a.Now()) || guard.CurrentID != c.ID || (c.Purpose == "signup" && c.Email != u.Email) {
			return d, emailSkip("expired")
		}
		if c.Purpose == "signup" {
			_, err = storage.One[credential](ctx, a.Store, "credentials", bson.M{"_id": c.Email})
			if err == nil {
				return d, emailSkip("account_changed")
			}
			if err != mongo.ErrNoDocuments {
				return d, err
			}
		} else {
			cred, err := storage.One[credential](ctx, a.Store, "credentials", bson.M{"userId": u.ID})
			if err != nil {
				return d, err
			}
			if digest(cred.Hash) != c.CredentialHash {
				return d, emailSkip("account_changed")
			}
		}
		d.Code, err = a.protectCode(c.ID, p["encryptedCode"], false)
		if err != nil {
			return d, err
		}
		d.Title = map[string]string{"signup": "Verify your email to create your account", "verify": "Verify your email address", "login": "Your sign-in code", "reset": "Reset your password"}[c.Purpose]
		if d.Title == "" {
			return d, emailSkip("invalid_purpose")
		}
		d.Intro = map[string]string{"signup": "Enter this code on the GoCoaching signup page. Your account will be created only after your email is verified. This code expires in 10 minutes.", "verify": "Use this code to confirm this email address belongs to you.", "login": "Use this code to sign in to your GoCoaching account.", "reset": "Use this code on the password recovery page to choose a new password."}[c.Purpose]
		d.Notice = "If you did not request this code, ignore this email. GoCoaching support will never ask you to share a code or password."
		return d, nil
	case "password_changed":
		d.Title = "Your password was changed"
		d.Intro = "The password for your GoCoaching account was updated. Existing sessions were ended."
		d.Notice = "If you did not make this change, use password recovery and contact support immediately."
		d.Action = "Open account"
		d.URL = a.Config.Origin + "/account"
		return d, nil
	}
	var learner, subjects, mode, tutor string
	var start, end time.Time
	simulated := false
	switch p["targetKind"] {
	case "trial":
		t, err := storage.One[domain.Trial](ctx, a.Store, "trials", bson.M{"_id": p["targetId"]})
		if err != nil {
			return d, err
		}
		if u.ID != t.OwnerID && u.ID != t.TutorID {
			return d, emailSkip("assignment")
		}
		if p["expectedStatus"] != "" && p["expectedStatus"] != t.Status {
			return d, emailSkip("status")
		}
		if p["event"] == "reminder" {
			if t.Status != "confirmed" || p["tutorId"] != t.TutorID || p["start"] != t.Start.Format(time.RFC3339Nano) {
				return d, emailSkip("schedule")
			}
			if err = a.emailTeachingScope(ctx, t.TutorID, t.Class, t.Mode, t.Subjects, t.Subject); err != nil {
				return d, err
			}
		}
		learner = t.LearnerName
		subjects = strings.Join(t.Subjects, ", ")
		if subjects == "" {
			subjects = t.Subject
		}
		mode = t.Mode
		teacher, lookupErr := storage.One[domain.User](ctx, a.Store, "users", bson.M{"_id": t.TutorID})
		if lookupErr != nil {
			return d, lookupErr
		}
		tutor = teacher.Name
		start = t.Start
		end = t.End
		d.URL = a.Config.Origin + "/workspace?view=sessions&learner=" + url.QueryEscape(t.LearnerID)
		if u.Role == "tutor" {
			d.URL += "&queue=" + url.QueryEscape(t.Status)
		}
		if u.Role == "parent" {
			if enum(t.Status, "completed", "reviewed") {
				d.URL += "&tab=completed"
			}
			if enum(t.Status, "cancelled", "declined") {
				d.URL += "&tab=past"
			}
			if p["event"] == "trial_feedback" {
				d.URL = a.Config.Origin + "/workspace?view=learners&learner=" + url.QueryEscape(t.LearnerID) + "&reportTab=feedback"
			}
		}
		d.Action = "View trial"
	case "enrollment", "class":
		var en domain.Enrollment
		var s domain.ClassSession
		var err error
		if p["targetKind"] == "class" {
			s, err = storage.One[domain.ClassSession](ctx, a.Store, "classes", bson.M{"_id": p["targetId"]})
			if err != nil {
				return d, err
			}
			en, err = storage.One[domain.Enrollment](ctx, a.Store, "enrollments", bson.M{"_id": s.EnrollmentID})
		} else {
			en, err = storage.One[domain.Enrollment](ctx, a.Store, "enrollments", bson.M{"_id": p["targetId"]})
		}
		if err != nil {
			return d, err
		}
		if u.ID != en.OwnerID && u.ID != en.TutorID {
			return d, emailSkip("assignment")
		}
		if p["tutorId"] != "" && p["tutorId"] != en.TutorID {
			return d, emailSkip("assignment")
		}
		if p["targetKind"] == "class" {
			if p["expectedStatus"] != "" && p["expectedStatus"] != s.Status {
				return d, emailSkip("status")
			}
			if p["start"] != s.Start.Format(time.RFC3339Nano) || p["tutorId"] != s.TutorID {
				return d, emailSkip("schedule")
			}
			start = s.Start
			end = s.End
			if p["event"] == "reminder" {
				if en.Status != "active" || s.Status != "scheduled" {
					return d, emailSkip("status")
				}
				if err = a.emailTeachingScope(ctx, en.TutorID, en.Class, en.Agreement.Mode, agreementSubjects(en.Agreement), en.Agreement.Subject); err != nil {
					return d, err
				}
			}
		} else {
			if p["expectedStatus"] != "" && p["expectedStatus"] != en.Status {
				return d, emailSkip("status")
			}
			d.Details = append(d.Details, mailer.Detail{Label: "Included classes", Value: strconv.Itoa(en.Agreement.SessionCount)}, mailer.Detail{Label: "Class duration", Value: fmt.Sprintf("%d minutes", en.Agreement.Minutes)})
			if p["event"] == "booking_confirmed" || p["event"] == "booking_resumed" {
				var first domain.ClassSession
				err = a.Store.C("classes").FindOne(ctx, bson.M{"enrollmentId": en.ID, "tutorId": en.TutorID, "status": "scheduled", "start": bson.M{"$gt": a.Now()}}, options.FindOne().SetSort(bson.D{{Key: "start", Value: 1}})).Decode(&first)
				if err != nil && err != mongo.ErrNoDocuments {
					return d, err
				}
				if err == nil {
					start, end = first.Start, first.End
				}
			}
			d.Details = append(d.Details, mailer.Detail{Label: "Booking reference", Value: en.ID})
			if u.Role == "parent" {
				d.Details = append(d.Details, mailer.Detail{Label: "Saved booking total", Value: fmt.Sprintf("INR %.2f", float64(en.Agreement.TotalPaise)/100)})
			}
		}
		learner = en.LearnerName
		simulated = en.PaymentSimulated
		subjects = strings.Join(agreementSubjects(en.Agreement), ", ")
		mode = en.Agreement.Mode
		tutor = en.TutorName
		d.URL = a.Config.Origin + "/tuition/" + url.PathEscape(en.ID)
		if p["targetKind"] == "class" {
			d.URL += "?class=" + url.QueryEscape(s.ID)
		}
		d.Action = "View classes"
	default:
		return d, emailSkip("unknown_event")
	}
	d.Details = append([]mailer.Detail{{Label: "Learner", Value: learner}, {Label: "Subjects", Value: subjects}, {Label: "Teaching mode", Value: map[string]string{"home": "Home Tuition", "online": "Online", "": "Online"}[mode]}, {Label: "Tutor", Value: tutor}}, d.Details...)
	if !start.IsZero() {
		ist := time.FixedZone("IST", 19800)
		d.Details = append(d.Details, mailer.Detail{Label: "Class date and time", Value: start.In(ist).Format("Mon, 02 Jan 2006 · 3:04 PM IST")}, mailer.Detail{Label: "Duration", Value: fmt.Sprintf("%d minutes", int(end.Sub(start).Minutes()))})
	}
	switch p["event"] {
	case "trial_requested":
		d.Title = "Trial booking requested"
		d.Intro = "The trial request is saved. It will be confirmed when the tutor accepts."
		if u.Role == "tutor" {
			d.Action = "Review trial request"
			d.Intro = "You have a new trial request. Check the lesson details and accept or decline it in your account."
		}
	case "trial_confirmed":
		d.Title = "Your trial is confirmed"
		d.Intro = "The tutor has accepted the trial. The saved date and time are below."
	case "trial_cancelled":
		d.Title = "Trial cancelled"
		d.Intro = "This trial has been cancelled. It is no longer in the teaching schedule."
	case "trial_declined":
		d.Title = "Trial request declined"
		d.Intro = "The tutor declined this trial request. You can choose another available tutor or date."
	case "trial_feedback":
		d.Title = "Trial feedback is ready"
		d.Intro = "The tutor's trial feedback and practice guidance are available in your account."
		if u.Role == "tutor" {
			d.Title = "Your trial feedback is saved"
			d.Intro = "Your trial feedback is saved and visible to the parent."
		}
	case "booking_confirmed":
		d.Title = "Regular classes confirmed"
		d.Intro = "Payment has been verified and the regular booking is confirmed. Your agreed class schedule is ready to view."
	case "booking_paused":
		d.Title = "Regular classes paused"
		d.Intro = "This tuition arrangement is paused. Check the reason and next steps in your account."
	case "booking_resumed":
		d.Title = "Regular classes resumed"
		d.Intro = "The tuition arrangement is active again. Review the saved schedule before the next class."
	case "booking_cancelled":
		d.Title = "Regular booking cancelled"
		d.Intro = "This tuition arrangement has been cancelled. Any refund decision and payment status are shown separately in your account."
	case "class_rescheduled":
		d.Title = "Class time updated"
		d.Intro = "The new class time has been accepted. Use the updated date and time below."
	case "class_change_proposed":
		d.Title = "A new class time was proposed"
		d.Intro = "A schedule change needs your review. The current class time remains in place until the change is accepted."
		d.Action = "Review proposed time"
	case "class_cancelled":
		d.Title = "Class cancelled"
		d.Intro = "This class has been cancelled. View your account for the saved reason and any makeup-class arrangement."
	case "reminder":
		due, err := time.Parse(time.RFC3339Nano, p["due"])
		if err != nil {
			return d, err
		}
		if !start.After(a.Now()) || a.Now().After(due.Add(15*time.Minute)) {
			return d, emailSkip("late_reminder")
		}
		preferences, err := storage.One[accountPreferences](ctx, a.Store, "preferences", bson.M{"_id": u.ID})
		if err != nil && err != mongo.ErrNoDocuments {
			return d, err
		}
		if preferences.EmailReminders != nil && !*preferences.EmailReminders {
			return d, emailSkip("preferences")
		}
		d.Title = "Class reminder: " + p["lead"]
		d.Intro = "Your confirmed class is coming up. Check the details and be ready a few minutes early."
		d.Action = "Open lesson"
	default:
		return d, emailSkip("unknown_event")
	}
	if enum(p["event"], "trial_cancelled", "trial_declined", "booking_cancelled", "class_cancelled") {
		d.Notice = "This email does not confirm a refund or a replacement class. Check the current booking and payment status in your account."
	} else if p["event"] == "trial_feedback" {
		d.Notice = "Feedback is shared directly by the tutor. Open your account to read the notes and next steps."
	} else if mode == "home" {
		d.Notice = "View the authorised teaching address in your account. If you need to change the schedule, use the class controls so everyone sees the same update."
	} else {
		d.Notice = "Open the lesson in your account to use the protected Zoom join control. It opens 15 minutes before the lesson; a meeting must first be prepared by the tutor."
	}
	if simulated {
		d.Title = "Test booking: " + d.Title
		if p["event"] == "booking_confirmed" {
			d.Intro = "A simulated payment confirmed this test booking. The saved class schedule is ready to view."
		}
		d.Notice = "Test booking only. No money was charged; this booking does not create tutor earnings. " + d.Notice
	}
	return d, nil
}
func (a *App) emailTeachingScope(ctx context.Context, id string, class int, mode string, subjects []string, subject string) error {
	approval, err := storage.One[domain.Application](ctx, a.Store, "applications", bson.M{"_id": id})
	if err != nil {
		return err
	}
	if mode == "" {
		mode = "online"
	}
	if len(subjects) == 0 {
		subjects = []string{subject}
	}
	if !domain.EligibleForMode(approval, class, mode, a.Now()) || !approval.Scope.CoversSubjects(subjects) {
		return emailSkip("scope")
	}
	return nil
}
func (a *App) processEmail(ctx context.Context, j job) error {
	if j.SMTPAcceptedAt != nil {
		return nil
	}
	if j.SMTPSubmissionStarted {
		return &mailer.Error{Ambiguous: true}
	}
	u, err := a.emailRecipient(ctx, j)
	if err != nil {
		return err
	}
	if u.ID != "" && a.accountAccessError(u) != nil {
		return emailSkip("account")
	}
	if a.Config.Env != "test" && (u.Sample || strings.HasSuffix(strings.ToLower(u.Email), ".test") || strings.HasSuffix(strings.ToLower(u.Email), ".invalid")) {
		return emailSkip("sample_recipient")
	}
	if _, valid := normalizeEmail(u.Email); !valid {
		return emailSkip("recipient")
	}
	template, err := a.emailTemplate(ctx, j, u)
	if err != nil {
		return err
	}
	content, err := mailer.Render(template)
	if err != nil {
		return err
	}
	// Persist intent before external submission. A crash after acceptance needs review.
	result, err := a.Store.C("outbox").UpdateOne(ctx, bson.M{"_id": j.ID, "leaseOwner": j.LeaseOwner, "status": "processing"}, bson.M{"$set": bson.M{"smtpSubmissionStarted": true}})
	if err != nil {
		return err
	}
	if result.MatchedCount != 1 {
		return domain.Fail(409, "email_lease_lost", "Email lease is no longer owned.")
	}
	err = a.Mail.Send(ctx, mailer.Message{ID: digest(j.ID), To: u.Email, Content: content})
	if err != nil {
		var smtpError *mailer.Error
		if !errors.As(err, &smtpError) || smtpError.Ambiguous {
			return &mailer.Error{Ambiguous: true}
		}
		_, persistErr := a.Store.C("outbox").UpdateOne(ctx, bson.M{"_id": j.ID, "leaseOwner": j.LeaseOwner}, bson.M{"$set": bson.M{"smtpSubmissionStarted": false}})
		if persistErr != nil {
			return persistErr
		}
		return err
	}
	_, err = a.Store.C("outbox").UpdateOne(ctx, bson.M{"_id": j.ID, "leaseOwner": j.LeaseOwner}, bson.M{"$set": bson.M{"smtpAcceptedAt": a.Now()}, "$unset": bson.M{"payload.encryptedCode": ""}})
	return err
}

// Signup codes have a pending recipient, never a partially registered user.
func (a *App) emailRecipient(ctx context.Context, j job) (domain.User, error) {
	if j.Payload["event"] == "auth_code" && j.Payload["recipientId"] == "" {
		c, err := storage.One[emailChallenge](ctx, a.Store, "email_challenges", bson.M{"_id": j.Payload["challengeId"], "purpose": "signup"})
		if err == mongo.ErrNoDocuments {
			return domain.User{}, emailSkip("expired")
		}
		if err != nil {
			return domain.User{}, err
		}
		return domain.User{Email: c.Email}, nil
	}
	return storage.One[domain.User](ctx, a.Store, "users", bson.M{"_id": j.Payload["recipientId"]})
}

func (a *App) emailPreferences(w http.ResponseWriter, r *http.Request) {
	p, err := storage.One[accountPreferences](r.Context(), a.Store, "preferences", bson.M{"_id": user(r).ID})
	if err != nil && err != mongo.ErrNoDocuments {
		a.error(w, r, err)
		return
	}
	enabled := p.EmailReminders == nil || *p.EmailReminders
	a.json(w, 200, map[string]any{"reminders": enabled, "version": p.Version})
}
func (a *App) saveEmailPreferences(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Reminders *bool `json:"reminders"`
		Version   int   `json:"version"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	if in.Reminders == nil || in.Version < 0 {
		a.error(w, r, domain.Fail(422, "validation", "Choose your reminder preference."))
		return
	}
	err := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		p, err := storage.One[accountPreferences](ctx, a.Store, "preferences", bson.M{"_id": user(r).ID})
		if err != nil && err != mongo.ErrNoDocuments {
			return err
		}
		if p.Version != in.Version {
			return domain.Fail(409, "stale_version", "Preferences changed. Refresh before saving.")
		}
		p.ID = user(r).ID
		if p.Language == "" {
			p.Language = "en"
		}
		p.EmailReminders = in.Reminders
		p.Version++
		_, err = a.Store.C("preferences").ReplaceOne(ctx, bson.M{"_id": p.ID}, p, options.Replace().SetUpsert(true))
		if err != nil {
			return err
		}
		return a.audit(ctx, user(r).ID, "account.email_preferences", p.ID)
	})
	if err != nil {
		a.error(w, r, err)
		return
	}
	a.json(w, 200, map[string]bool{"ok": true})
}

// Rolling bounded scans backfill existing bookings after email is configured.
func (a *App) scheduleEmailReminders(ctx context.Context) error {
	if a.Mail == nil {
		return nil
	}
	for _, kind := range []string{"classes", "trials"} {
		scanID := "email-scan:" + kind
		var scan struct {
			Cursor string `bson:"cursor"`
		}
		err := a.Store.C("guards").FindOne(ctx, bson.M{"_id": scanID}).Decode(&scan)
		if err != nil && err != mongo.ErrNoDocuments {
			return err
		}
		status := "scheduled"
		if kind == "trials" {
			status = "confirmed"
		}
		filter := bson.M{"status": status, "start": bson.M{"$gt": a.Now(), "$lte": a.Now().Add(24*time.Hour + time.Minute)}}
		if scan.Cursor != "" {
			filter["_id"] = bson.M{"$gt": scan.Cursor}
		}
		rows, err := a.Store.C(kind).Find(ctx, filter, options.Find().SetSort(bson.D{{Key: "_id", Value: 1}}).SetLimit(25))
		if err != nil {
			return err
		}
		var values []bson.Raw
		err = rows.All(ctx, &values)
		rows.Close(ctx)
		if err != nil {
			return err
		}
		cursor := ""
		writes := []mongo.WriteModel{}
		for _, raw := range values {
			var id, owner, tutor string
			var start time.Time
			if kind == "classes" {
				var s domain.ClassSession
				if err = bson.Unmarshal(raw, &s); err != nil {
					return err
				}
				en, e := storage.One[domain.Enrollment](ctx, a.Store, "enrollments", bson.M{"_id": s.EnrollmentID})
				if e != nil {
					return e
				}
				if en.Status != "active" || en.TutorID != s.TutorID {
					continue
				}
				id = s.ID
				owner = en.OwnerID
				tutor = s.TutorID
				start = s.Start
			} else {
				var t domain.Trial
				if err = bson.Unmarshal(raw, &t); err != nil {
					return err
				}
				id = t.ID
				owner = t.OwnerID
				tutor = t.TutorID
				start = t.Start
			}
			for _, lead := range []struct {
				duration time.Duration
				label    string
			}{{24 * time.Hour, "24 hours"}, {time.Hour, "1 hour"}} {
				due := start.Add(-lead.duration)
				if due.Before(a.Now().Add(-5 * time.Minute)) {
					continue
				}
				for _, recipient := range []string{owner, tutor} {
					jobID := "email:reminder:" + digest(kind+":"+id+":"+start.Format(time.RFC3339Nano)+":"+tutor+":"+lead.label+":"+recipient)
					payload := bson.M{"event": "reminder", "recipientId": recipient, "targetKind": map[string]string{"classes": "class", "trials": "trial"}[kind], "targetId": id, "tutorId": tutor, "start": start.Format(time.RFC3339Nano), "due": due.Format(time.RFC3339Nano), "lead": lead.label}
					writes = append(writes, mongo.NewUpdateOneModel().SetFilter(bson.M{"_id": jobID}).SetUpdate(bson.M{"$setOnInsert": bson.M{"kind": "email", "payload": payload, "status": "pending", "attempts": 0, "availableAt": due, "createdAt": a.Now()}}).SetUpsert(true))
				}
			}
		}
		if len(writes) > 0 {
			if _, err = a.Store.C("outbox").BulkWrite(ctx, writes); err != nil {
				return err
			}
		}
		if len(values) < 25 {
			cursor = ""
		} else {
			cursor = values[len(values)-1].Lookup("_id").StringValue()
		}
		_, err = a.Store.C("guards").UpdateOne(ctx, bson.M{"_id": scanID}, bson.M{"$set": bson.M{"cursor": cursor}, "$inc": bson.M{"version": 1}}, options.UpdateOne().SetUpsert(true))
		if err != nil {
			return err
		}
	}
	return nil
}
