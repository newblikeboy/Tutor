package app

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"tutorplatform/internal/config"
	"tutorplatform/internal/domain"
	"tutorplatform/internal/storage"
)

func TestMongoTutorStudentDistances(t *testing.T) {
	uri := os.Getenv("TEST_MONGODB_URI")
	if uri == "" {
		t.Skip("TEST_MONGODB_URI required")
	}
	t.Setenv("SEED_PASSWORD", testPassword)
	ctx := context.Background()
	s, err := storage.Connect(ctx, uri, "tutor_test_distances_"+token()[:12])
	if err != nil {
		t.Fatal(err)
	}
	defer s.Client.Disconnect(ctx)
	if err = s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	if err = s.Seed(ctx, "test"); err != nil {
		t.Fatal(err)
	}
	a := New(s, config.Config{Env: "test", AuthProvider: "password", Origin: "http://test.local"})
	server := httptest.NewServer(a.Routes())
	defer server.Close()
	client := func(id string) *testClient {
		jar, _ := cookiejar.New(nil)
		c := &testClient{t: t, http: &http.Client{Jar: jar, Timeout: 30 * time.Second}, base: server.URL}
		c.login(id)
		return c
	}
	tutor, parent, other := client("tutor-arjun"), client("parent-a"), client("tutor-meera")
	point := func(lat float64, locality string) *domain.LocationPoint {
		return &domain.LocationPoint{Latitude: lat, Longitude: 87.45, Address: locality + " fictional address", Locality: locality, City: "Purnea", Country: "India", Source: "browser"}
	}
	base := point(25.75, "Original teaching base")
	profile := completeApplication("Arjun sample", a.Now())
	profile.About.Location = base
	scope := domain.Scope{Subject: "Mathematics", Subjects: []string{"Mathematics"}, MinClass: 6, MaxClass: 10, Mode: "online", Modes: []string{"online", "home"}, ExpiresAt: a.Now().AddDate(1, 0, 0)}
	if _, err = s.C("applications").UpdateOne(ctx, bson.M{"_id": "tutor-arjun"}, bson.M{"$set": bson.M{"profile": profile, "scope": scope}}); err != nil {
		t.Fatal(err)
	}
	before, err := storage.One[domain.Application](ctx, s, "applications", bson.M{"_id": "tutor-arjun"})
	if err != nil {
		t.Fatal(err)
	}
	insert := func(col string, v any) {
		if _, e := s.C(col).InsertOne(ctx, v); e != nil {
			t.Fatal(e)
		}
	}
	for _, item := range []domain.Learner{
		{ID: "distance-active", OwnerID: "parent-a", Name: "Assigned student sample", Class: 8, Board: "CBSE", Language: "English", Kind: "adult_self", Version: 1},
		{ID: "distance-trial", OwnerID: "parent-b", Name: "Trial student sample", Class: 8, Board: "CBSE", Language: "English", Kind: "adult_self", Version: 1},
		{ID: "distance-foreign", OwnerID: "parent-a", Name: "Unassigned student sample", Class: 8, Board: "CBSE", Language: "English", Kind: "adult_self", Version: 1},
	} {
		insert("learners", item)
	}
	insert("enrollments", domain.Enrollment{ID: "distance-en", OwnerID: "parent-a", LearnerID: "distance-active", LearnerName: "Assigned student sample", TutorID: "tutor-arjun", Status: "active", Class: 8, Version: 1, Agreement: domain.Agreement{Subject: "Mathematics", Subjects: []string{"Mathematics"}, Mode: "online", Minutes: 60, SessionCount: 6}})
	insert("trials", domain.Trial{ID: "distance-request", OwnerID: "parent-b", LearnerID: "distance-trial", TutorID: "tutor-arjun", MentorID: "mentor-a", LearnerName: "Trial student sample", Subject: "Mathematics", Subjects: []string{"Mathematics"}, Class: 8, Mode: "home", Start: a.Now().Add(time.Hour), End: a.Now().Add(2 * time.Hour), Status: "requested", Version: 1, CreatedAt: a.Now()})
	parent.ok("PUT", "/account", map[string]any{"name": "Sample family A", "language": "en", "version": 0, "location": point(25.76, "Household")}, 200)
	read := func() map[string]map[string]any {
		response := tutor.ok("GET", "/tutor/workspace", nil, 200)
		briefs := map[string]map[string]any{}
		for _, v := range response["briefs"].([]any) {
			b := v.(map[string]any)
			briefs[b["learnerId"].(string)] = b
		}
		if briefs["distance-foreign"] != nil {
			t.Fatal("unassigned household distance exposed")
		}
		return briefs
	}
	briefs := read()
	if briefs["distance-active"]["distanceKm"] != 1.1 || briefs["distance-active"]["location"] != nil {
		t.Fatal("online distance wrong or household coordinates exposed")
	}
	if briefs["distance-trial"]["distanceUnavailable"] != "student_location_missing" {
		t.Fatal("missing student GPS treated as distance")
	}
	account := tutor.ok("GET", "/account", nil, 200)
	if account["preferences"].(map[string]any)["location"].(map[string]any)["latitude"] != 25.75 {
		t.Fatal("initial teaching base not surfaced in account")
	}
	tutor.ok("PUT", "/account", map[string]any{"name": "Arjun sample", "language": "en", "version": 0, "location": point(25.60, "New teaching base")}, 200)
	tutor.ok("PUT", "/account", map[string]any{"name": "Arjun sample", "language": "en", "version": 0, "location": base}, 409)
	briefs = read()
	if briefs["distance-active"]["distanceKm"] != 17.8 {
		t.Fatal("new tutor base did not update distance")
	}
	after, err := storage.One[domain.Application](ctx, s, "applications", bson.M{"_id": "tutor-arjun"})
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(before.Profile, after.Profile) || !reflect.DeepEqual(before.Scope, after.Scope) || !reflect.DeepEqual(before.Fees, after.Fees) {
		t.Fatal("location edit changed application evidence, scope or fees")
	}
	if location, ok := tutorBaseLocation(after); !ok || location.Latitude != 25.60 || after.Public().PublicLocality != "New teaching base" {
		t.Fatal("matching does not use new teaching base")
	}
	near, _, err := a.tutorPage(ctx, bson.M{"_id": "tutor-arjun"}, "", true, 25.61, 87.45, 5)
	if err != nil || len(near) != 1 || near[0].DistanceKM == nil || *near[0].DistanceKM != 1.1 {
		t.Fatal("public Home search did not use changed base")
	}
	far, _, err := a.tutorPage(ctx, bson.M{"_id": "tutor-arjun"}, "", true, 25.76, 87.45, 5)
	if err != nil || len(far) != 0 {
		t.Fatal("old base still accepted for Home radius matching")
	}
	parent.ok("PUT", "/account", map[string]any{"name": "Sample family A", "language": "en", "version": 1, "location": point(25.61, "Changed household")}, 200)
	if read()["distance-active"]["distanceKm"] != 1.1 {
		t.Fatal("household change did not update distance")
	}
	parentB := client("parent-b")
	parentB.ok("PUT", "/account", map[string]any{"name": "Sample family B", "language": "en", "version": 0, "location": point(25.60, "Second household")}, 200)
	briefs = read()
	if briefs["distance-trial"]["distanceKm"] != float64(0) || briefs["distance-trial"]["location"] != nil {
		t.Fatal("same-location distance missing or requested trial revealed home address")
	}
	if _, err = s.C("trials").UpdateOne(ctx, bson.M{"_id": "distance-request"}, bson.M{"$set": bson.M{"status": "confirmed"}}); err != nil {
		t.Fatal(err)
	}
	if read()["distance-trial"]["location"] == nil {
		t.Fatal("confirmed eligible Home address hidden")
	}
	if _, err = s.C("trials").UpdateOne(ctx, bson.M{"_id": "distance-request"}, bson.M{"$set": bson.M{"status": "completed"}}); err != nil {
		t.Fatal(err)
	}
	if read()["distance-trial"] != nil {
		t.Fatal("finished trial exposed current household distance")
	}
	otherRead := other.ok("GET", "/tutor/workspace", nil, 200)
	encoded, _ := json.Marshal(otherRead)
	if strings.Contains(string(encoded), "distance-active") || strings.Contains(string(encoded), "Changed household") {
		t.Fatal("distance leaked to another tutor")
	}
	parent.ok("GET", "/tutor/workspace", nil, 403)
	if _, err = s.C("applications").UpdateOne(ctx, bson.M{"_id": "tutor-arjun"}, bson.M{"$unset": bson.M{"teachingLocation": "", "profile.about.location": ""}}); err != nil {
		t.Fatal(err)
	}
	if read()["distance-active"]["distanceUnavailable"] != "tutor_location_missing" {
		t.Fatal("missing tutor GPS treated as distance")
	}
}
