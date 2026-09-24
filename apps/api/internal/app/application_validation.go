package app

import (
	"fmt"
	"regexp"
	"strings"
	"time"
	"tutorplatform/internal/domain"
)

// Drafts may be incomplete; both draft and submitted documents are bounded.
func applicationErrors(p domain.TutorApplication, submit bool, now time.Time) map[string]string {
	errors := map[string]string{}
	text := func(key, value string, minimum, maximum int) {
		n := len([]rune(strings.TrimSpace(value)))
		if n > maximum || submit && n < minimum {
			errors[key] = "text"
		}
	}
	choice := func(key, value string, required bool, allowed ...string) {
		if value == "" {
			if submit && required {
				errors[key] = "required"
			}
			return
		}
		if !enum(value, allowed...) {
			errors[key] = "choice"
		}
	}
	number := func(key string, value, minimum, maximum int) {
		if value < 0 || value > maximum || submit && value < minimum {
			errors[key] = "number"
		}
	}
	choices := func(key string, values []string, required bool, allowed ...string) {
		if len(values) > len(allowed) || submit && required && len(values) == 0 {
			errors[key] = "choice"
		}
		seen := map[string]bool{}
		for _, value := range values {
			if !enum(value, allowed...) || seen[value] {
				errors[key] = "choice"
			}
			seen[value] = true
		}
	}
	date := func(key, value string, required bool) {
		if !submit {
			if len(value) > 10 {
				errors[key] = "date"
			}
			return
		}
		if value == "" && !required {
			return
		}
		if _, e := time.Parse("2006-01-02", value); e != nil {
			errors[key] = "date"
		}
	}
	if p.SchemaVersion != 1 {
		errors["schemaVersion"] = "version"
	}
	b := p.About
	text("about.fullName", b.FullName, 2, 80)
	text("about.displayName", b.DisplayName, 0, 80)
	text("about.mobile", b.Mobile, 10, 16)
	if submit && !regexp.MustCompile(`^(\+91[ -]?)?[6-9][0-9]{9}$`).MatchString(b.Mobile) {
		errors["about.mobile"] = "phone"
	}
	text("about.city", b.City, 2, 80)
	text("about.locality", b.Locality, 0, 120)
	text("about.pin", b.PIN, 0, 6)
	choices("about.communicationLanguages", b.CommunicationLanguages, true, "Hindi", "English")
	e := p.Education
	text("education.qualification", e.Qualification, 2, 120)
	text("education.specialisation", e.Specialisation, 2, 120)
	text("education.institution", e.Institution, 2, 160)
	number("education.completionYear", e.CompletionYear, 1900, now.Year())
	choice("education.pursuing", e.Pursuing, true, "yes", "no")
	minimum := 0
	if e.Pursuing == "yes" {
		minimum = 2
	}
	text("education.programme", e.Programme, minimum, 120)
	text("education.currentInstitution", e.CurrentInstitution, minimum, 160)
	text("education.currentStage", e.CurrentStage, minimum, 80)
	text("education.expectedCompletion", e.ExpectedCompletion, 0, 7)
	if submit && e.Pursuing == "yes" {
		end, err := time.Parse("2006-01", e.ExpectedCompletion)
		if err != nil || end.Year() < now.Year() || end.Year() > now.Year()+12 {
			errors["education.expectedCompletion"] = "date"
		}
	}
	text("education.additional", e.Additional, 0, 600)
	number("education.experienceYears", e.ExperienceYears, 0, 60)
	number("education.experienceMonths", e.ExperienceMonths, 0, 11)
	choices("education.settings", e.Settings, !e.NewToTutoring, "home", "online", "school", "coaching", "volunteering", "other")
	minimum = 0
	if !e.NewToTutoring {
		minimum = 10
	}
	text("education.summary", e.Summary, minimum, 800)
	if submit && !e.NewToTutoring && e.ExperienceYears*12+e.ExperienceMonths == 0 {
		errors["education.experienceMonths"] = "experience"
	}
	choice("education.occupation", e.Occupation, true, "independent_tutor", "student", "employed_teacher", "other_employment", "not_employed", "other")
	choice("education.outsideWork", e.OutsideWork, true, "none", "permission_required", "restricted", "unsure")
	text("education.resumeFileId", e.ResumeFileID, 0, 100)
	if len(e.EducationFileIDs) > 6 {
		errors["education.educationFileIds"] = "limit"
	}
	seenFiles := map[string]bool{}
	for _, id := range e.EducationFileIDs {
		if id == "" || len(id) > 100 || seenFiles[id] {
			errors["education.educationFileIds"] = "file"
		}
		seenFiles[id] = true
	}
	if len(p.TeachingAreas) > 8 || submit && len(p.TeachingAreas) == 0 {
		errors["teachingAreas"] = "required"
	}
	areas := map[string]domain.RequestedTeachingArea{}
	for i, a := range p.TeachingAreas {
		prefix := fmt.Sprintf("teachingAreas.%d.", i)
		if !regexp.MustCompile(`^[a-zA-Z0-9_-]{1,60}$`).MatchString(a.ID) {
			errors[prefix+"id"] = "choice"
		}
		if _, exists := areas[a.ID]; exists {
			errors[prefix+"id"] = "duplicate"
		}
		areas[a.ID] = a
		choice(prefix+"subject", a.Subject, true, "Mathematics", "Science", "English", "Hindi", "Social Science")
		number(prefix+"minClass", a.MinClass, 1, 12)
		number(prefix+"maxClass", a.MaxClass, 1, 12)
		if a.MinClass > a.MaxClass && a.MaxClass != 0 {
			errors[prefix+"maxClass"] = "range"
		}
		choices(prefix+"boards", a.Boards, true, "CBSE", "BSEB", "ICSE")
		choices(prefix+"languages", a.Languages, true, "Hindi", "English")
		choices(prefix+"modes", a.Modes, true, "home", "online")
		choice(prefix+"priorExperience", a.PriorExperience, true, "yes", "no")
	}
	text("firstAreaId", p.FirstAreaID, 0, 60)
	if _, exists := areas[p.FirstAreaID]; submit && !exists {
		errors["firstAreaId"] = "required"
	}
	v := p.Availability
	choice("availability.timezone", v.Timezone, true, "Asia/Kolkata")
	validateApplicationSlots(errors, "availability.slots", v.Slots, submit)
	date("availability.earliestStart", v.EarliestStart, true)
	location, _ := time.LoadLocation("Asia/Kolkata")
	if submit && v.EarliestStart < now.In(location).Format("2006-01-02") {
		errors["availability.earliestStart"] = "future_date"
	}
	number("availability.weeklyHours", v.WeeklyHours, 1, 60)
	number("availability.maxStudents", v.MaxStudents, 1, 30)
	if len(v.Durations) > 3 || submit && len(v.Durations) == 0 {
		errors["availability.durations"] = "required"
	}
	durations := map[int]bool{}
	for _, n := range v.Durations {
		if n != 45 && n != 60 && n != 90 || durations[n] {
			errors["availability.durations"] = "choice"
		}
		durations[n] = true
	}
	choice("availability.period", v.Period, true, "ongoing", "until", "unsure")
	date("availability.untilDate", v.UntilDate, v.Period == "until")
	if submit && v.Period == "until" && v.UntilDate < v.EarliestStart {
		errors["availability.untilDate"] = "range"
	}
	text("availability.interruptions", v.Interruptions, 0, 600)
	h := v.Home
	if p.HasMode("home") {
		text("about.locality", b.Locality, 2, 120)
		if submit && !regexp.MustCompile(`^[1-9][0-9]{5}$`).MatchString(b.PIN) {
			errors["about.pin"] = "pin"
		}
		if len(h.Localities) > 12 || submit && len(h.Localities) == 0 {
			errors["availability.home.localities"] = "required"
		}
		for _, name := range h.Localities {
			text("availability.home.localities", name, 2, 100)
		}
		number("availability.home.travelKm", h.TravelKM, 1, 100)
		choice("availability.home.charges", h.Charges, true, "included", "additional", "discuss")
		number("availability.home.bufferMinutes", h.BufferMinutes, 5, 180)
	}
	if p.HasMode("online") {
		o := v.Online
		choice("availability.online.device", o.Device, true, "laptop", "desktop", "tablet", "phone", "need_help")
		choice("availability.online.camera", o.Camera, true, "ready", "need_help")
		choice("availability.online.microphone", o.Microphone, true, "ready", "need_help")
		choice("availability.online.internet", o.Internet, true, "reliable", "sometimes_unstable", "need_help")
		choice("availability.online.privateSpace", o.PrivateSpace, true, "yes", "need_help")
		choice("availability.online.screenSharing", o.ScreenSharing, true, "yes", "need_help")
		choice("availability.online.digitalWriting", o.DigitalWriting, true, "yes", "no", "need_help")
	}
	a := p.Approach
	text("approach.introduction", a.Introduction, 40, 1200)
	text("approach.scenario", a.Scenario, 20, 800)
	text("approach.understanding", a.Understanding, 20, 800)
	choice("approach.demonstration", a.Demonstration, true, "live", "recorded")
	text("approach.demoAreaId", a.DemoAreaID, 0, 60)
	text("approach.demoTopic", a.DemoTopic, 0, 160)
	text("approach.demoFileId", a.DemoFileID, 0, 100)
	text("approach.worksheetFileId", a.WorksheetFileID, 0, 100)
	if submit && a.Demonstration == "recorded" {
		if _, exists := areas[a.DemoAreaID]; !exists {
			errors["approach.demoAreaId"] = "required"
		}
		text("approach.demoTopic", a.DemoTopic, 3, 160)
		text("approach.demoFileId", a.DemoFileID, 1, 100)
	}
	validateApplicationSlots(errors, "approach.assessmentSlots", a.AssessmentSlots, submit)
	f := p.Fees
	choice("fees.preference", f.Preference, true, "expected", "guidance")
	if f.SessionMinutes != 60 {
		errors["fees.sessionMinutes"] = "choice"
	}
	text("fees.comments", f.Comments, 0, 500)
	if len(f.Rates) > 16 {
		errors["fees.rates"] = "choice"
	}
	seenRates := map[string]bool{}
	for i, rate := range f.Rates {
		key := fmt.Sprintf("fees.rates.%d.amountPaise", i)
		area, exists := areas[rate.AreaID]
		if !exists || !enum(rate.Mode, area.Modes...) || seenRates[rate.AreaID+":"+rate.Mode] || rate.AmountPaise < 0 || rate.AmountPaise > 10_000_000 || submit && f.Preference == "expected" && rate.AmountPaise < 100 {
			errors[key] = "rate"
		}
		seenRates[rate.AreaID+":"+rate.Mode] = true
	}
	if submit && f.Preference == "expected" {
		for _, area := range p.TeachingAreas {
			for _, mode := range area.Modes {
				if !seenRates[area.ID+":"+mode] {
					errors["fees.rates"] = "required"
				}
			}
		}
	}
	if submit {
		if !p.Declarations.Accuracy {
			errors["declarations.accuracy"] = "required"
		}
		if !p.Declarations.Conduct {
			errors["declarations.conduct"] = "required"
		}
		if !p.Declarations.DataUse {
			errors["declarations.dataUse"] = "required"
		}
		if p.Declarations.NoticeVersion != domain.ApplicationNoticeVersion {
			errors["declarations.noticeVersion"] = "version"
		}
	}
	return errors
}

func validateApplicationSlots(errors map[string]string, key string, slots []domain.ApplicationSlot, required bool) {
	if len(slots) > 21 || required && len(slots) == 0 {
		errors[key] = "required"
	}
	for i, slot := range slots {
		prefix := fmt.Sprintf("%s.%d", key, i)
		if slot.Day < 0 || slot.Day > 6 {
			errors[prefix+".day"] = "choice"
		}
		start, se := time.Parse("15:04", slot.Start)
		end, ee := time.Parse("15:04", slot.End)
		if !required && slot.Start == "" && slot.End == "" {
			continue
		}
		if se != nil || ee != nil || !end.After(start) || end.Sub(start) < 15*time.Minute {
			errors[prefix+".end"] = "time"
			continue
		}
		for j := 0; j < i; j++ {
			other := slots[j]
			if other.Day == slot.Day && other.Start < slot.End && slot.Start < other.End {
				errors[prefix+".start"] = "overlap"
			}
		}
	}
}
