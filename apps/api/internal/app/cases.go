package app

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"net/http"
	"regexp"
	"slices"
	"strings"
	"time"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
)

func caseFilter(u domain.User) bson.M {
	own := bson.M{"ownerId": u.ID}
	if u.Role == "admin" {
		return bson.M{"$or": []bson.M{own, {"assignedTo": u.ID}, {"assignedTo": ""}}}
	}
	if u.Role == "support" {
		return bson.M{"$or": []bson.M{own, {"kind": bson.M{"$ne": "safeguarding"}, "assignedTo": bson.M{"$in": []string{"", u.ID}}}}}
	}
	return own
}
func caseView(v domain.ServiceCase, u domain.User) domain.ServiceCase {
	v.Restricted = v.OwnerID != u.ID && v.AssignedTo != u.ID
	v.CanReply = !v.Restricted && v.Status != "resolved"
	v.CanManage = v.AssignedTo == u.ID && enum(u.Role, "admin", "support")
	v.CanClaim = v.OwnerID != u.ID && v.AssignedTo == "" && v.Status != "resolved" && (u.Role == "admin" || u.Role == "support" && v.Kind != "safeguarding")
	v.CanReopen = v.OwnerID == u.ID && v.Status == "resolved"
	if v.Restricted {
		v.Title = ""
		v.Body = ""
	}
	return v
}
func (a *App) cases(w http.ResponseWriter, r *http.Request) {
	u := user(r)
	status, kind := r.URL.Query().Get("status"), r.URL.Query().Get("kind")
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if !enum(status, "", "all", "active", "waiting_family", "resolved") || !enum(kind, "", "support", "matching", "privacy_access", "privacy_correction", "privacy_deletion", "safeguarding") || len([]rune(query)) > 120 {
		a.error(w, r, domain.Fail(422, "validation", "Choose valid ticket filters and a search of at most 120 characters."))
		return
	}
	filters := []bson.M{caseFilter(u)}
	if kind != "" {
		filters = append(filters, bson.M{"kind": kind})
	}
	if query != "" {
		text := bson.M{"$regex": regexp.QuoteMeta(query), "$options": "i"}
		// A queue search must not reveal whether redacted titles match private text.
		filters = append(filters, bson.M{"$or": []bson.M{{"_id": text}, {"$and": []bson.M{{"$or": []bson.M{{"ownerId": u.ID}, {"assignedTo": u.ID}}}, {"title": text}}}}})
	}
	pageFilter := bson.M{}
	switch status {
	case "active":
		pageFilter["status"] = bson.M{"$ne": "resolved"}
	case "waiting_family", "resolved":
		pageFilter["status"] = status
	}
	type position struct {
		UpdatedAt time.Time `json:"updatedAt"`
		ID        string    `json:"id"`
	}
	if cursor := r.URL.Query().Get("cursor"); cursor != "" {
		if len(cursor) > 512 {
			a.error(w, r, domain.Fail(422, "validation", "Invalid ticket page cursor."))
			return
		}
		var p position
		decoded, err := base64.RawURLEncoding.DecodeString(cursor)
		if err != nil || json.Unmarshal(decoded, &p) != nil || p.UpdatedAt.IsZero() || p.ID == "" || len(p.ID) > 200 {
			a.error(w, r, domain.Fail(422, "validation", "Invalid ticket page cursor."))
			return
		}
		pageFilter["$or"] = []bson.M{{"updatedAt": bson.M{"$lt": p.UpdatedAt}}, {"updatedAt": p.UpdatedAt, "_id": bson.M{"$lt": p.ID}}}
	}
	cur, err := a.Store.C("cases").Aggregate(r.Context(), mongo.Pipeline{
		{{Key: "$match", Value: bson.M{"$and": filters}}},
		{{Key: "$facet", Value: bson.M{
			"counts": bson.A{bson.M{"$group": bson.M{"_id": "$status", "count": bson.M{"$sum": 1}}}},
			"items":  bson.A{bson.M{"$match": pageFilter}, bson.M{"$sort": bson.D{{Key: "updatedAt", Value: -1}, {Key: "_id", Value: -1}}}, bson.M{"$limit": 26}},
		}}},
	})
	if err != nil {
		a.error(w, r, err)
		return
	}
	defer cur.Close(r.Context())
	var rows []struct {
		Items  []domain.ServiceCase `bson:"items"`
		Counts []struct {
			Status string `bson:"_id"`
			Count  int64  `bson:"count"`
		} `bson:"counts"`
	}
	if err = cur.All(r.Context(), &rows); err != nil {
		a.error(w, r, err)
		return
	}
	p := recordPage[domain.ServiceCase]{Items: []domain.ServiceCase{}}
	counts := map[string]int64{"all": 0, "active": 0, "waiting_family": 0, "resolved": 0}
	if len(rows) > 0 {
		p.Items = rows[0].Items
		for _, count := range rows[0].Counts {
			counts["all"] += count.Count
			if count.Status != "resolved" {
				counts["active"] += count.Count
			}
			if count.Status == "waiting_family" || count.Status == "resolved" {
				counts[count.Status] += count.Count
			}
		}
	}
	if len(p.Items) > 25 {
		p.Items = p.Items[:25]
		last := p.Items[24]
		encoded, _ := json.Marshal(position{UpdatedAt: last.UpdatedAt, ID: last.ID})
		p.NextCursor = base64.RawURLEncoding.EncodeToString(encoded)
	}
	for i, v := range p.Items {
		p.Items[i] = caseView(v, u)
	}
	a.json(w, 200, struct {
		recordPage[domain.ServiceCase]
		Counts map[string]int64 `json:"counts"`
	}{p, counts})
}
func (a *App) createCase(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Kind  string `json:"kind"`
		Title string `json:"title"`
		Body  string `json:"body"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	if !enum(in.Kind, "support", "matching", "privacy_access", "privacy_correction", "privacy_deletion", "safeguarding") || !validText(in.Title, 5, 120) || !validText(in.Body, 10, 3000) {
		a.error(w, r, domain.Fail(422, "validation", "Select a request type and explain the concern."))
		return
	}
	u := user(r)
	if e := a.rate(r.Context(), "case:"+u.ID, 8); e != nil {
		a.error(w, r, e)
		return
	}
	id := a.chronologicalID()
	var v domain.ServiceCase
	e := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		prior, fp, er := a.receipt(ctx, "case:"+u.ID, r.Header.Get("Idempotency-Key"), in)
		if er != nil {
			return er
		}
		if prior != "" {
			v, er = storage.One[domain.ServiceCase](ctx, a.Store, "cases", bson.M{"_id": prior, "ownerId": u.ID})
			return er
		}
		v = domain.ServiceCase{ID: id, OwnerID: u.ID, Kind: in.Kind, Title: clean(in.Title), Body: clean(in.Body), Status: "open", Version: 1, CreatedAt: a.Now(), UpdatedAt: a.Now()}
		if _, er = a.Store.C("cases").InsertOne(ctx, v); er != nil {
			return er
		}
		if er = a.saveReceipt(ctx, "case:"+u.ID, r.Header.Get("Idempotency-Key"), fp, id); er != nil {
			return er
		}
		return a.audit(ctx, u.ID, "case.created", id)
	})
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 201, caseView(v, u))
}
func (a *App) caseDetail(w http.ResponseWriter, r *http.Request) {
	f := caseFilter(user(r))
	f["_id"] = chi.URLParam(r, "id")
	v, e := storage.One[domain.ServiceCase](r.Context(), a.Store, "cases", f)
	if e != nil {
		a.error(w, r, e)
		return
	}
	view := caseView(v, user(r))
	p := recordPage[domain.CaseMessage]{Items: []domain.CaseMessage{}}
	if !view.Restricted {
		p, e = a.caseMessages(r.Context(), v, r.URL.Query().Get("cursor"))
		if e != nil {
			a.error(w, r, e)
			return
		}
	}
	a.json(w, 200, map[string]any{"case": view, "messages": p})
}

func (a *App) caseMessages(ctx context.Context, v domain.ServiceCase, cursor string) (recordPage[domain.CaseMessage], error) {
	p := recordPage[domain.CaseMessage]{Items: []domain.CaseMessage{}}
	if len(cursor) > 200 {
		return p, domain.Fail(422, "validation", "Invalid conversation cursor.")
	}
	f := bson.M{"caseId": v.ID}
	if cursor != "" {
		f["_id"] = bson.M{"$lt": cursor}
	}
	cur, err := a.Store.C("case_messages").Find(ctx, f, options.Find().SetSort(bson.D{{Key: "_id", Value: -1}}).SetLimit(26))
	if err != nil {
		return p, err
	}
	defer cur.Close(ctx)
	if err = cur.All(ctx, &p.Items); err != nil {
		return p, err
	}
	if len(p.Items) > 25 {
		p.Items = p.Items[:25]
		p.NextCursor = p.Items[24].ID
	}
	for i := range p.Items {
		p.Items[i].FromRequester = p.Items[i].AuthorID == v.OwnerID
	}
	slices.Reverse(p.Items)
	return p, nil
}
func (a *App) caseAction(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Action  string `json:"action"`
		Version int    `json:"version"`
		Body    string `json:"body"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	u := user(r)
	id := a.chronologicalID()
	e := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		f := caseFilter(u)
		f["_id"] = chi.URLParam(r, "id")
		v, er := storage.One[domain.ServiceCase](ctx, a.Store, "cases", f)
		if er != nil {
			return er
		}
		if v.Version != in.Version {
			return domain.Fail(409, "stale_version", "This request changed. Reload before replying.")
		}
		view := caseView(v, u)
		switch in.Action {
		case "claim":
			if !enum(u.Role, "admin", "support") || v.AssignedTo != "" || v.Status == "resolved" || v.OwnerID == u.ID || v.Kind == "safeguarding" && u.Role != "admin" {
				return domain.Fail(403, "forbidden", "A permitted independent operator must claim this request.")
			}
			v.AssignedTo = u.ID
			v.Status = "assigned"
		case "reply":
			if !view.CanReply || !validText(in.Body, 5, 3000) {
				return domain.Fail(403, "forbidden", "Only the requester and assigned operator can reply to an open request.")
			}
			if v.OwnerID == u.ID && v.Status == "waiting_family" {
				v.Status = "open"
				if v.AssignedTo != "" {
					v.Status = "assigned"
				}
			}
		case "resolve", "waiting_family", "reopen":
			if !validText(in.Body, 10, 3000) || view.Restricted {
				return domain.Fail(422, "validation", "Record a decision and supporting explanation.")
			}
			if in.Action == "reopen" {
				if v.Status != "resolved" || v.OwnerID != u.ID {
					return domain.Fail(403, "forbidden", "The requester can reopen a resolved request.")
				}
				v.Status = "open"
			} else {
				if !view.CanManage || v.Status == "resolved" {
					return domain.Fail(403, "forbidden", "The assigned operator must record this decision.")
				}
				if in.Action == "resolve" {
					v.Status = "resolved"
				} else {
					v.Status = "waiting_family"
				}
			}
		default:
			return domain.Fail(422, "validation", "Unknown case action.")
		}
		if in.Action != "claim" {
			message := domain.CaseMessage{ID: id, CaseID: v.ID, AuthorID: u.ID, AuthorName: u.Name, AuthorRole: u.Role, Body: clean(in.Body), CreatedAt: a.Now(), Action: in.Action}
			if _, er = a.Store.C("case_messages").InsertOne(ctx, message); er != nil {
				return er
			}
		}
		v.Version++
		v.UpdatedAt = a.Now()
		if _, er = a.Store.C("cases").ReplaceOne(ctx, bson.M{"_id": v.ID}, v); er != nil {
			return er
		}
		for _, recipient := range []string{v.OwnerID, v.AssignedTo} {
			if recipient != "" && recipient != u.ID {
				if _, er = a.Store.C("notifications").InsertOne(ctx, domain.Notification{ID: id + ":" + recipient, OwnerID: recipient, Kind: "case_update", TargetID: v.ID, CreatedAt: a.Now()}); er != nil {
					return er
				}
			}
		}
		return a.audit(ctx, u.ID, "case."+in.Action, v.ID)
	})
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 200, map[string]bool{"ok": true})
}
