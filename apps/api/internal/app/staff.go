package app

import (
	"context"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/meetings"
	"tutorplatform/internal/storage"
)

func restrictedTutorRoute(path, id string) bool {
	if enum(path, "/api/v1/me", "/api/v1/dashboard", "/api/v1/application", "/api/v1/auth/logout") {
		return true
	}
	for _, prefix := range []string{"/api/v1/account", "/api/v1/cases", "/api/v1/notifications", "/api/v1/inbox", "/api/v1/files", "/api/v1/applications/" + id + "/files"} {
		if path == prefix || strings.HasPrefix(path, prefix+"/") {
			return true
		}
	}
	return false
}

func staffApplicationFilter(u domain.User) bson.M {
	f := bson.M{"status": bson.M{"$ne": "draft"}}
	if u.Role == "mentor" {
		f["$or"] = []bson.M{{"status": "submitted"}, {"assessorId": u.ID}}
	}
	return f
}

func (a *App) staffOverview(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "admin", "mentor") {
		return
	}
	f := staffApplicationFilter(user(r))
	counts := map[string]int64{}
	cur, e := a.Store.C("applications").Aggregate(r.Context(), mongo.Pipeline{
		{{Key: "$match", Value: f}},
		{{Key: "$group", Value: bson.M{"_id": "$status", "count": bson.M{"$sum": 1}}}},
	})
	if e != nil {
		a.error(w, r, e)
		return
	}
	var rows []struct {
		Status string `bson:"_id"`
		Count  int64  `bson:"count"`
	}
	e = cur.All(r.Context(), &rows)
	cur.Close(r.Context())
	if e != nil {
		a.error(w, r, e)
		return
	}
	for _, row := range rows {
		counts[row.Status] = row.Count
	}
	expired, e := a.Store.C("applications").CountDocuments(r.Context(), bson.M{"$and": []bson.M{f, {"status": "approved", "scope.expiresAt": bson.M{"$lte": a.Now()}}}})
	if e != nil {
		a.error(w, r, e)
		return
	}
	counts["expired"] = expired
	counts["approved"] -= expired
	cur, e = a.Store.C("applications").Find(r.Context(), bson.M{"$and": []bson.M{f, {"interview.status": "scheduled", "interview.end": bson.M{"$gt": a.Now()}}}}, options.Find().SetSort(bson.D{{Key: "interview.start", Value: 1}, {Key: "_id", Value: 1}}).SetLimit(5))
	if e != nil {
		a.error(w, r, e)
		return
	}
	upcoming := []domain.Application{}
	e = cur.All(r.Context(), &upcoming)
	cur.Close(r.Context())
	if e != nil {
		a.error(w, r, e)
		return
	}
	var tasks int64
	if user(r).Role == "admin" {
		tasks, e = a.Store.C("outbox").CountDocuments(r.Context(), bson.M{"kind": "review_existing_arrangements", "status": "pending_operator"})
		if e != nil {
			a.error(w, r, e)
			return
		}
	}
	a.json(w, 200, map[string]any{"counts": counts, "upcoming": upcoming, "followups": tasks})
}

func (a *App) staffApplications(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "admin", "mentor") {
		return
	}
	q := r.URL.Query()
	filters := []bson.M{staffApplicationFilter(user(r))}
	if kind := q.Get("kind"); kind == "tutors" {
		filters = append(filters, bson.M{"status": bson.M{"$in": []string{"approved", "suspended", "terminated"}}})
	} else if kind == "interviews" {
		filters = append(filters, bson.M{"interview.status": "scheduled"})
	} else if kind != "" && kind != "applications" {
		a.error(w, r, domain.Fail(422, "validation", "Unknown queue."))
		return
	}
	status := q.Get("status")
	if status == "expired" {
		filters = append(filters, bson.M{"status": "approved", "scope.expiresAt": bson.M{"$lte": a.Now()}})
	} else if status != "" {
		if !enum(status, "submitted", "under_review", "assessment_scheduled", "assessed", "improvement_required", "declined", "approved", "suspended", "terminated") {
			a.error(w, r, domain.Fail(422, "validation", "Unknown status."))
			return
		}
		filters = append(filters, bson.M{"status": status})
		if status == "approved" {
			filters = append(filters, bson.M{"scope.expiresAt": bson.M{"$gt": a.Now()}})
		}
	}
	if search := strings.TrimSpace(q.Get("q")); search != "" {
		if !validText(search, 1, 80) {
			a.error(w, r, domain.Fail(422, "validation", "Search is too long."))
			return
		}
		filters = append(filters, bson.M{"name": bson.M{"$regex": regexp.QuoteMeta(search), "$options": "i"}})
	}
	if mode := q.Get("mode"); mode != "" {
		if !enum(mode, "home", "online") {
			a.error(w, r, domain.Fail(422, "validation", "Choose a teaching mode."))
			return
		}
		filters = append(filters, bson.M{"$or": []bson.M{{"profile.teachingAreas": bson.M{"$elemMatch": bson.M{"modes": mode}}}, {"profile": bson.M{"$exists": false}, "scope.mode": mode}}})
	}
	if q.Get("assignee") == "mine" {
		filters = append(filters, bson.M{"assessorId": user(r).ID})
	}
	page, e := pageRecords[domain.Application](r.Context(), a.Store, "applications", bson.M{"$and": filters}, q.Get("cursor"))
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 200, page)
}

