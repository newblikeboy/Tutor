package app

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"math"
	"sort"

	"go.mongodb.org/mongo-driver/v2/bson"
	"tutorplatform/internal/domain"
)

const tutorPageSize = 100

type tutorCursor struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	Distance *float64 `json:"distance,omitempty"`
}

func tutorPosition(v domain.PublicTutor) tutorCursor {
	return tutorCursor{ID: v.ID, Name: v.Name, Distance: v.DistanceKM}
}

// A total ordering keeps equal names/distances stable across pages. Located
// tutors precede those without a distance when a location is supplied.
func tutorBefore(a, b tutorCursor) bool {
	if a.Distance != nil && b.Distance == nil {
		return true
	}
	if a.Distance == nil && b.Distance != nil {
		return false
	}
	if a.Distance != nil && b.Distance != nil && *a.Distance != *b.Distance {
		return *a.Distance < *b.Distance
	}
	if a.Name != b.Name {
		return a.Name < b.Name
	}
	return a.ID < b.ID
}

func (a *App) tutorPage(ctx context.Context, filter bson.M, cursor string, located bool, latitude, longitude, radius float64) ([]domain.PublicTutor, string, error) {
	var after tutorCursor
	if cursor != "" {
		if len(cursor) > 2048 {
			return nil, "", domain.Fail(422, "validation", "Invalid tutor page cursor.")
		}
		raw, err := base64.RawURLEncoding.DecodeString(cursor)
		if err != nil || json.Unmarshal(raw, &after) != nil || after.ID == "" || len(after.ID) > 200 || len(after.Name) > 500 || after.Distance != nil && (!located || math.IsNaN(*after.Distance) || math.IsInf(*after.Distance, 0) || *after.Distance < 0) {
			return nil, "", domain.Fail(422, "validation", "Invalid tutor page cursor.")
		}
	}
	pipeline := bson.A{
		bson.M{"$match": filter},
		bson.M{"$lookup": bson.M{"from": "availability", "localField": "_id", "foreignField": "_id", "as": "searchAvailability"}},
		bson.M{"$match": bson.M{"searchAvailability.paused": bson.M{"$ne": true}}},
		bson.M{"$project": bson.M{"name": 1, "scope": 1, "language": 1, "experience": 1, "assessmentAt": 1, "approach": 1, "sample": 1, "fees": 1, "profile.about.locality": 1, "profile.about.location": 1, "profile.about.photoFileId": 1, "profile.availability.home.travelKm": 1, "profile.approach.demoFileId": 1}},
	}
	if !located {
		if cursor != "" {
			pipeline = append(pipeline, bson.M{"$match": bson.M{"$or": bson.A{bson.M{"name": bson.M{"$gt": after.Name}}, bson.M{"name": after.Name, "_id": bson.M{"$gt": after.ID}}}}})
		}
		pipeline = append(pipeline, bson.M{"$sort": bson.D{{Key: "name", Value: 1}, {Key: "_id", Value: 1}}}, bson.M{"$limit": tutorPageSize + 1})
	}
	cur, err := a.Store.C("applications").Aggregate(ctx, pipeline)
	if err != nil {
		return nil, "", err
	}
	defer cur.Close(ctx)
	out := []domain.PublicTutor{}
	for cur.Next(ctx) {
		var v domain.Application
		if err = cur.Decode(&v); err != nil {
			return nil, "", err
		}
		public := v.Public()
		if located && v.Scope.HasMode("home") {
			location, ok := tutorBaseLocation(v)
			if !ok || public.ServiceRadiusKM <= 0 {
				continue
			}
			distance := haversineKM(latitude, longitude, location.Latitude, location.Longitude)
			if distance > float64(public.ServiceRadiusKM) || radius > 0 && distance > radius {
				continue
			}
			rounded := math.Round(distance*10) / 10
			public.DistanceKM = &rounded
		}
		if cursor != "" && !tutorBefore(after, tutorPosition(public)) {
			continue
		}
		// Geographic filtering currently uses the established service-radius logic.
		// Stream candidates and retain only this page, not every application profile.
		at := sort.Search(len(out), func(i int) bool { return tutorBefore(tutorPosition(public), tutorPosition(out[i])) })
		if at > tutorPageSize {
			continue
		}
		out = append(out, domain.PublicTutor{})
		copy(out[at+1:], out[at:])
		out[at] = public
		if len(out) > tutorPageSize+1 {
			out = out[:tutorPageSize+1]
		}
	}
	if err = cur.Err(); err != nil {
		return nil, "", err
	}
	next := ""
	if len(out) > tutorPageSize {
		out = out[:tutorPageSize]
		raw, err := json.Marshal(tutorPosition(out[len(out)-1]))
		if err != nil {
			return nil, "", err
		}
		next = base64.RawURLEncoding.EncodeToString(raw)
	}
	return out, next, nil
}
