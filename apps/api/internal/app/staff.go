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
	staffprovision "tutorplatform/internal/staff"
	"tutorplatform/internal/storage"
)

func restrictedTutorRoute(path, id string) bool {
	if path == "/api/v1/applications/"+id+"/interview/join" {
		return true
	}
	if enum(path, "/api/v1/me", "/api/v1/dashboard", "/api/v1/application", "/api/v1/auth/logout") {
		return true
	}
	if enum(path, "/api/v1/integrations/google", "/api/v1/integrations/google/connect", "/api/integrations/google/callback", "/api/v1/integrations/google/disconnect", "/api/v1/integrations/google/revoke/retry") || strings.HasPrefix(path, "/api/v1/integrations/google/lessons") {
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
		f["assessorId"] = u.ID
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
		filters = append(filters, bson.M{"$or": []bson.M{{"profile.teachingAreas": bson.M{"$elemMatch": bson.M{"modes": mode}}}, {"profile": bson.M{"$exists": false}, "$or": []bson.M{{"scope.mode": mode}, {"scope.modes": mode}}}}})
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
	response := map[string]any{"application": v, "email": u.Email, "assessor": assessor}
	if v.Interview != nil && v.Interview.Provider == "google" {
		c, err := storage.One[googleConnection](r.Context(), a.Store, "google_connections", bson.M{"_id": v.Interview.MentorID})
		if err != nil && err != mongo.ErrNoDocuments {
			a.error(w, r, err)
			return
		}
		status := c.Status
		if status == "" {
			status = "disconnected"
		}
		response["googleConnection"] = map[string]any{"enabled": a.Google != nil, "status": status, "checkedAt": c.CheckedAt}
	}
	a.json(w, 200, response)
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
	for i := range p.Items {
		if p.Items[i].Status == "" {
			p.Items[i].Status = "active"
		}
	}
	a.json(w, 200, p)
}

type staffProvisionInput struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
	Reason   string `json:"reason"`
}

func (a *App) createStaffMember(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "admin") {
		return
	}
	var in staffProvisionInput
	if !a.decode(w, r, &in) {
		return
	}
	if e := a.rate(r.Context(), "staff-provision:"+user(r).ID, 8); e != nil {
		a.error(w, r, e)
		return
	}
	created, e := staffprovision.Provision(r.Context(), a.Store, staffprovision.Input{
		Name:     in.Name,
		Email:    in.Email,
		Password: in.Password,
		Role:     "mentor",
		Operator: user(r).ID,
		Reason:   in.Reason,
	})
	if e != nil {
		if mongo.IsDuplicateKeyError(e) {
			a.error(w, r, domain.Fail(409, "staff_account_exists", "A staff login already exists for that email."))
			return
		}
		a.error(w, r, e)
		return
	}
	a.json(w, 201, map[string]any{
		"member": domain.StaffMember{ID: created.ID, Name: created.Name, Role: created.Role, Status: created.Status},
		"email":  created.Email,
	})
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
	Assessment *struct {
		Scores         []int  `json:"scores"`
		Recommendation string `json:"recommendation"`
		Comments       string `json:"comments"`
		Conducted      bool   `json:"conducted"`
	} `json:"assessment"`
	Action     string            `json:"action"`
	Version    *int              `json:"version"`
	Reason     string            `json:"reason"`
	Subjects   []string          `json:"subjects"`
	MinClass   int               `json:"minClass"`
	MaxClass   int               `json:"maxClass"`
	Mode       string            `json:"mode"`
	Modes      []string          `json:"modes"`
	AssessorID string            `json:"assessorId"`
	Interview  *domain.Interview `json:"interview"`
	FeePlans   []domain.FeePlan  `json:"feePlans"`
}

func normalizeApprovedModes(modes []string) []string {
	seen := map[string]bool{}
	for _, mode := range modes {
		if mode == "online" || mode == "home" {
			seen[mode] = true
		}
	}
	out := []string{}
	for _, mode := range []string{"online", "home"} {
		if seen[mode] {
			out = append(out, mode)
		}
	}
	return out
}