func (a *App) staffApplication(ctx context.Context, u domain.User, id string) (domain.Application, error) {
	f := staffApplicationFilter(u)
	f["_id"] = id
	return storage.One[domain.Application](ctx, a.Store, "applications", f)
}

func (a *App) staffApplicationDetail(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "admin", "mentor") {
		return
	}
	v, e := a.staffApplication(r.Context(), user(r), chi.URLParam(r, "id"))
	if e != nil {
		a.error(w, r, e)
		return
	}
	u, e := storage.One[domain.User](r.Context(), a.Store, "users", bson.M{"_id": v.ID, "role": "tutor"})
	if e != nil {
		a.error(w, r, e)
		return
	}
	assessor := domain.StaffMember{}
	if v.AssessorID != "" {
		assessor, e = storage.One[domain.StaffMember](r.Context(), a.Store, "users", bson.M{"_id": v.AssessorID, "role": bson.M{"$in": []string{"mentor", "admin"}}})
		if e != nil && e != mongo.ErrNoDocuments {
			a.error(w, r, e)
			return
		}
	}
	a.json(w, 200, map[string]any{"application": v, "email": u.Email, "assessor": assessor})
}

func (a *App) staffMembers(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "admin", "mentor") {
		return
	}
	f := bson.M{"role": bson.M{"$in": []string{"mentor", "admin"}}}
	if user(r).Role == "mentor" {
		f["_id"] = user(r).ID
	}
	p, e := pageRecords[domain.StaffMember](r.Context(), a.Store, "users", f, r.URL.Query().Get("cursor"))
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 200, p)
}

// Both new and legacy audit identifiers are ordered by time, then ID. The cursor is bounded.
func (a *App) staffEvents(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "admin", "mentor") {
		return
	}
	f := bson.M{}
	if id := r.URL.Query().Get("application"); id != "" {
		if _, e := a.staffApplication(r.Context(), user(r), id); e != nil {
			a.error(w, r, e)
			return
		}
		f["target"] = id
	} else if user(r).Role != "admin" {
		a.error(w, r, domain.Fail(403, "forbidden", "Choose an assigned application."))
		return
	}
	if cursor := r.URL.Query().Get("cursor"); cursor != "" {
		parts := strings.SplitN(cursor, "|", 2)
		if len(parts) != 2 || len(cursor) > 180 {
			a.error(w, r, domain.Fail(422, "validation", "Invalid page cursor."))
			return
		}
		at, e := time.Parse(time.RFC3339Nano, parts[0])
		if e != nil {
			a.error(w, r, domain.Fail(422, "validation", "Invalid page cursor."))
			return
		}
		f["$or"] = []bson.M{{"at": bson.M{"$lt": at}}, {"at": at, "_id": bson.M{"$lt": parts[1]}}}
	}
	cur, e := a.Store.C("audit").Find(r.Context(), f, options.Find().SetSort(bson.D{{Key: "at", Value: -1}, {Key: "_id", Value: -1}}).SetLimit(26))
	if e != nil {
		a.error(w, r, e)
		return
	}
	defer cur.Close(r.Context())
	rows := []domain.StaffEvent{}
	if e = cur.All(r.Context(), &rows); e != nil {
		a.error(w, r, e)
		return
	}
	next := ""
	if len(rows) > 25 {
		rows = rows[:25]
		last := rows[24]
		next = last.At.Format(time.RFC3339Nano) + "|" + last.ID
	}
	a.json(w, 200, recordPage[domain.StaffEvent]{Items: rows, NextCursor: next})
}

