package app

import (
	"context"
	"fmt"
	"github.com/go-chi/chi/v5/middleware"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"net/http"
	"strings"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
)

func (a *App) ownApplication(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "tutor") {
		return
	}
	v, e := storage.One[domain.Application](r.Context(), a.Store, "applications", bson.M{"_id": user(r).ID})
	var application *domain.Application
	if e == nil {
		application = &v
	} else if e != mongo.ErrNoDocuments {
		a.error(w, r, e)
		return
	}
	a.json(w, 200, map[string]any{"application": application, "noticeVersion": domain.ApplicationNoticeVersion})
}

func normalizeApplication(p *domain.TutorApplication) {
	if p.About.CommunicationLanguages == nil {
		p.About.CommunicationLanguages = []string{}
	}
	if p.Education.Settings == nil {
		p.Education.Settings = []string{}
	}
	if p.Education.EducationFileIDs == nil {
		p.Education.EducationFileIDs = []string{}
	}
	if p.Approach.AssessmentSlots == nil {
		p.Approach.AssessmentSlots = []domain.ApplicationSlot{}
	}
	if p.Availability.Durations == nil {
		p.Availability.Durations = []int{}
	}
	// A textarea's trailing newline is formatting, not an empty service locality.
	localities := make([]string, 0, len(p.Availability.Home.Localities))
	for _, name := range p.Availability.Home.Localities {
		if name = strings.TrimSpace(name); name != "" {
			localities = append(localities, name)
		}
	}
	p.Availability.Home.Localities = localities
	if p.Fees.Rates == nil {
		p.Fees.Rates = []domain.ExpectedRate{}
	}
	if p.TeachingAreas == nil {
		p.TeachingAreas = []domain.RequestedTeachingArea{}
	}
	if p.Availability.Slots == nil {
		p.Availability.Slots = []domain.ApplicationSlot{}
	}
	for i := range p.TeachingAreas {
		v := &p.TeachingAreas[i]
		if v.Boards == nil {
			v.Boards = []string{}
		}
		if v.Languages == nil {
			v.Languages = []string{}
		}
		if v.Modes == nil {
			v.Modes = []string{}
		}
	}
	p.About.FullName = clean(p.About.FullName)
	p.About.DisplayName = clean(p.About.DisplayName)
	p.About.Mobile = strings.ReplaceAll(strings.ReplaceAll(strings.TrimSpace(p.About.Mobile), " ", ""), "-", "")
	p.About.City = clean(p.About.City)
	p.About.Locality = clean(p.About.Locality)
	p.About.PIN = strings.TrimSpace(p.About.PIN)
	if p.Education.Pursuing == "no" {
		p.Education.Programme = ""
		p.Education.CurrentInstitution = ""
		p.Education.CurrentStage = ""
		p.Education.ExpectedCompletion = ""
	}
	if p.Education.NewToTutoring {
		p.Education.ExperienceYears = 0
		p.Education.ExperienceMonths = 0
		p.Education.Settings = []string{}
		p.Education.Summary = ""
	}
	if !p.HasMode("home") {
		p.Availability.Home = domain.HomeTeachingRequest{Localities: []string{}}
	}
	if !p.HasMode("online") {
		p.Availability.Online = domain.OnlineTeachingRequest{}
	}
	if p.Availability.Period != "until" {
		p.Availability.UntilDate = ""
	}
	if p.Approach.Demonstration != "recorded" {
		p.Approach.DemoAreaID = ""
		p.Approach.DemoTopic = ""
		p.Approach.DemoFileID = ""
	}
	// Legacy applicant preferences are never accepted as staff pricing.
	p.Fees = domain.ApplicantFees{Preference: "staff", SessionMinutes: 60, Rates: []domain.ExpectedRate{}}
}

