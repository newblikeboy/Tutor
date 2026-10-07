package app

import (
	"bytes"
	"context"
	"encoding/base64"
	"go.mongodb.org/mongo-driver/v2/bson"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
	"tutorplatform/internal/config"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/password"
	"tutorplatform/internal/storage"
)

func completeApplication(name string, now time.Time) domain.TutorApplication {
	return domain.TutorApplication{SchemaVersion: 1,
		About: domain.ApplicantAbout{FullName: name, Mobile: "9876543210", City: "Purnea", Locality: "Line Bazar", PIN: "854301", Location: &domain.LocationPoint{
			Address: "Line Bazar, Purnea, Bihar, India", Locality: "Line Bazar", City: "Purnea", District: "Purnea", State: "Bihar", Country: "India", PostalCode: "854301", Latitude: 25.777, Longitude: 87.475, AccuracyMeters: 30, Source: "browser",
		}, CommunicationLanguages: []string{"Hindi", "English"}},
		Education:     domain.ApplicantEducation{Qualification: "BSc", Specialisation: "Mathematics", Institution: "Fictional test college", CompletionYear: 2020, Pursuing: "no", NewToTutoring: true, Occupation: "independent_tutor", OutsideWork: "none"},
		TeachingAreas: []domain.RequestedTeachingArea{{ID: "math", Subject: "Mathematics", MinClass: 6, MaxClass: 10, Boards: []string{"CBSE"}, Languages: []string{"Hindi"}, Modes: []string{"home", "online"}, PriorExperience: "no"}},
		Availability:  domain.ApplicantAvailability{Timezone: "Asia/Kolkata", Slots: []domain.ApplicationSlot{{Day: 1, Start: "16:00", End: "18:00"}}, EarliestStart: now.AddDate(0, 0, 2).Format("2006-01-02"), Durations: []int{60}, Home: domain.HomeTeachingRequest{TravelKM: 5}, Online: domain.OnlineTeachingRequest{Device: "laptop", Camera: "ready", Microphone: "ready", Internet: "reliable", PrivateSpace: "yes", ScreenSharing: "yes", DigitalWriting: "yes"}},
		Approach:      domain.ApplicantApproach{Introduction: "I use clear examples and check how the learner explains each concept in their own words.", Scenario: "I try a simpler example and identify which step needs clarification.", Understanding: "I ask the learner to explain the idea and solve a different example.", Demonstration: "live", AssessmentSlots: []domain.ApplicationSlot{{Day: 2, Start: "16:00", End: "18:00"}}},
		Fees:          domain.ApplicantFees{Preference: "expected", SessionMinutes: 60, Rates: []domain.ExpectedRate{{AreaID: "math", Mode: "home", AmountPaise: 50000}, {AreaID: "math", Mode: "online", AmountPaise: 40000}}},
		Declarations:  domain.ApplicantDeclarations{Accuracy: true, Conduct: true, DataUse: true, NoticeVersion: domain.ApplicationNoticeVersion},
	}
}
func applicationTestInput(name string, now time.Time) map[string]any {
	return map[string]any{"version": 0, "step": 6, "submit": true, "profile": completeApplication(name, now)}
}
func TestApplicationValidation(t *testing.T) {
	now := time.Now()
	p := completeApplication("Test applicant", now)
	if errors := applicationErrors(p, true, now); len(errors) > 0 {
		t.Fatal(errors)
	}
	cases := []struct {
		name, key string
		change    func(*domain.TutorApplication)
	}{
		{"oversized photo link", "about.photoFileId", func(p *domain.TutorApplication) { p.About.PhotoFileID = strings.Repeat("x", 101) }},
		{"too many education files", "education.educationFileIds", func(p *domain.TutorApplication) {
			p.Education.EducationFileIDs = []string{"1", "2", "3", "4", "5", "6", "7"}
		}},
		{"duplicate education files", "education.educationFileIds", func(p *domain.TutorApplication) { p.Education.EducationFileIDs = []string{"1", "1"} }},
		{"blank education file", "education.educationFileIds", func(p *domain.TutorApplication) { p.Education.EducationFileIDs = []string{""} }},
		{"missing home location", "about.location", func(p *domain.TutorApplication) { p.About.Location = nil }},
		{"invalid home radius", "availability.home.travelKm", func(p *domain.TutorApplication) { p.Availability.Home.TravelKM = 26 }},
		{"missing online readiness", "availability.online.camera", func(p *domain.TutorApplication) { p.Availability.Online.Camera = "" }},
		{"invalid requested mode", "teachingAreas.0.modes", func(p *domain.TutorApplication) { p.TeachingAreas[0].Modes = []string{"approved"} }},
		{"overlapping slots", "availability.slots.1.start", func(p *domain.TutorApplication) {
			p.Availability.Slots = append(p.Availability.Slots, domain.ApplicationSlot{Day: 1, Start: "17:00", End: "19:00"})
		}},
		{"required data consent", "declarations.dataUse", func(p *domain.TutorApplication) { p.Declarations.DataUse = false }},
		{"old notice", "declarations.noticeVersion", func(p *domain.TutorApplication) { p.Declarations.NoticeVersion = "old" }},
		{"invalid class range", "teachingAreas.0.maxClass", func(p *domain.TutorApplication) { p.TeachingAreas[0].MaxClass = 5 }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			p := completeApplication("Test applicant", now)
			tc.change(&p)
			if applicationErrors(p, true, now)[tc.key] == "" {
				t.Fatal("accepted invalid application")
			}
		})
	}
	p = completeApplication("Test applicant", now)
	p.TeachingAreas[0].Modes = []string{"online"}
	p.Fees.Preference = "guidance"
	normalizeApplication(&p)
	if p.About.PIN != "854301" || len(p.Availability.Home.Localities) != 0 || len(p.Fees.Rates) != 0 {
		t.Fatal("conditional normalisation")
	}
	if errors := applicationErrors(p, true, now); len(errors) > 0 {
		t.Fatal(errors)
	}
}
func TestApplicationOnlineSetupFollowsTeachingModes(t *testing.T) {
	now := time.Now()
	for _, tc := range []struct {
		name   string
		modes  []string
		online bool
	}{
		{"home only", []string{"home"}, false},
		{"online only", []string{"online"}, true},
		{"both modes", []string{"home", "online"}, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			p := completeApplication("Sample applicant", now)
			p.TeachingAreas[0].Modes = tc.modes
			p.Availability.Online = domain.OnlineTeachingRequest{}
			normalizeApplication(&p)
			errors := applicationErrors(p, true, now)
			if tc.online {
				if len(errors) != 7 {
					t.Fatalf("expected seven online setup errors: %v", errors)
				}
				for field := range errors {
					if !strings.HasPrefix(field, "availability.online.") {
						t.Fatalf("unexpected required field: %s", field)
					}
				}
			} else if len(errors) != 0 {
				t.Fatalf("home-only application requires online setup: %v", errors)
			}
		})
	}
	p := completeApplication("Sample applicant", now)
	p.TeachingAreas[0].Modes = []string{"home"}
	onlineArea := p.TeachingAreas[0]
	onlineArea.ID, onlineArea.Modes = "online", []string{"online"}
	p.TeachingAreas = append(p.TeachingAreas, onlineArea)
	p.Availability.Online.Device = ""
	normalizeApplication(&p)
	if applicationErrors(p, true, now)["availability.online.device"] == "" {
		t.Fatal("online mode in a later teaching area must require setup")
	}
	p.TeachingAreas = p.TeachingAreas[:1]
	normalizeApplication(&p)
	if p.Availability.Online != (domain.OnlineTeachingRequest{}) {
		t.Fatal("removing the last online area must clear obsolete setup")
	}
}

