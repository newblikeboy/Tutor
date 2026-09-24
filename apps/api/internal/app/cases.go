package app

import (
	"context"
	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"net/http"
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
	if v.Restricted {
		v.Title = ""
		v.Body = ""
	}
	return v
}
func (a *App) cases(w http.ResponseWriter, r *http.Request) {
	p, e := pageRecords[domain.ServiceCase](r.Context(), a.Store, "cases", caseFilter(user(r)), r.URL.Query().Get("cursor"))
	if e != nil {
		a.error(w, r, e)
		return
	}
	for i, v := range p.Items {
		p.Items[i] = caseView(v, user(r))
	}
	a.json(w, 200, p)
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
		p, e = pageRecords[domain.CaseMessage](r.Context(), a.Store, "case_messages", bson.M{"caseId": v.ID}, r.URL.Query().Get("cursor"))
		if e != nil {
			a.error(w, r, e)
			return
		}
	}
	a.json(w, 200, map[string]any{"case": view, "messages": p})
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
			message := domain.CaseMessage{ID: id, CaseID: v.ID, AuthorID: u.ID, AuthorName: u.Name, AuthorRole: u.Role, Body: clean(in.Body), CreatedAt: a.Now()}
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