func (a *App) application(w http.ResponseWriter, r *http.Request) {
	if !a.role(w, r, "tutor") {
		return
	}
	var in struct {
		Version *int                     `json:"version"`
		Step    int                      `json:"step"`
		Submit  bool                     `json:"submit"`
		Profile *domain.TutorApplication `json:"profile"`
	}
	if !a.decode(w, r, &in) {
		return
	}
	if in.Profile == nil || in.Version == nil || *in.Version < 0 || in.Step < 0 || in.Step > 6 {
		a.error(w, r, domain.Fail(422, "validation", "Check the application and current draft version."))
		return
	}
	normalizeApplication(in.Profile)
	if fields := applicationErrors(*in.Profile, in.Submit, a.Now()); len(fields) > 0 {
		a.json(w, 422, map[string]any{"code": "application_validation", "message": "Review the highlighted application fields.", "fieldErrors": fields, "requestId": middleware.GetReqID(r.Context())})
		return
	}
	u := user(r)
	var result domain.Application
	e := a.Store.Tx(r.Context(), func(ctx context.Context) error {
		old, err := storage.One[domain.Application](ctx, a.Store, "applications", bson.M{"_id": u.ID})
		if err != nil && err != mongo.ErrNoDocuments {
			return err
		}
		if old.ID != "" && !enum(old.Status, "draft", "improvement_required") {
			return domain.Fail(409, "invalid_transition", "This application is already in review.")
		}
		if old.FormVersion != *in.Version {
			return domain.Fail(409, "stale", "This draft changed in another window. Reload before saving.")
		}
		{
			links := []struct{ id, kind string }{{in.Profile.About.PhotoFileID, "photo"}, {in.Profile.Education.ResumeFileID, "document"}, {in.Profile.Approach.WorksheetFileID, "document"}, {in.Profile.Approach.DemoFileID, "video"}}
			for _, id := range in.Profile.Education.EducationFileIDs {
				links = append(links, struct{ id, kind string }{id, "document"})
			}
			for _, linked := range links {
				if linked.id == "" {
					continue
				}
				f, er := a.privateFile(ctx, linked.id)
				if er != nil {
					if er != mongo.ErrNoDocuments {
						return er
					}
					return domain.Fail(422, "application_file", "Choose a saved, permitted application file.")
				}
				if f.TargetKind != "application" || f.TargetID != u.ID || f.UploaderID != u.ID || !enum(f.Status, "quarantined", "clean", "ready") || (linked.kind == "video") != (f.ContentType == "video/mp4") {
					return domain.Fail(422, "application_file", "Choose the correct file type for this application field.")
				}
				if linked.kind == "photo" && !enum(f.ContentType, "image/jpeg", "image/png") {
					return domain.Fail(422, "application_photo", "Choose a JPG or PNG passport-size photo.")
				}
			}
		}
		result = old
		result.ID = u.ID
		result.Sample = u.Sample
		result.Profile = in.Profile
		result.Name = in.Profile.About.FullName
		result.Education = fmt.Sprintf("%s, %s — %s (%d)", in.Profile.Education.Qualification, in.Profile.Education.Specialisation, in.Profile.Education.Institution, in.Profile.Education.CompletionYear)
		result.Experience = in.Profile.Education.ExperienceYears
		result.Approach = in.Profile.Approach.Introduction
		result.Language = ""
		if first, ok := in.Profile.FirstArea(); ok && len(first.Languages) > 0 {
			result.Language = first.Languages[0]
		}
		if result.Status == "" {
			result.Status = "draft"
		}
		result.FormStep = in.Step
		result.FormVersion++
		result.Version++
		result.UpdatedAt = a.Now()
		if in.Submit {
			result.Fees = nil
			result.Status = "submitted"
			result.FormStep = 6
			result.Scope = domain.Scope{}
			result.AssessorID = ""
			result.MentorID = ""
			result.ConflictClear = false
			result.Interview = nil
			result.Scores = nil
			result.Evidence = ""
			result.Submission = &domain.ApplicationReceipt{NoticeVersion: domain.ApplicationNoticeVersion, At: a.Now(), Marketing: in.Profile.Declarations.Marketing}
			status := "not_required"
			if in.Profile.NeedsEligibilityReview() {
				status = "pending"
			}
			result.Eligibility = &domain.EligibilityReview{Status: status}
		}
		if _, err = a.Store.C("applications").ReplaceOne(ctx, bson.M{"_id": u.ID}, result, options.Replace().SetUpsert(true)); err != nil {
			return err
		}
		if in.Submit {
			return a.audit(ctx, u.ID, "application.submitted", u.ID)
		}
		return nil
	})
	if e != nil {
		a.error(w, r, e)
		return
	}
	a.json(w, 200, result)
}