func TestApplicationWhatsApp(t *testing.T) {
	now := time.Now()
	for _, tc := range []struct {
		input, normalized string
		valid             bool
	}{
		{"", "", true},
		{"9876543210", "9876543210", true},
		{" +91 98765-43210 ", "+919876543210", true},
		{"123", "123", false},
		{"1234567890", "1234567890", false},
		{"9876543210<script>", "9876543210<script>", false},
	} {
		p := completeApplication("Sample applicant", now)
		p.About.WhatsApp = tc.input
		normalizeApplication(&p)
		if p.About.WhatsApp != tc.normalized {
			t.Fatal("WhatsApp normalization failed")
		}
		for _, submit := range []bool{false, true} {
			if valid := applicationErrors(p, submit, now)["about.whatsapp"] == ""; valid != tc.valid {
				t.Fatalf("WhatsApp validation: input %q submit=%v", tc.input, submit)
			}
		}
	}
}
func TestApplicationMultipleSpecialisations(t *testing.T) {
	now := time.Now()
	for _, value := range []string{
		"Mathematics, Science, English, Hindi, Social Science",
		strings.Repeat("x", 120) + ", Mathematics, Science, English, Hindi, Social Science",
	} {
		p := completeApplication("Sample applicant", now)
		p.Education.Specialisation = value
		normalizeApplication(&p)
		if p.Education.Specialisation != value {
			t.Fatal("authored education subjects changed")
		}
		if errors := applicationErrors(p, true, now); len(errors) != 0 {
			t.Fatal(errors)
		}
	}
	p := completeApplication("Sample applicant", now)
	p.Education.Specialisation = ""
	if applicationErrors(p, false, now)["education.specialisation"] != "" {
		t.Fatal("incomplete draft rejected")
	}
	if applicationErrors(p, true, now)["education.specialisation"] == "" {
		t.Fatal("empty submission accepted")
	}
	p.Education.Specialisation = strings.Repeat("x", 241)
	if applicationErrors(p, false, now)["education.specialisation"] == "" {
		t.Fatal("unbounded subjects accepted")
	}
}
func TestApplicationHomeLocationAndRadius(t *testing.T) {
	now := time.Now()
	cases := []struct {
		name                        string
		change                      func(*domain.TutorApplication)
		key                         string
		invalidDraft, invalidSubmit bool
	}{
		{"valid GPS and radius", func(*domain.TutorApplication) {}, "", false, false},
		{"missing GPS only blocks submit", func(p *domain.TutorApplication) { p.About.Location = nil }, "about.location", false, true},
		{"zero GPS only blocks submit", func(p *domain.TutorApplication) { p.About.Location.Latitude, p.About.Location.Longitude = 0, 0 }, "about.location", false, true},
		{"radius too low", func(p *domain.TutorApplication) { p.Availability.Home.TravelKM = 0 }, "availability.home.travelKm", false, true},
		{"radius too high", func(p *domain.TutorApplication) { p.Availability.Home.TravelKM = 26 }, "availability.home.travelKm", true, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			p := completeApplication("Test applicant", now)
			tc.change(&p)
			normalizeApplication(&p)
			if len(p.Availability.Home.Localities) != 0 || len(p.Availability.Home.ServiceLocations) != 0 || p.Availability.Home.Charges != "" || p.Availability.Home.BufferMinutes != 0 {
				t.Fatal("removed home service fields were not cleared")
			}
			for _, submit := range []bool{false, true} {
				wantInvalid := tc.invalidDraft
				if submit {
					wantInvalid = tc.invalidSubmit
				}
				fields := applicationErrors(p, submit, now)
				if tc.key == "" {
					if len(fields) != 0 {
						t.Fatalf("submit=%v: unexpected validation %v", submit, fields)
					}
					continue
				}
				if (fields[tc.key] != "") != wantInvalid {
					t.Fatalf("submit=%v: unexpected validation %v", submit, fields)
				}
			}
		})
	}
}

