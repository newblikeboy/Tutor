package app

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
)

type staffActionInput struct {
	Action string `json:"action"`
	Reason string `json:"reason"`
}

func activeStaffFilter() bson.M {
	return bson.M{"$or": []bson.M{{"status": bson.M{"$exists": false}}, {"status": ""}, {"status": "active"}}}
}

func (a *App) staffMemberAction(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "admin") {
		return
	}
	var in staffActionInput
	if !a.decode(w, r, &in) {
		return
	}
	if !enum(in.Action, "activate", "suspend", "deactivate", "delete") || !validText(in.Reason, 10, 1000) {
		a.error(w, r, domain.Fail(422, "validation", "Choose a mentor action and record a reason."))
		return
	}
	next := map[string]string{"activate": "active", "suspend": "suspended", "deactivate": "deactivated", "delete": "deactivated"}[in.Action]
	id := chi.URLParam(r, "id")
	e := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		v, e := storage.One[domain.User](ctx, a.Store, "users", bson.M{"_id": id, "role": "mentor"})
		if e != nil {
			return e
		}
		if v.Status == "" {
			v.Status = "active"
		}
		if v.Status == next {
			return nil
		}
		result, e := a.Store.C("users").UpdateOne(ctx, bson.M{"_id": id, "role": "mentor"}, bson.M{"$set": bson.M{"status": next}, "$inc": bson.M{"authVersion": 1}})
		if e != nil {
			return e
		}
		if result.MatchedCount != 1 {
			return domain.Fail(404, "not_found", "This mentor is unavailable.")
		}
		if _, e = a.Store.C("sessions").DeleteMany(ctx, bson.M{"userId": id}); e != nil {
			return e
		}
		return a.staffAudit(ctx, user(r), "staff.mentor_"+in.Action, id, in.Reason, v.Status, next, nil)
	})
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 200, map[string]bool{"ok": true})
}

func (a *App) founderReport(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "admin") {
		return
	}
	ctx := r.Context()
	metrics := map[string]int64{}
	var e error
	for name, filter := range map[string]bson.M{
		"parents":          {"role": "parent"},
		"learners":         {},
		"approvedTutors":   {"status": "approved", "scope.expiresAt": bson.M{"$gt": a.Now()}},
		"onboardingTutors": {"status": bson.M{"$in": []string{"submitted", "under_review", "assessment_scheduled", "assessed", "improvement_required"}}},
		"activeMentors":    {"role": "mentor", "$or": activeStaffFilter()["$or"]},
	} {
		collection := "applications"
		if name == "parents" || name == "activeMentors" {
			collection = "users"
		} else if name == "learners" {
			collection = "learners"
		}
		metrics[name], e = a.Store.C(collection).CountDocuments(ctx, filter)
		if e != nil {
			a.error(w, r, e)
			return
		}
	}
	enrollmentStatus, e := a.countBy(ctx, "enrollments", bson.M{}, "status")
	if e != nil {
		a.error(w, r, e)
		return
	}
	metrics["paidEnrollments"] = enrollmentStatus["active"] + enrollmentStatus["completed"]
	metrics["unpaidEnrollments"] = enrollmentStatus["pending_agreement"] + enrollmentStatus["awaiting_payment"] + enrollmentStatus["expired"]
	enrolledParents, e := a.distinctCount(ctx, "enrollments", bson.M{"status": bson.M{"$nin": []string{"cancelled", "expired"}}}, "ownerId")
	if e != nil {
		a.error(w, r, e)
		return
	}
	metrics["notEnrolledParents"] = metrics["parents"] - enrolledParents
	if metrics["notEnrolledParents"] < 0 {
		metrics["notEnrolledParents"] = 0
	}
	tutorStatus, e := a.countBy(ctx, "applications", bson.M{"status": bson.M{"$ne": "draft"}}, "status")
	if e != nil {
		a.error(w, r, e)
		return
	}
	mentorStatus, e := a.mentorStatusCounts(ctx)
	if e != nil {
		a.error(w, r, e)
		return
	}
	revenue, e := a.revenue(ctx)
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 200, domain.FounderReport{Metrics: metrics, TutorStatus: tutorStatus, MentorStatus: mentorStatus, EnrollmentStatus: enrollmentStatus, Revenue: revenue})
}