type staffDecisionInput struct {
	Action        string            `json:"action"`
	Version       *int              `json:"version"`
	Reason        string            `json:"reason"`
	Evidence      string            `json:"evidence"`
	Scores        []int             `json:"scores"`
	MinClass      int               `json:"minClass"`
	MaxClass      int               `json:"maxClass"`
	AssessorID    string            `json:"assessorId"`
	MentorID      string            `json:"mentorId"`
	ConflictClear bool              `json:"conflictClear"`
	Eligibility   string            `json:"eligibility"`
	Interview     *domain.Interview `json:"interview"`
	FeePlans      []domain.FeePlan  `json:"feePlans"`
}

func validInterview(v *domain.Interview, now time.Time) bool {
	return validInterviewTime(v, now) && meetings.ValidJoinURL(v.JoinURL)
}
func validInterviewTime(v *domain.Interview, now time.Time) bool {
	if v == nil || v.Start.Before(now.Add(-5*time.Minute)) || v.Start.After(now.AddDate(0, 3, 0)) || v.End.Sub(v.Start) < 15*time.Minute || v.End.Sub(v.Start) > 2*time.Hour {
		return false
	}
	if _, e := time.LoadLocation(v.Timezone); e != nil {
		return false
	}
	return v.End.Sub(v.Start)%time.Minute == 0
}

func interviewKeys(v domain.Application) []string {
	keys := []string{}
	if v.Interview == nil {
		return keys
	}
	for day := v.Interview.Start.UTC().Truncate(24 * time.Hour); day.Before(v.Interview.End); day = day.Add(24 * time.Hour) {
		ids := []string{v.ID, v.AssessorID}
		if v.Interview.HostKey != "" {
			ids = append(ids, "zoom-host:"+v.Interview.HostKey)
		}
		for _, id := range ids {
			keys = append(keys, "interview:"+id+":"+day.Format("2006-01-02"))
		}
	}
	sort.Strings(keys)
	return keys
}

func (a *App) reserveInterview(ctx context.Context, v domain.Application, release bool) error {
	if v.Interview == nil || v.Interview.Status != "scheduled" {
		return nil
	}
	for _, key := range interviewKeys(v) {
		var g guard
		e := a.Store.C("guards").FindOneAndUpdate(ctx, bson.M{"_id": key}, bson.M{"$inc": bson.M{"version": 1}, "$setOnInsert": bson.M{"intervals": []interval{}}}, options.FindOneAndUpdate().SetUpsert(true).SetReturnDocument(options.After)).Decode(&g)
		if e != nil {
			return e
		}
		intervals := []interval{}
		for _, iv := range g.Intervals {
			if iv.ID == v.ID || !iv.End.After(a.Now()) {
				continue
			}
			if !release && domain.Overlap(iv.Start, iv.End, v.Interview.Start, v.Interview.End) {
				return domain.Fail(409, "interview_conflict", "The reviewer or applicant already has an interview at this time.")
			}
			intervals = append(intervals, iv)
		}
		if !release {
			intervals = append(intervals, interval{ID: v.ID, Start: v.Interview.Start.UTC(), End: v.Interview.End.UTC()})
		}
		if _, e = a.Store.C("guards").UpdateOne(ctx, bson.M{"_id": key}, bson.M{"$set": bson.M{"intervals": intervals}}); e != nil {
			return e
		}
	}
	return nil
}

func (a *App) staffAudit(ctx context.Context, u domain.User, action, target, reason, from, to string, application *domain.Application) error {
	event := domain.StaffEvent{Event: domain.Event{ID: a.chronologicalID(), Actor: u.ID, Action: action, Target: target, At: a.Now()}, ActorName: u.Name, Reason: clean(reason), FromStatus: from, ToStatus: to}
	if application != nil {
		event.Interview = application.Interview
		event.Scores = application.Scores
		event.Evidence = application.Evidence
		event.Scope = &application.Scope
		event.Eligibility = application.Eligibility
		event.Fees = application.Fees
	}
	_, e := a.Store.C("audit").InsertOne(ctx, event)
	return e
}

