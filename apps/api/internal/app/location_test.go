package app

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"tutorplatform/internal/config"
	"tutorplatform/internal/storage"
)

type locationTransport func(*http.Request) (*http.Response, error)

func (f locationTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestMongoGoogleLocation(t *testing.T) {
	uri := os.Getenv("TEST_MONGODB_URI")
	if uri == "" {
		t.Skip("TEST_MONGODB_URI required")
	}
	ctx := context.Background()
	s, err := storage.Connect(ctx, uri, "tutor_test_location_"+token()[:12])
	if err != nil {
		t.Fatal(err)
	}
	defer s.Client.Disconnect(ctx)
	if err = s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	a := New(s, config.Config{GoogleMapsAPIKey: "test-google-key"})
	previous := http.DefaultClient
	t.Cleanup(func() { http.DefaultClient = previous })
	response := `{"status":"OK","results":[{"formatted_address":"Sample home, Purnea, Bihar 854301, India","address_components":[{"long_name":"Sample home","types":["sublocality_level_1"]},{"long_name":"Purnea","types":["locality","administrative_area_level_3"]},{"long_name":"Bihar","types":["administrative_area_level_1"]},{"long_name":"India","types":["country"]},{"long_name":"854301","types":["postal_code"]}]}]}`
	calls := 0
	http.DefaultClient = &http.Client{Transport: locationTransport(func(r *http.Request) (*http.Response, error) {
		calls++
		if r.URL.Host != "maps.googleapis.com" || r.URL.Path != "/maps/api/geocode/json" || r.URL.Query().Get("key") != "test-google-key" || r.URL.Query().Get("language") != "en" || r.URL.Query().Get("latlng") != "25.7700000,87.4700000" {
			t.Fatal("unexpected geocoding request")
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(response)), Header: http.Header{}}, nil
	})}
	request := func(query string, status int) *httptest.ResponseRecorder {
		r := httptest.NewRequest("GET", "/api/v1/location/reverse?"+query, nil)
		w := httptest.NewRecorder()
		a.reverseLocation(w, r)
		if w.Code != status {
			t.Fatalf("status %d, wanted %d: %s", w.Code, status, w.Body.String())
		}
		return w
	}
	query := "latitude=25.77&longitude=87.47&accuracyMeters=30"
	w := request(query, 200)
	var location reverseLocationResponse
	if err := json.Unmarshal(w.Body.Bytes(), &location); err != nil {
		t.Fatal(err)
	}
	if location.City != "Purnea" || location.State != "Bihar" || location.PostalCode != "854301" || location.Address != "Sample home, Purnea, Bihar 854301, India" || location.Latitude != 25.77 || location.AccuracyMeters != 30 {
		t.Fatal("resolved address/coordinates lost")
	}
	for _, body := range []string{`{"status":"REQUEST_DENIED"}`, `{"status":"ZERO_RESULTS","results":[]}`, `{"status":"OK","results":[{}]}`, `invalid JSON`} {
		response = body
		before := calls
		w := request(query, 503)
		if calls != before+1 || strings.Contains(w.Body.String(), "Near current location") || strings.Contains(w.Body.String(), "test-google-key") {
			t.Fatal("provider failure fell back or leaked credentials")
		}
	}
	a.Config.GoogleMapsAPIKey = ""
	before := calls
	request(query, 503)
	request("latitude=NaN&longitude=87.47", 422)
	request("latitude=25.77&longitude=Inf", 422)
	if calls != before {
		t.Fatal("invalid or unconfigured lookup called provider")
	}
}