func approvalModes(in staffDecisionInput, current domain.Scope) []string {
	if len(in.Modes) > 0 {
		return normalizeApprovedModes(in.Modes)
	}
	if in.Mode != "" {
		return normalizeApprovedModes([]string{in.Mode})
	}
	return current.ApprovedModes()
}

func approvedFeePlansComplete(a domain.Application) bool {
	if a.Fees == nil {
		return false
	}
	seen := map[string]bool{}
	for _, plan := range a.FeePlans() {
		seen[plan.Mode+":"+plan.Period] = true
	}
	for _, mode := range a.Scope.ApprovedModes() {
		if mode == "online" && !seen["online:hour"] {
			return false
		}
		if mode == "home" && (!seen["home:week"] || !seen["home:month"]) {
			return false
		}
	}
	return len(seen) > 0
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
			prefix := "google-calendar:"
			ids = append(ids, prefix+v.Interview.HostKey)
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
		event.Assessment = application.InterviewAssessment
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
	if user(r).Role == "admin" && !enum(in.Action, "assign", "suspend", "reinstate", "terminate", "reopen") {
		a.error(w, r, domain.Fail(403, "forbidden", "Only the assigned mentor handles interviews, fees and tutor approval."))
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
		if u.Role == "mentor" && v.AssessorID != u.ID {
			return domain.Fail(403, "forbidden", "Only the assigned reviewer can change this application.")
		}
		from := v.Status
		var previous *domain.Interview
		if v.Interview != nil {
			copy := *v.Interview
			previous = &copy
		}
		if previous != nil && previous.Provider == "google" && previous.SyncStatus != "ready" && in.Action != "fees" && !(previous.Provider == "google" && previous.SyncStatus == "failed" && enum(in.Action, "cancel_interview", "decline")) {
			return domain.Fail(409, "meeting_pending", "Finish or retry the meeting operation before changing this interview.")
		}
		needsReason := enum(in.Action, "decline", "assign", "reschedule", "cancel_interview", "no_show", "suspend", "reinstate", "terminate", "reopen")
		if needsReason && !validText(in.Reason, 10, 1000) {
			return domain.Fail(422, "validation", "Record a reason of 10–1000 characters.")
		}
		switch in.Action {
		case "fees":
			if !enum(v.Status, "submitted", "under_review", "assessment_scheduled", "assessed", "approved", "suspended") {
				return domain.Fail(409, "invalid_transition", "Set fees for a submitted application or existing tutor.")
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
		case "assign":
			if u.Role != "admin" || !enum(v.Status, "submitted", "under_review", "assessment_scheduled", "assessed") {
				return domain.Fail(403, "forbidden", "Only administrators can route pending applications to a mentor.")
			}
			if _, e = storage.One[domain.User](ctx, a.Store, "users", bson.M{"_id": in.AssessorID, "role": "mentor", "$or": activeStaffFilter()["$or"]}); e != nil {
				if e != mongo.ErrNoDocuments {
					return e
				}
				return domain.Fail(422, "validation", "Choose an active academic mentor.")
			}
			if e = a.reserveInterview(ctx, v, true); e != nil {
				return e
			}
			if v.Interview != nil {
				v.Interview.Status = "cancelled"
			}
			v.AssessorID = in.AssessorID
			v.Status = "submitted"
		case "schedule", "reschedule":
			if in.Action == "reschedule" && previous != nil && previous.Provider != "google" {
				return domain.Fail(409, "provider_retired", "Cancel the historical interview and schedule a new Google Meet interview.")
			}
			if !(in.Action == "schedule" && enum(v.Status, "submitted", "under_review", "assessed") || in.Action == "reschedule" && v.Status == "assessment_scheduled") {
				return domain.Fail(409, "invalid_transition", "This interview cannot be scheduled at this stage.")
			}
			if a.Google == nil || a.Config.InterviewProvider == "disabled" {
				return domain.Fail(503, "meeting_unconfigured", "Interview meetings are not configured.")
			}
			if !validInterviewTime(in.Interview, a.Now()) || a.Google != nil && !in.Interview.Start.After(a.Now()) || in.Interview.JoinURL != "" || !validText(in.Interview.Notes, 0, 1000) {
				return domain.Fail(422, "interview_validation", "Choose a future interview time and timezone; the meeting provider supplies the join link.")
			}
			if e = a.reserveInterview(ctx, v, true); e != nil {
				return e
			}
			v.Interview = &domain.Interview{Start: in.Interview.Start, End: in.Interview.End, Timezone: in.Interview.Timezone, Notes: clean(in.Interview.Notes), MentorName: u.Name}
			v.InterviewAssessment = nil
			v.Interview.Start = v.Interview.Start.UTC()
			v.Interview.End = v.Interview.End.UTC()
			v.Interview.Status = "scheduled"
			operation := "create"
			if in.Action == "reschedule" && previous != nil && previous.Provider == "google" {
				operation = "update"
				v.Interview.Provider = previous.Provider
				v.Interview.MentorID = previous.MentorID
				v.Interview.ETag = previous.ETag
				now := a.Now()
				v.Interview.RescheduledAt = &now
				v.Interview.MeetingID = previous.MeetingID
				v.Interview.HostKey = previous.HostKey
			}
			if e = a.queueGoogleInterview(ctx, &v, operation); e != nil {
				return e
			}
			if e = a.reserveInterview(ctx, v, false); e != nil {
				return e
			}
			v.Status = "assessment_scheduled"
		case "interview_assessment":
			if v.Status != "assessment_scheduled" || v.Interview == nil || v.Interview.SyncStatus != "ready" || a.Now().Before(v.Interview.Start) || v.Interview.Status != "scheduled" {
				return domain.Fail(409, "interview_pending", "Submit the assessment after conducting the confirmed interview.")
			}
			assessment := in.Assessment
			if assessment == nil || !assessment.Conducted || len(assessment.Scores) != 4 || !enum(assessment.Recommendation, "approve", "reject", "reinterview") || !validText(assessment.Comments, 10, 1000) {
				return domain.Fail(422, "assessment_validation", "Confirm the interview and enter four ratings, a recommendation and 10–1000 characters of feedback.")
			}
			for _, score := range assessment.Scores {
				if score < 1 || score > 5 {
					return domain.Fail(422, "assessment_validation", "Interview ratings must be from 1 to 5.")
				}
			}
			if e = a.reserveInterview(ctx, v, true); e != nil {
				return e
			}
			v.InterviewAssessment = &domain.InterviewAssessment{Scores: assessment.Scores, Recommendation: assessment.Recommendation, Comments: clean(assessment.Comments), MentorID: u.ID, SubmittedAt: a.Now()}
			v.Interview.Status = "completed"
			v.Status = "assessed"
			v.AssessmentAt = a.Now()
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
		case "decline":
			if !enum(v.Status, "submitted", "under_review", "assessment_scheduled", "assessed") {
				return domain.Fail(409, "invalid_transition", "Only pending applications can be rejected.")
			}
			if e = a.reserveInterview(ctx, v, true); e != nil {
				return e
			}
			if v.Interview != nil && v.Interview.Status == "scheduled" {
				v.Interview.Status = "cancelled"
			}
			v.Status = "declined"
			v.Reason = clean(in.Reason)
		case "approve":
			if !enum(v.Status, "assessment_scheduled", "assessed", "approved") {
				return domain.Fail(409, "invalid_transition", "Schedule the Google Meet interview before approving this tutor.")
			}
			if v.Status != "approved" || !v.Scope.ExpiresAt.After(a.Now()) {
				if v.Interview == nil || !enum(v.Interview.Status, "scheduled", "completed") || v.Interview.SyncStatus != "ready" || !validInterviewLink(v.Interview) || a.Now().Before(v.Interview.Start) {
					return domain.Fail(409, "interview_pending", "Approve after the confirmed interview starts.")
				}
				if v.Interview.Provider == "google" && (v.InterviewAssessment == nil || v.InterviewAssessment.Recommendation != "approve" || v.InterviewAssessment.MentorID != u.ID || v.Interview.Status != "completed") {
					return domain.Fail(409, "assessment_required", "Submit an approval recommendation after conducting the Google Meet interview.")
				}
				if v.Status == "approved" && !v.Interview.Start.After(v.Scope.ExpiresAt) {
					return domain.Fail(409, "invalid_transition", "Schedule a new interview to renew an expired approval.")
				}
			}
			if in.MinClass < 1 || in.MaxClass > 12 || in.MinClass > in.MaxClass {
				return domain.Fail(422, "validation", "Approved classes must be within 1-12.")
			}
			selectedModes := approvalModes(in, v.Scope)
			subjects := in.Subjects
			if len(subjects) == 0 {
				subjects = v.Scope.ApprovedSubjects()
			}
			seenSubjects := map[string]bool{}
			for _, subject := range subjects {
				if !domain.ValidSubject(subject) || seenSubjects[subject] {
					return domain.Fail(422, "validation", "Choose unique teaching subjects.")
				}
				seenSubjects[subject] = true
			}
			if len(subjects) > 6 || len(subjects) == 0 || seenSubjects[domain.AllSubjects] && in.MaxClass > 5 {
				return domain.Fail(422, "validation", "All Subjects approval is limited to Classes 1–5.")
			}
			if v.Profile != nil {
				var area domain.RequestedTeachingArea
				for _, subject := range subjects {
					var ok bool
					area, ok = v.Profile.RequestedArea(subject, in.MinClass, in.MaxClass, selectedModes)
					if !ok {
						return domain.Fail(409, "requested_scope", "Approve only requested subject/class/mode combinations.")
					}
				}
				if len(area.Languages) > 0 {
					v.Language = area.Languages[0]
				}
				if v.Profile.About.DisplayName != "" {
					v.Name = v.Profile.About.DisplayName
				}
			} else {
				if len(selectedModes) == 0 {
					selectedModes = normalizeApprovedModes([]string{v.Scope.Mode})
				}
				for _, mode := range selectedModes {
					if !enum(mode, "home", "online") {
						return domain.Fail(422, "validation", "Choose an approved teaching mode.")
					}
				}
			}
			if len(selectedModes) == 0 {
				return domain.Fail(422, "validation", "Choose an approved teaching mode.")
			}
			v.Scope.Subject = subjects[0]
			v.Scope.Subjects = subjects
			v.Scope.Mode = selectedModes[0]
			v.Scope.Modes = selectedModes
			if !approvedFeePlansComplete(v) {
				return domain.Fail(409, "fees_pending", "Finalize the tutor's fees before approval.")
			}
			if v.Interview != nil && v.Interview.Status == "scheduled" {
				if e = a.reserveInterview(ctx, v, true); e != nil {
					return e
				}
				v.Interview.Status = "completed"
			}
			if v.Status != "approved" {
				v.AssessmentAt = a.Now()
			}
			v.MentorID = u.ID
			v.Scope.MinClass = in.MinClass
			v.Scope.MaxClass = in.MaxClass
			v.Scope.ExpiresAt = a.Now().AddDate(0, 6, 0)
			v.Status = "approved"
			v.Reason = ""
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
				mentor, err := a.nextApplicationMentor(ctx)
				if err != nil {
					return err
				}
				v.AssessorID = mentor.ID
				v.ConflictClear = false
				v.Scores = nil
				v.Evidence = ""
				v.InterviewAssessment = nil
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
		default:
			return domain.Fail(422, "validation", "Unknown staff action.")
		}
		if previous != nil && previous.Provider != "google" && v.Interview != nil && v.Interview.Status == "cancelled" {
			v.Interview.JoinURL = ""
			v.Interview.SyncStatus = "ready"
		}
		if previous != nil && previous.Provider == "google" && previous.Status == "scheduled" && v.Interview != nil && v.Interview.Status == "cancelled" {
			if e = a.queueGoogleInterview(ctx, &v, "delete"); e != nil {
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