func (a *App) decision(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "admin", "mentor") {
		return
	}
	var in staffDecisionInput
	if !a.decode(w, r, &in) {
		return
	}
	if in.Version == nil || *in.Version < 0 {
		a.error(w, r, domain.Fail(422, "validation", "Refresh the application before making a decision."))
		return
	}
	u, id := user(r), chi.URLParam(r, "id")
	e := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		v, e := storage.One[domain.Application](ctx, a.Store, "applications", bson.M{"_id": id})
		if e != nil {
			return e
		}
		if id == u.ID {
			return domain.Fail(403, "self_assessment", "You cannot assess your own application.")
		}
		if v.Version != *in.Version {
			return domain.Fail(409, "stale", "This application changed. Refresh before deciding.")
		}
		if v.Status == "draft" {
			return domain.Fail(409, "invalid_transition", "The applicant must submit first.")
		}
		if u.Role == "mentor" && v.AssessorID != u.ID && !(in.Action == "review" && v.Status == "submitted") {
			return domain.Fail(403, "forbidden", "Only the assigned reviewer can change this application.")
		}
		from := v.Status
		var previous *domain.Interview
		if v.Interview != nil {
			copy := *v.Interview
			previous = &copy
		}
		if previous != nil && previous.Provider == "zoom" && previous.SyncStatus != "ready" && !enum(in.Action, "note", "eligibility") {
			return domain.Fail(409, "meeting_pending", "Finish or retry the Zoom operation before changing this interview.")
		}
		needsReason := enum(in.Action, "assign", "reschedule", "cancel_interview", "no_show", "approve", "improve", "decline", "suspend", "reinstate", "terminate", "reopen", "note", "eligibility")
		if needsReason && !validText(in.Reason, 10, 1000) {
			return domain.Fail(422, "validation", "Record a reason of 10–1000 characters.")
		}
		switch in.Action {
		case "fees":
			if !enum(v.Status, "assessment_scheduled", "assessed", "approved", "suspended") ||
				(v.Status == "assessment_scheduled" && (v.Interview == nil || a.Now().Before(v.Interview.Start))) {
				return domain.Fail(409, "invalid_transition", "Set fees during or after the interview.")
			}
			if u.Role != "admin" && (v.AssessorID != u.ID || !v.ConflictClear) {
				return domain.Fail(403, "forbidden", "Only an administrator or the assigned reviewer can set fees.")
			}
			if e = validateFeePlans(v, in.FeePlans); e != nil {
				return e
			}
			// Application revisions survive a resubmission/reopen that clears fees.
			version := v.Version + 1
			if v.Fees != nil {
				version = max(version, v.Fees.Version+1)
			}
			v.Fees = &domain.TutorFees{Plans: in.FeePlans, Version: version, SetBy: u.ID, SetAt: a.Now()}
		case "eligibility":
			if u.Role != "admin" || v.Profile == nil || !enum(v.Status, "submitted", "under_review", "assessment_scheduled", "assessed", "improvement_required") {
				return domain.Fail(403, "forbidden", "An administrator reviews eligibility before approval.")
			}
			if !enum(in.Eligibility, "cleared", "blocked") {
				return domain.Fail(422, "validation", "Record an eligibility outcome.")
			}
			now := a.Now()
			v.Eligibility = &domain.EligibilityReview{Status: in.Eligibility, Reason: clean(in.Reason), ReviewerID: u.ID, ReviewedAt: &now}
		case "review", "assign":
			if !enum(v.Status, "submitted", "under_review", "assessment_scheduled") {
				return domain.Fail(409, "invalid_transition", "This application cannot be assigned at this stage.")
			}
			if in.Action == "review" && v.Status != "submitted" {
				return domain.Fail(409, "invalid_transition", "This application is already assigned.")
			}
			assessor := u.ID
			if in.Action == "assign" {
				if u.Role != "admin" {
					return domain.Fail(403, "forbidden", "Only administrators can reassign reviews.")
				}
				assessor = in.AssessorID
			}
			if assessor == id {
				return domain.Fail(403, "self_assessment", "An applicant cannot assess themselves.")
			}
			if _, e = storage.One[domain.User](ctx, a.Store, "users", bson.M{"_id": assessor, "role": bson.M{"$in": []string{"mentor", "admin"}}}); e != nil {
				return domain.Fail(422, "validation", "Choose a provisioned academic reviewer.")
			}
			if in.Action == "review" && !in.ConflictClear {
				return domain.Fail(422, "validation", "Confirm there is no conflict of interest.")
			}
			if e = a.reserveInterview(ctx, v, true); e != nil {
				return e
			}
			if v.Interview != nil {
				v.Interview.Status = "cancelled"
			}
			v.AssessorID = assessor
			v.Status = "under_review"
			v.ConflictClear = in.Action == "review" && in.ConflictClear
		case "confirm_conflict":
			if v.AssessorID != u.ID || !in.ConflictClear || v.Status != "under_review" {
				return domain.Fail(403, "forbidden", "The assigned reviewer must confirm no conflict of interest.")
			}
			v.ConflictClear = true
		case "schedule", "reschedule":
			if v.AssessorID != u.ID || !v.ConflictClear {
				return domain.Fail(403, "forbidden", "The assigned reviewer must confirm no conflict of interest.")
			}
			if !(in.Action == "schedule" && v.Status == "under_review" || in.Action == "reschedule" && v.Status == "assessment_scheduled") {
				return domain.Fail(409, "invalid_transition", "This interview cannot be scheduled at this stage.")
			}
			zoom := a.Meetings != nil || previous != nil && previous.Provider == "zoom"
			if zoom && a.Meetings == nil {
				return domain.Fail(503, "meeting_unconfigured", "Zoom is not configured.")
			}
			if zoom && (!validInterviewTime(in.Interview, a.Now()) || in.Interview.JoinURL != "") || !zoom && !validInterview(in.Interview, a.Now()) {
				return domain.Fail(422, "interview_validation", "Choose a valid interview time, timezone and Zoom join link.")
			}
			if e = a.reserveInterview(ctx, v, true); e != nil {
				return e
			}
			v.Interview = &domain.Interview{Start: in.Interview.Start, End: in.Interview.End, Timezone: in.Interview.Timezone, JoinURL: in.Interview.JoinURL}
			v.Interview.Start = v.Interview.Start.UTC()
			v.Interview.End = v.Interview.End.UTC()
			v.Interview.Status = "scheduled"
			if zoom {
				operation := "create"
				v.Interview.HostKey = digest(a.Config.ZoomHostID)[:16]
				if in.Action == "reschedule" && previous != nil && previous.Provider == "zoom" {
					operation = "update"
					v.Interview.MeetingID = previous.MeetingID
					v.Interview.HostKey = previous.HostKey
				}
				if e = a.queueMeeting(ctx, &v, operation); e != nil {
					return e
				}
			}
			if e = a.reserveInterview(ctx, v, false); e != nil {
				return e
			}
			v.Status = "assessment_scheduled"
		case "cancel_interview", "no_show":
			if v.Status != "assessment_scheduled" || v.Interview == nil {
				return domain.Fail(409, "invalid_transition", "No interview is scheduled.")
			}
			if in.Action == "no_show" && a.Now().Before(v.Interview.Start) {
				return domain.Fail(409, "invalid_transition", "The interview has not started.")
			}
			if e = a.reserveInterview(ctx, v, true); e != nil {
				return e
			}
			v.Interview.Status = map[string]string{"cancel_interview": "cancelled", "no_show": "no_show"}[in.Action]
			v.Status = "under_review"
		case "assess":
			if v.Status != "assessment_scheduled" || v.AssessorID != u.ID || !v.ConflictClear || v.Interview == nil || a.Now().Before(v.Interview.Start) {
				return domain.Fail(409, "invalid_transition", "The assigned reviewer can assess after the interview starts.")
			}
			if len(in.Scores) != 6 || !validText(in.Evidence, 10, 1200) {
				return domain.Fail(422, "validation", "Record all six scores and assessment evidence.")
			}
			for _, score := range in.Scores {
				if score < 1 || score > 5 {
					return domain.Fail(422, "validation", "Scores must be from 1 to 5.")
				}
			}
			if e = a.reserveInterview(ctx, v, true); e != nil {
				return e
			}
			v.Interview.Status = "completed"
			v.Scores = in.Scores
			v.Evidence = clean(in.Evidence)
			v.AssessmentAt = a.Now()
			v.Status = "assessed"
		case "approve":
			if v.Status != "assessed" || v.AssessorID != u.ID || !v.ConflictClear {
				return domain.Fail(409, "invalid_transition", "Only the assigned reviewer can approve an assessed application.")
			}
			if in.MinClass < 6 || in.MaxClass > 10 || in.MinClass > in.MaxClass {
				return domain.Fail(422, "validation", "Approved classes must be within 6–10.")
			}
			if v.Profile != nil {
				if v.Profile.NeedsEligibilityReview() && (v.Eligibility == nil || v.Eligibility.Status != "cleared" || v.Eligibility.ReviewedAt == nil) || v.Eligibility != nil && v.Eligibility.Status == "blocked" {
					return domain.Fail(409, "eligibility_pending", "An administrator must complete the required eligibility review.")
				}
				area, ok := v.Profile.FirstArea()
				if !ok || area.Subject != "Mathematics" || !enum("online", area.Modes...) || in.MinClass < area.MinClass || in.MaxClass > area.MaxClass {
					return domain.Fail(409, "requested_scope", "Approve only an assessed, requested teaching area supported by the current booking service.")
				}
				v.Scope.Subject = area.Subject
				v.Scope.Mode = "online"
				if v.Profile.About.DisplayName != "" {
					v.Name = v.Profile.About.DisplayName
				}
			}
			mentorID := in.MentorID
			if v.Fees == nil || len(v.FeePlans()) == 0 {
				return domain.Fail(409, "fees_pending", "Finalize the tutor's fees before approval.")
			}
			if mentorID == "" && u.Role == "mentor" {
				mentorID = u.ID
			}
			if _, e = storage.One[domain.User](ctx, a.Store, "users", bson.M{"_id": mentorID, "role": "mentor"}); e != nil {
				return domain.Fail(422, "validation", "Choose the academic mentor who will support this tutor's learners.")
			}
			v.MentorID = mentorID
			v.Scope.MinClass = in.MinClass
			v.Scope.MaxClass = in.MaxClass
			v.Scope.ExpiresAt = a.Now().AddDate(0, 6, 0)
			v.Status = "approved"
			v.Reason = clean(in.Reason)
		case "improve", "decline":
			if !enum(v.Status, "under_review", "assessment_scheduled", "assessed") || v.AssessorID != u.ID || !v.ConflictClear {
				return domain.Fail(409, "invalid_transition", "The assigned reviewer must review this application first.")
			}
			if e = a.reserveInterview(ctx, v, true); e != nil {
				return e
			}
			if v.Interview != nil && v.Interview.Status == "scheduled" {
				v.Interview.Status = "cancelled"
			}
			v.Status = map[string]string{"improve": "improvement_required", "decline": "declined"}[in.Action]
			v.Reason = clean(in.Reason)
		case "suspend", "reinstate", "terminate", "reopen":
			if u.Role != "admin" {
				return domain.Fail(403, "forbidden", "Tutor access changes require an administrator.")
			}
			switch in.Action {
			case "suspend":
				if v.Status != "approved" {
					return domain.Fail(409, "invalid_transition", "Only approved tutors can be suspended.")
				}
				v.Status = "suspended"
			case "reinstate":
				if v.Status != "suspended" || !v.Scope.ExpiresAt.After(a.Now()) {
					return domain.Fail(409, "invalid_transition", "Reinstatement needs an unexpired approval. Reassess an expired scope.")
				}
				v.Status = "approved"
			case "terminate":
				if !enum(v.Status, "approved", "suspended") {
					return domain.Fail(409, "invalid_transition", "Only approved or suspended tutors can be terminated.")
				}
				v.Status = "terminated"
			case "reopen":
				if !(v.Status == "declined" || v.Status == "suspended" && !v.Scope.ExpiresAt.After(a.Now()) || v.Status == "approved" && !v.Scope.ExpiresAt.After(a.Now())) {
					return domain.Fail(409, "invalid_transition", "This application does not need reopening.")
				}
				v.Status = "submitted"
				v.Fees = nil
				v.AssessorID = ""
				v.ConflictClear = false
				v.Scores = nil
				v.Evidence = ""
			}
			v.Reason = clean(in.Reason)
			if enum(in.Action, "suspend", "terminate") {
				if e = a.reserveInterview(ctx, v, true); e != nil {
					return e
				}
				if v.Interview != nil && v.Interview.Status == "scheduled" {
					v.Interview.Status = "cancelled"
				}
				_, e = a.Store.C("outbox").UpdateOne(ctx, bson.M{"_id": "tutor_followup:" + id}, bson.M{"$set": bson.M{"kind": "review_existing_arrangements", "status": "pending_operator", "attempts": 0, "availableAt": a.Now(), "tutorId": id, "tutorName": v.Name, "reason": v.Reason, "resolution": ""}, "$inc": bson.M{"version": 1}}, options.UpdateOne().SetUpsert(true))
				if e != nil {
					return e
				}
			}
			if _, e = a.Store.C("users").UpdateOne(ctx, bson.M{"_id": id, "role": "tutor"}, bson.M{"$inc": bson.M{"authVersion": 1}}); e != nil {
				return e
			}
			if _, e = a.Store.C("sessions").DeleteMany(ctx, bson.M{"userId": id}); e != nil {
				return e
			}
		case "note":
			if u.Role != "admin" && v.AssessorID != u.ID {
				return domain.Fail(403, "forbidden", "Only the assigned reviewer can add notes.")
			}
		default:
			return domain.Fail(422, "validation", "Unknown staff action.")
		}
		if previous != nil && previous.Provider == "zoom" && previous.Status == "scheduled" && v.Interview != nil && v.Interview.Status == "cancelled" {
			if e = a.queueMeeting(ctx, &v, "delete"); e != nil {
				return e
			}
		}
		v.Version++
		v.UpdatedAt = a.Now()
		if _, e = a.Store.C("applications").ReplaceOne(ctx, bson.M{"_id": id}, v); e != nil {
			return e
		}
		return a.staffAudit(ctx, u, "application."+in.Action, id, in.Reason, from, v.Status, &v)
	})
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 200, map[string]bool{"ok": true})
}

