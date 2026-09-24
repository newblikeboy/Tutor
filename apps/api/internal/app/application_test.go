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
	"slices"
	"strings"
	"testing"
	"time"
	"tutorplatform/internal/config"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
)

func completeApplication(name string, now time.Time) domain.TutorApplication {
	return domain.TutorApplication{SchemaVersion: 1,
		About:         domain.ApplicantAbout{FullName: name, Mobile: "9876543210", City: "Purnea", Locality: "Line Bazar", PIN: "854301", CommunicationLanguages: []string{"Hindi", "English"}},
		Education:     domain.ApplicantEducation{Qualification: "BSc", Specialisation: "Mathematics", Institution: "Fictional test college", CompletionYear: 2020, Pursuing: "no", NewToTutoring: true, Occupation: "independent_tutor", OutsideWork: "none"},
		TeachingAreas: []domain.RequestedTeachingArea{{ID: "math", Subject: "Mathematics", MinClass: 6, MaxClass: 10, Boards: []string{"CBSE"}, Languages: []string{"Hindi"}, Modes: []string{"home", "online"}, PriorExperience: "no"}}, FirstAreaID: "math",
		Availability: domain.ApplicantAvailability{Timezone: "Asia/Kolkata", Slots: []domain.ApplicationSlot{{Day: 1, Start: "16:00", End: "18:00"}}, EarliestStart: now.AddDate(0, 0, 2).Format("2006-01-02"), WeeklyHours: 10, MaxStudents: 3, Durations: []int{60}, Period: "ongoing", Home: domain.HomeTeachingRequest{Localities: []string{"Line Bazar"}, TravelKM: 5, Charges: "included", BufferMinutes: 30}, Online: domain.OnlineTeachingRequest{Device: "laptop", Camera: "ready", Microphone: "ready", Internet: "reliable", PrivateSpace: "yes", ScreenSharing: "yes", DigitalWriting: "yes"}},
		Approach:     domain.ApplicantApproach{Introduction: "I use clear examples and check how the learner explains each concept in their own words.", Scenario: "I try a simpler example and identify which step needs clarification.", Understanding: "I ask the learner to explain the idea and solve a different example.", Demonstration: "live", AssessmentSlots: []domain.ApplicationSlot{{Day: 2, Start: "16:00", End: "18:00"}}},
		Fees:         domain.ApplicantFees{Preference: "expected", SessionMinutes: 60, Rates: []domain.ExpectedRate{{AreaID: "math", Mode: "home", AmountPaise: 50000}, {AreaID: "math", Mode: "online", AmountPaise: 40000}}},
		Declarations: domain.ApplicantDeclarations{Accuracy: true, Conduct: true, DataUse: true, NoticeVersion: domain.ApplicationNoticeVersion},
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
		{"missing home service", "availability.home.localities", func(p *domain.TutorApplication) { p.Availability.Home.Localities = nil }},
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
func TestApplicationServiceLocalities(t *testing.T) {
	now := time.Now()
	cases := []struct {
		name                        string
		input, want                 []string
		invalidDraft, invalidSubmit bool
	}{
		{"blank lines and spaces", []string{"", "  Line Bazar  ", "\t", " Bhatta Bazar\r", "\u00a0"}, []string{"Line Bazar", "Bhatta Bazar"}, false, false},
		{"Unicode names", []string{"  भट्टा बाजार  ", "林区"}, []string{"भट्टा बाजार", "林区"}, false, false},
		{"all blank", []string{"", "  ", "\t"}, []string{}, false, true},
		{"missing", nil, []string{}, false, true},
		{"too short", []string{"A"}, []string{"A"}, false, true},
		{"maximum length", []string{strings.Repeat("क", 100)}, []string{strings.Repeat("क", 100)}, false, false},
		{"too long", []string{strings.Repeat("क", 101)}, []string{strings.Repeat("क", 101)}, true, true},
		{"maximum count with blank line", append(strings.Fields(strings.Repeat("Area ", 12)), ""), strings.Fields(strings.Repeat("Area ", 12)), false, false},
		{"too many", strings.Fields(strings.Repeat("Area ", 13)), strings.Fields(strings.Repeat("Area ", 13)), true, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			p := completeApplication("Test applicant", now)
			p.Availability.Home.Localities = tc.input
			normalizeApplication(&p)
			if p.Availability.Home.Localities == nil || !slices.Equal(p.Availability.Home.Localities, tc.want) {
				t.Fatal("localities were not normalized")
			}
			for _, submit := range []bool{false, true} {
				wantInvalid := tc.invalidDraft
				if submit {
					wantInvalid = tc.invalidSubmit
				}
				fields := applicationErrors(p, submit, now)
				if (fields["availability.home.localities"] != "") != wantInvalid {
					t.Fatalf("submit=%v: unexpected locality validation %v", submit, fields)
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
	tutor, admin, parent, mentor := client("tutor-a"), client("admin-a"), client("parent-a"), client("mentor-a")
	parent.ok("GET", "/application", nil, 403)
	p := completeApplication("Private applicant", time.Now())
	p.Education.Occupation = "employed_teacher"
	p.Education.OutsideWork = "permission_required"
	p.Declarations.Accuracy = false
	p.Availability.Home.Localities = []string{"  Line Bazar  ", "", "\t", " Bhatta Bazar ", ""}
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
	if e != nil || !slices.Equal(draft.Profile.Availability.Home.Localities, []string{"Line Bazar", "Bhatta Bazar"}) {
		t.Fatal("draft locality formatting was not normalized")
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
	if !slices.Equal(stored.Profile.Availability.Home.Localities, []string{"Line Bazar", "Bhatta Bazar"}) {
		t.Fatal("submitted locality formatting was not normalized")
	}
	if !stored.Profile.HasMode("home") || !stored.Profile.HasMode("online") || len(stored.Profile.Fees.Rates) != 0 || stored.Profile.Fees.Preference != "staff" || stored.Fees != nil || stored.Eligibility.Status != "pending" || stored.Submission == nil || stored.Submission.Marketing || stored.Scope.Mode != "" {
		t.Fatal("application receipt or requested preferences incorrect")
	}
	filtered := admin.ok("GET", "/staff/applications?mode=home", nil, 200)
	if len(filtered["items"].([]any)) != 1 {
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
	mentor.decide("tutor-a", map[string]any{"action": "approve", "minClass": 6, "maxClass": 10, "reason": "Assessment met the requested subject standards."}, 409)
	mentor.decide("tutor-a", map[string]any{"action": "eligibility", "eligibility": "cleared", "reason": "Fictional employment permission evidence reviewed."}, 403)
	admin.decide("tutor-a", map[string]any{"action": "eligibility", "eligibility": "cleared", "reason": "Fictional employer permission evidence reviewed."}, 200)
	// A home-only request must never become an online permission.
	_, e = s.C("applications").UpdateOne(ctx, bson.M{"_id": "tutor-a"}, bson.M{"$set": bson.M{"profile.teachingAreas.0.modes": []string{"home"}}})
	if e != nil {
		t.Fatal(e)
	}
	mentor.decide("tutor-a", map[string]any{"action": "approve", "minClass": 6, "maxClass": 10, "reason": "Assessment met the requested subject standards."}, 409)
	_, e = s.C("applications").UpdateOne(ctx, bson.M{"_id": "tutor-a"}, bson.M{"$set": bson.M{"profile.teachingAreas.0.modes": []string{"online", "home"}}})
	if e != nil {
		t.Fatal(e)
	}
	mentor.setTestFees("tutor-a", 0)
	mentor.decide("tutor-a", map[string]any{"action": "approve", "minClass": 6, "maxClass": 10, "reason": "Assessment met the requested subject standards."}, 200)
}