func (a *App) adminFamilies(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "admin") {
		return
	}
	page, e := pageRecords[domain.User](r.Context(), a.Store, "users", bson.M{"role": "parent"}, r.URL.Query().Get("cursor"))
	if e != nil {
		a.error(w, r, e)
		return
	}
	out := recordPage[domain.AdminFamily]{NextCursor: page.NextCursor, Items: []domain.AdminFamily{}}
	for _, parent := range page.Items {
		learners, e := storage.Many[domain.Learner](r.Context(), a.Store, "learners", bson.M{"ownerId": parent.ID})
		if e != nil {
			a.error(w, r, e)
			return
		}
		enrollments, e := a.countBy(r.Context(), "enrollments", bson.M{"ownerId": parent.ID}, "status")
		if e != nil {
			a.error(w, r, e)
			return
		}
		out.Items = append(out.Items, domain.AdminFamily{
			ParentID:          parent.ID,
			ParentName:        parent.Name,
			ParentEmail:       parent.Email,
			Sample:            parent.Sample,
			Learners:          learners,
			EnrollmentStatus:  enrollments,
			PaidEnrollments:   enrollments["active"] + enrollments["completed"],
			UnpaidEnrollments: enrollments["pending_agreement"] + enrollments["awaiting_payment"] + enrollments["expired"],
		})
	}
	a.json(w, 200, out)
}

func (a *App) distinctCount(ctx context.Context, collection string, filter bson.M, field string) (int64, error) {
	cur, e := a.Store.C(collection).Aggregate(ctx, bson.A{
		bson.M{"$match": filter},
		bson.M{"$group": bson.M{"_id": "$" + field}},
		bson.M{"$count": "count"},
	})
	if e != nil {
		return 0, e
	}
	defer cur.Close(ctx)
	var rows []struct {
		Count int64 `bson:"count"`
	}
	if e = cur.All(ctx, &rows); e != nil || len(rows) == 0 {
		return 0, e
	}
	return rows[0].Count, nil
}

func (a *App) countBy(ctx context.Context, collection string, filter bson.M, field string) (map[string]int64, error) {
	cur, e := a.Store.C(collection).Aggregate(ctx, bson.A{
		bson.M{"$match": filter},
		bson.M{"$group": bson.M{"_id": "$" + field, "count": bson.M{"$sum": 1}}},
	})
	if e != nil {
		return nil, e
	}
	defer cur.Close(ctx)
	var rows []struct {
		ID    string `bson:"_id"`
		Count int64  `bson:"count"`
	}
	if e = cur.All(ctx, &rows); e != nil {
		return nil, e
	}
	out := map[string]int64{}
	for _, row := range rows {
		out[row.ID] = row.Count
	}
	return out, nil
}

func (a *App) mentorStatusCounts(ctx context.Context) (map[string]int64, error) {
	cur, e := a.Store.C("users").Aggregate(ctx, bson.A{
		bson.M{"$match": bson.M{"role": "mentor"}},
		bson.M{"$project": bson.M{"status": bson.M{"$cond": bson.A{bson.M{"$in": bson.A{"$status", bson.A{"", nil}}}, "active", "$status"}}}},
		bson.M{"$group": bson.M{"_id": "$status", "count": bson.M{"$sum": 1}}},
	})
	if e != nil {
		return nil, e
	}
	defer cur.Close(ctx)
	var rows []struct {
		ID    string `bson:"_id"`
		Count int64  `bson:"count"`
	}
	if e = cur.All(ctx, &rows); e != nil {
		return nil, e
	}
	out := map[string]int64{"active": 0, "suspended": 0, "deactivated": 0}
	for _, row := range rows {
		out[row.ID] = row.Count
	}
	return out, nil
}

func (a *App) revenue(ctx context.Context) (domain.FounderRevenue, error) {
	cur, e := a.Store.C("payment_intents").Find(ctx, bson.M{"state": bson.M{"$in": []string{"captured", "refund_review"}}}, options.Find().SetProjection(bson.M{"amountPaise": 1, "refundedPaise": 1}))
	if e != nil {
		return domain.FounderRevenue{}, e
	}
	defer cur.Close(ctx)
	var rows []domain.PaymentIntent
	if e = cur.All(ctx, &rows); e != nil {
		return domain.FounderRevenue{}, e
	}
	out := domain.FounderRevenue{}
	for _, row := range rows {
		out.GrossPaise += row.Amount
		out.RefundedPaise += row.Refunded
	}
	out.NetPaise = out.GrossPaise - out.RefundedPaise
	return out, nil
}