func (a *App) staffFollowups(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "admin") {
		return
	}
	status := "pending_operator"
	if r.URL.Query().Get("status") == "resolved_operator" {
		status = "resolved_operator"
	}
	p, e := pageRecords[domain.TutorFollowup](r.Context(), a.Store, "outbox", bson.M{"kind": "review_existing_arrangements", "status": status}, r.URL.Query().Get("cursor"))
	if e != nil {
		a.error(w, r, e)
		return
	}
	for i := range p.Items {
		v := &p.Items[i]
		v.Trials, e = a.Store.C("trials").CountDocuments(r.Context(), bson.M{"tutorId": v.TutorID, "status": bson.M{"$in": []string{"requested", "confirmed"}}})
		if e != nil {
			a.error(w, r, e)
			return
		}
		v.Enrollments, e = a.Store.C("enrollments").CountDocuments(r.Context(), bson.M{"tutorId": v.TutorID, "status": bson.M{"$in": []string{"pending_agreement", "awaiting_payment", "active", "paused"}}})
		if e != nil {
			a.error(w, r, e)
			return
		}
	}
	a.json(w, 200, p)
}

func (a *App) resolveTutorFollowup(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "admin") {
		return
	}
	var in struct {
		Version   int    `json:"version"`
		Reason    string `json:"reason"`
		Confirmed bool   `json:"confirmed"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	if !in.Confirmed || !validText(in.Reason, 10, 1000) {
		a.error(w, r, domain.Fail(422, "validation", "Confirm the follow-up and record its outcome."))
		return
	}
	id, e := url.PathUnescape(chi.URLParam(r, "id"))
	if e != nil {
		a.error(w, r, domain.Fail(422, "validation", "Invalid follow-up identifier."))
		return
	}
	e = a.Store.Tx(r.Context(), func(ctx context.Context) error {
		v, e := storage.One[domain.TutorFollowup](ctx, a.Store, "outbox", bson.M{"_id": id, "kind": "review_existing_arrangements"})
		if e != nil {
			return e
		}
		if v.Status != "pending_operator" || v.Version != in.Version {
			return domain.Fail(409, "stale", "This follow-up changed. Refresh to continue.")
		}
		if _, e = a.Store.C("outbox").UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"status": "resolved_operator", "resolution": clean(in.Reason)}, "$inc": bson.M{"version": 1}}); e != nil {
			return e
		}
		return a.staffAudit(ctx, user(r), "application.followup_resolved", v.TutorID, in.Reason, "", "", nil)
	})
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 200, map[string]bool{"ok": true})
}
