package app

import (
	"context"
	"errors"
	"net/http"
	"sort"
	"strings"
	"time"
	_ "time/tzdata"

	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
)

func defaultAvailability(id string) domain.Availability {
	return domain.Availability{ID: id, Timezone: "Asia/Kolkata", Windows: []domain.WeeklyWindow{}, LeaveDates: []string{}, DailyCapacity: 6}
}
func (a *App) availability(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		if !a.role(w, r, "tutor") {
			return
		}
		id = user(r).ID
	}
	if chi.URLParam(r, "id") != "" {
		f := bson.M{"_id": id, "status": "approved", "scope.expiresAt": bson.M{"$gt": a.Now()}}
		if a.Config.Env == "production" {
			f["sample"] = false
		}
		if _, e := storage.One[domain.Application](r.Context(), a.Store, "applications", f); e != nil {
			a.error(w, r, e)
			return
		}
	}
	v, e := storage.One[domain.Availability](r.Context(), a.Store, "availability", bson.M{"_id": id})
	if errors.Is(e, mongo.ErrNoDocuments) {
		v = defaultAvailability(id)
		e = nil
	}
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 200, v)
}
func (a *App) saveAvailability(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "tutor") {
		return
	}
	var in domain.Availability
	if !a.decode(w, r, &in) {
		return
	}
	loc, e := time.LoadLocation(in.Timezone)
	if e != nil || loc == time.Local || len(in.Windows) > 21 || len(in.LeaveDates) > 60 || in.BufferMinutes < 0 || in.BufferMinutes > 90 || in.DailyCapacity < 1 || in.DailyCapacity > 12 || in.FeePaise < 0 || (in.FeePaise > 0 && in.FeePaise < 100) || in.FeePaise > 10000000 {
		a.error(w, r, domain.Fail(422, "validation", "Check your timezone, availability, capacity and fee."))
		return
	}
	if in.Windows == nil {
		in.Windows = []domain.WeeklyWindow{}
	}
	if in.LeaveDates == nil {
		in.LeaveDates = []string{}
	}
	sort.Slice(in.Windows, func(i, j int) bool {
		if in.Windows[i].Day == in.Windows[j].Day {
			return in.Windows[i].StartMinute < in.Windows[j].StartMinute
		}
		return in.Windows[i].Day < in.Windows[j].Day
	})
	for i, v := range in.Windows {
		if v.Day < 0 || v.Day > 6 || v.StartMinute < 0 || v.EndMinute > 1440 || v.EndMinute-v.StartMinute < 30 || (i > 0 && in.Windows[i-1].Day == v.Day && in.Windows[i-1].EndMinute > v.StartMinute) {
			a.error(w, r, domain.Fail(422, "validation", "Use non-overlapping availability windows of at least 30 minutes."))
			return
		}
	}
	for _, date := range in.LeaveDates {
		if _, e = time.Parse("2006-01-02", date); e != nil {
			a.error(w, r, domain.Fail(422, "validation", "Leave dates must be valid dates."))
			return
		}
	}
	in.ID = user(r).ID
	requestedVersion := in.Version
	e = a.Store.Tx(r.Context(), func(ctx context.Context) error {
		old, er := storage.One[domain.Availability](ctx, a.Store, "availability", bson.M{"_id": in.ID})
		if er != nil && !errors.Is(er, mongo.ErrNoDocuments) {
			return er
		}
		if requestedVersion != old.Version {
			return domain.Fail(409, "stale_version", "Availability changed. Reload before saving.")
		}
		in.Version = old.Version + 1
		if _, er = a.Store.C("availability").ReplaceOne(ctx, bson.M{"_id": in.ID}, in, options.Replace().SetUpsert(true)); er != nil {
			return er
		}
		return a.audit(ctx, in.ID, "availability.updated", in.ID)
	})
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 200, in)
}
func available(v domain.Availability, start, end time.Time) bool {
	if v.Paused || !end.After(start) {
		return false
	}
	loc, e := time.LoadLocation(v.Timezone)
	if e != nil {
		return false
	}
	s, en := start.In(loc), end.In(loc)
	for _, d := range v.LeaveDates {
		if d == s.Format("2006-01-02") || d == en.Add(-time.Nanosecond).Format("2006-01-02") {
			return false
		}
	}
	for _, win := range v.Windows {
		// Windows describe local wall-clock times, not elapsed minutes since
		// midnight. DST days can contain 23, 24.5 or 25 hours.
		lower, lowerOK := availabilityBoundary(s, win.StartMinute)
		upper, upperOK := availabilityBoundary(s, win.EndMinute)
		if win.Day == int(s.Weekday()) && lowerOK && upperOK && !start.Before(lower) && !end.After(upper) {
			return true
		}
	}
	return false
}

func availabilityBoundary(day time.Time, minute int) (time.Time, bool) {
	want := time.Date(day.Year(), day.Month(), day.Day(), minute/60, minute%60, 0, 0, time.UTC)
	wall := time.Date(want.Year(), want.Month(), want.Day(), want.Hour(), want.Minute(), 0, 0, day.Location())
	return wall, wall.Format("2006-01-02 15:04") == want.Format("2006-01-02 15:04") && uniqueWallTime(wall)
}