func TestMongoApplicationDraftAndEligibility(t *testing.T) {
	uri := os.Getenv("TEST_MONGODB_URI")
	if uri == "" {
		t.Skip("TEST_MONGODB_URI required")
	}
	t.Setenv("SEED_PASSWORD", testPassword)
	ctx := context.Background()
	s, e := storage.Connect(ctx, uri, "tutor_test_application_"+token()[:12])
	if e != nil {
		t.Fatal(e)
	}
	defer s.Client.Disconnect(ctx)
	if e = s.Migrate(ctx); e != nil {
		t.Fatal(e)
	}
	if e = s.Seed(ctx, "test"); e != nil {
		t.Fatal(e)
	}
	if _, e = s.C("users").InsertOne(ctx, domain.User{ID: "mentor-b", Name: "Second academic mentor", Email: "mentor-b@example.test", Role: "mentor", Sample: true}); e != nil {
		t.Fatal(e)
	}
	hash, e := password.Hash(testPassword)
	if e != nil {
		t.Fatal(e)
	}
	if _, e = s.C("users").InsertOne(ctx, domain.User{ID: "tutor-b", Name: "Second tutor applicant", Email: "tutor-b@example.test", Role: "tutor", Sample: true}); e != nil {
		t.Fatal(e)
	}
	if _, e = s.C("credentials").InsertOne(ctx, bson.M{"_id": "tutor-b@example.test", "userId": "tutor-b", "passwordHash": hash}); e != nil {
		t.Fatal(e)
	}
	if _, e = s.C("credentials").InsertOne(ctx, bson.M{"_id": "mentor-b@example.test", "userId": "mentor-b", "passwordHash": hash}); e != nil {
		t.Fatal(e)
	}
	a := New(s, config.Config{Env: "test", AuthProvider: "password", Origin: "http://test.local", MediaProvider: "disk", MediaRoot: t.TempDir()})
	if e = a.ConfigureMedia(); e != nil {
		t.Fatal(e)
	}
	server := httptest.NewServer(a.Routes())
	defer server.Close()
	client := func(id string) *testClient {
		jar, _ := cookiejar.New(nil)
		c := &testClient{t: t, http: &http.Client{Jar: jar, Timeout: 30 * time.Second}, base: server.URL}
		c.login(id)
		return c
	}
	tutor, tutorB, admin, parent, mentor, mentorB := client("tutor-a"), client("tutor-b"), client("admin-a"), client("parent-a"), client("mentor-a"), client("mentor-b")
	parent.ok("GET", "/application", nil, 403)
	p := completeApplication("Private applicant", time.Now())
	p.Education.Occupation = "employed_teacher"
	p.Education.OutsideWork = "permission_required"
	p.Declarations.Accuracy = false
	p.Availability.Home.Localities = []string{"legacy locality"}
	p.Availability.Home.Charges = "included"
	p.Availability.Home.BufferMinutes = 30
	in := map[string]any{"version": 0, "step": 3, "profile": p, "submit": false}
	tutor.ok("PUT", "/application", in, 200)
	tutor.ok("PUT", "/application", in, 409)
	fileStatus, file, _ := tutor.call("POST", "/applications/tutor-a/files", map[string]any{"name": "resume.pdf", "content": base64.StdEncoding.EncodeToString([]byte("%PDF-1.4\n1 0 obj <<>> endobj\n%%EOF"))}, map[string]string{"Idempotency-Key": "application-private-resume"})
	if fileStatus != 201 {
		t.Fatal("resume upload failed")
	}
	tutor.ok("GET", "/files/"+file["id"].(string)+"/download", nil, 409)
	p.Education.ResumeFileID = file["id"].(string)
	own := tutor.ok("GET", "/application", nil, 200)["application"].(map[string]any)
	if own["formStep"] != float64(3) || own["formVersion"] != float64(1) {
		t.Fatal("draft did not persist")
	}
	draft, e := storage.One[domain.Application](ctx, s, "applications", bson.M{"_id": "tutor-a"})
	if e != nil {
		t.Fatal(e)
	}
	if len(draft.Profile.Availability.Home.Localities) != 0 || draft.Profile.Availability.Home.Charges != "" || draft.Profile.Availability.Home.BufferMinutes != 0 || draft.Profile.Availability.Home.TravelKM != 5 || draft.Profile.About.Location == nil {
		t.Fatal("draft home radius/location was not normalized")
	}
	in["version"] = 1
	in["submit"] = true
	in["profile"] = p
	tutor.ok("PUT", "/application", in, 422)
	p.Declarations.Accuracy = true
	in["profile"] = p
	tutor.ok("PUT", "/application", in, 200)
	tutor.ok("PUT", "/application", in, 409)
	stored, e := storage.One[domain.Application](ctx, s, "applications", bson.M{"_id": "tutor-a"})
	if e != nil {
		t.Fatal(e)
	}
	if len(stored.Profile.Availability.Home.Localities) != 0 || stored.Profile.Availability.Home.Charges != "" || stored.Profile.Availability.Home.BufferMinutes != 0 || stored.Profile.Availability.Home.TravelKM != 5 || stored.Profile.About.Location == nil {
		t.Fatal("submitted home radius/location was not normalized")
	}
	if stored.AssessorID != "mentor-a" || stored.ConflictClear {
		t.Fatalf("first submitted application was not assigned to first mentor without conflict confirmation: %#v", stored.AssessorID)
	}
	if !stored.Profile.HasMode("home") || !stored.Profile.HasMode("online") || len(stored.Profile.Fees.Rates) != 0 || stored.Profile.Fees.Preference != "staff" || stored.Fees != nil || stored.Eligibility.Status != "pending" || stored.Submission == nil || stored.Submission.Marketing || stored.Scope.Mode != "" {
		t.Fatal("application receipt or requested preferences incorrect")
	}
	p2 := completeApplication("Second private applicant", time.Now())
	tutorB.ok("PUT", "/application", map[string]any{"version": 0, "step": 6, "profile": p2, "submit": true}, 200)
	storedB, e := storage.One[domain.Application](ctx, s, "applications", bson.M{"_id": "tutor-b"})
	if e != nil {
		t.Fatal(e)
	}
	if storedB.AssessorID != "mentor-b" {
		t.Fatalf("second submitted application was not assigned to second mentor: %#v", storedB.AssessorID)
	}
	mentor.ok("GET", "/staff/applications/tutor-a", nil, 200)
	mentor.ok("GET", "/staff/applications/tutor-b", nil, 404)
	mentor.ok("POST", "/applications/tutor-b/decision", map[string]any{"action": "review", "version": storedB.Version, "conflictClear": true}, 403)
	mentorB.ok("GET", "/staff/applications/tutor-b", nil, 200)
	filtered := admin.ok("GET", "/staff/applications?mode=home", nil, 200)
	if len(filtered["items"].([]any)) != 2 {
		t.Fatal("home filter must include only requested home applications")
	}
	_, _, raw := parent.call("GET", "/tutors", nil, nil)
	if bytes.Contains(raw, []byte("9876543210")) || bytes.Contains(raw, []byte("Private applicant")) {
		t.Fatal("private application leaked")
	}
	// Assessment completion is covered by the staff integration suite. Here isolate eligibility/scope gates.
	_, e = s.C("applications").UpdateOne(ctx, bson.M{"_id": "tutor-a"}, bson.M{"$set": bson.M{"status": "assessed", "assessorId": "mentor-a", "conflictClear": true}})
	if e != nil {
		t.Fatal(e)
	}
	mentor.decide("tutor-a", map[string]any{"action": "approve", "mode": "online", "minClass": 6, "maxClass": 10, "reason": "Assessment met the requested subject standards."}, 409)
	mentor.decide("tutor-a", map[string]any{"action": "eligibility", "eligibility": "cleared", "reason": "Fictional employment permission evidence reviewed."}, 403)
	admin.decide("tutor-a", map[string]any{"action": "eligibility", "eligibility": "cleared", "reason": "Fictional employer permission evidence reviewed."}, 200)
	// A home-only request must never become an online permission.
	_, e = s.C("applications").UpdateOne(ctx, bson.M{"_id": "tutor-a"}, bson.M{"$set": bson.M{"profile.teachingAreas.0.modes": []string{"home"}}})
	if e != nil {
		t.Fatal(e)
	}
	mentor.decide("tutor-a", map[string]any{"action": "approve", "mode": "online", "minClass": 6, "maxClass": 10, "reason": "Assessment met the requested subject standards."}, 409)
	// An old priority pointing at a different subject must not block a requested Mathematics scope.
	mathArea := p.TeachingAreas[0]
	mathArea.Modes = []string{"online", "home"}
	scienceArea := mathArea
	scienceArea.ID, scienceArea.Subject = "science", "Science"
	_, e = s.C("applications").UpdateOne(ctx, bson.M{"_id": "tutor-a"}, bson.M{"$set": bson.M{
		"profile.teachingAreas": []domain.RequestedTeachingArea{scienceArea, mathArea},
		"profile.firstAreaId":   "science",
	}})
	if e != nil {
		t.Fatal(e)
	}
	mentor.setTestFees("tutor-a", 0)
	mentor.decide("tutor-a", map[string]any{"action": "approve", "mode": "online", "minClass": 6, "maxClass": 10, "reason": "Assessment met the requested subject standards."}, 200)
}
