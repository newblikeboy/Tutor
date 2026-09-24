package app

import (
	"context"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"sort"
	"strings"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
)

const applicationFilePrefix = "application-file_"

// Application evidence is bounded within its application. Existing standalone
// file records remain readable; provider migration never deletes evidence.
func (a *App) privateFile(ctx context.Context, id string) (domain.PrivateFile, error) {
	if !strings.HasPrefix(id, applicationFilePrefix) {
		return storage.One[domain.PrivateFile](ctx, a.Store, "files", bson.M{"_id": id, "status": bson.M{"$ne": "archived"}})
	}
	v, e := storage.One[domain.Application](ctx, a.Store, "applications", bson.M{"attachments._id": id})
	if e != nil {
		return domain.PrivateFile{}, e
	}
	for _, f := range v.Attachments {
		if f.ID == id && f.Status != "archived" {
			return f, nil
		}
	}
	return domain.PrivateFile{}, mongo.ErrNoDocuments
}
func (a *App) insertPrivateFile(ctx context.Context, f domain.PrivateFile) error {
	if f.TargetKind != "application" {
		_, e := a.Store.C("files").InsertOne(ctx, f)
		return e
	}
	result, e := a.Store.C("applications").UpdateOne(ctx, bson.M{"_id": f.TargetID, "$expr": bson.M{"$lt": bson.A{bson.M{"$size": bson.M{"$ifNull": bson.A{"$attachments", bson.A{}}}}, 20}}}, bson.M{"$push": bson.M{"attachments": f}})
	if e != nil {
		return e
	}
	if result.ModifiedCount != 1 {
		return domain.Fail(409, "file_quota", "Application attachment allowance is reached. Contact support.")
	}
	return nil
}
func (a *App) updatePrivateFile(ctx context.Context, id, state string, fields bson.M) (bool, error) {
	if !strings.HasPrefix(id, applicationFilePrefix) {
		r, e := a.Store.C("files").UpdateOne(ctx, bson.M{"_id": id, "status": state}, bson.M{"$set": fields})
		if e != nil {
			return false, e
		}
		return r.ModifiedCount == 1, nil
	}
	set := bson.M{}
	for k, v := range fields {
		set["attachments.$."+k] = v
	}
	r, e := a.Store.C("applications").UpdateOne(ctx, bson.M{"attachments": bson.M{"$elemMatch": bson.M{"_id": id, "status": state}}}, bson.M{"$set": set})
	if e != nil {
		return false, e
	}
	return r.ModifiedCount == 1, nil
}
func (a *App) applicationFilePage(ctx context.Context, id, cursor string) (recordPage[domain.PrivateFile], error) {
	legacy, e := pageRecords[domain.PrivateFile](ctx, a.Store, "files", bson.M{"targetKind": "application", "targetId": id, "status": bson.M{"$ne": "archived"}}, cursor)
	if e != nil {
		return legacy, e
	}
	v, e := storage.One[domain.Application](ctx, a.Store, "applications", bson.M{"_id": id})
	if e != nil {
		return legacy, e
	}
	rows := legacy.Items
	for _, f := range v.Attachments {
		if f.Status != "archived" && f.ID > cursor {
			rows = append(rows, f)
		}
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i].ID < rows[j].ID })
	p := recordPage[domain.PrivateFile]{Items: rows}
	if len(rows) > 25 {
		p.Items = rows[:25]
		p.NextCursor = p.Items[24].ID
	} else if legacy.NextCursor != "" {
		p.NextCursor = legacy.NextCursor
	}
	return p, nil
}