func uniqueWallTime(wall time.Time) bool {
	_, offset := wall.Zone()
	for _, side := range []time.Duration{-48 * time.Hour, 48 * time.Hour} {
		_, other := wall.Add(side).Zone()
		if other != offset && wall.Add(time.Duration(offset-other)*time.Second).Format("2006-01-02 15:04:05") == wall.Format("2006-01-02 15:04:05") {
			return false
		}
	}
	return true
}

// All scheduling paths share these resource/day records, including trials.
// Hold validity is explicit; TTL cleanup is never an availability decision.
func (a *App) reserveWindow(ctx context.Context, id, tutor, learner string, start, end time.Time, buffer, capacity int, hold *time.Time, release bool) error {
	type resource struct {
		key        string
		start, end time.Time
		limit      int
	}
	resources := []resource{{"t:" + tutor, start.Add(-time.Duration(buffer) * time.Minute), end.Add(time.Duration(buffer) * time.Minute), capacity}, {"l:" + learner, start, end, 48}}
	for _, res := range resources {
		for day := res.start.UTC().Truncate(24 * time.Hour); day.Before(res.end); day = day.Add(24 * time.Hour) {
			key := res.key + ":" + day.Format("2006-01-02")
			var g guard
			e := a.Store.C("guards").FindOneAndUpdate(ctx, bson.M{"_id": key}, bson.M{"$inc": bson.M{"version": 1}, "$setOnInsert": bson.M{"intervals": []interval{}}}, options.FindOneAndUpdate().SetUpsert(true).SetReturnDocument(options.After)).Decode(&g)
			if e != nil {
				return e
			}
			next := []interval{}
			for _, v := range g.Intervals {
				if v.ID == id || (v.ExpiresAt != nil && !v.ExpiresAt.After(a.Now())) {
					continue
				}
				if !release && domain.Overlap(res.start, res.end, v.Start, v.End) {
					return domain.Fail(409, "schedule_conflict", "A tutor or learner reservation overlaps this time.")
				}
				next = append(next, v)
			}
			if !release {
				if len(next) >= res.limit {
					return domain.Fail(409, "capacity", "Daily capacity has been reached.")
				}
				next = append(next, interval{ID: id, Start: res.start, End: res.end, ExpiresAt: hold})
			}
			if _, e = a.Store.C("guards").UpdateOne(ctx, bson.M{"_id": key}, bson.M{"$set": bson.M{"intervals": next}}); e != nil {
				return e
			}
		}
	}
	return nil
}
func (a *App) lockOffering(ctx context.Context, tutor string, class int) (domain.Application, domain.Availability, error) {
	var application domain.Application
	e := a.Store.C("applications").FindOneAndUpdate(ctx, bson.M{"_id": tutor}, bson.M{"$inc": bson.M{"version": 1}}, options.FindOneAndUpdate().SetReturnDocument(options.After)).Decode(&application)
	if e != nil {
		return application, domain.Availability{}, e
	}
	if !domain.Eligible(application, class, a.Now()) {
		return application, domain.Availability{}, domain.Fail(409, "scope_unavailable", "This teaching scope is not available.")
	}
	var av domain.Availability
	e = a.Store.C("availability").FindOneAndUpdate(ctx, bson.M{"_id": tutor}, bson.M{"$inc": bson.M{"bookingRevision": 1}}, options.FindOneAndUpdate().SetReturnDocument(options.After)).Decode(&av)
	if errors.Is(e, mongo.ErrNoDocuments) {
		e = domain.Fail(409, "availability_required", "The tutor must save their availability first.")
	}
	return application, av, e
}

type RecurrenceInput struct {
	StartDate string `json:"startDate"`
	Time      string `json:"time"`
	Timezone  string `json:"timezone"`
	Weekdays  []int  `json:"weekdays"`
	Count     int    `json:"count"`
	Minutes   int    `json:"minutes"`
}

func recurrence(in RecurrenceInput, now time.Time) ([]time.Time, error) {
	bad := domain.Fail(422, "validation", "Choose a valid future recurring schedule, 1–24 sessions of 30–120 minutes.")
	if in.Count < 1 || in.Count > 24 || in.Minutes < 30 || in.Minutes > 120 || len(in.Weekdays) < 1 || len(in.Weekdays) > 7 {
		return nil, bad
	}
	loc, e := time.LoadLocation(in.Timezone)
	if e != nil || loc == time.Local {
		return nil, bad
	}
	first, e := time.ParseInLocation("2006-01-02 15:04", in.StartDate+" "+in.Time, loc)
	if e != nil || first.Format("2006-01-02 15:04") != in.StartDate+" "+in.Time {
		return nil, bad
	}
	days := map[int]bool{}
	for _, d := range in.Weekdays {
		if d < 0 || d > 6 || days[d] {
			return nil, bad
		}
		days[d] = true
	}
	starts := []time.Time{}
	for i := 0; i < 180 && len(starts) < in.Count; i++ {
		v := first.AddDate(0, 0, i)
		if days[int(v.Weekday())] {
			if !v.After(now.Add(5*time.Minute)) || v.After(now.AddDate(0, 6, 0)) || v.Format("15:04") != in.Time {
				return nil, bad
			}
			if !uniqueWallTime(v) {
				return nil, bad
			}
			starts = append(starts, v.UTC())
		}
	}
	if len(starts) != in.Count {
		return nil, bad
	}
	return starts, nil
}
func enum(v string, values ...string) bool {
	for _, s := range values {
		if v == s {
			return true
		}
	}
	return false
}
func clean(s string) string { return strings.TrimSpace(s) }
