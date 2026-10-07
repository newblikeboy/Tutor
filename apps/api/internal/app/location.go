package app

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
	"tutorplatform/internal/domain"
)

type reverseLocationResponse struct {
	domain.LocationPoint
	Location  string `json:"location"`
	Primary   string `json:"primary"`
	Secondary string `json:"secondary"`
}

type googleGeocodeResponse struct {
	Status  string `json:"status"`
	Results []struct {
		FormattedAddress  string `json:"formatted_address"`
		AddressComponents []struct {
			LongName string   `json:"long_name"`
			Types    []string `json:"types"`
		} `json:"address_components"`
	} `json:"results"`
}

func (a *App) reverseLocation(w http.ResponseWriter, r *http.Request) {
	lat, e := queryCoordinate(r, "latitude", -90, 90)
	if e != nil {
		a.error(w, r, domain.Fail(422, "validation", "Latitude must be between -90 and 90."))
		return
	}
	lng, e := queryCoordinate(r, "longitude", -180, 180)
	if e != nil {
		a.error(w, r, domain.Fail(422, "validation", "Longitude must be between -180 and 180."))
		return
	}
	rateKey := "location-ip:" + r.RemoteAddr
	if u, ok := r.Context().Value(identityKey{}).(domain.User); ok && u.ID != "" {
		rateKey = "location:" + u.ID
	}
	if e = a.rate(r.Context(), rateKey, 20); e != nil {
		a.error(w, r, e)
		return
	}
	accuracy, _ := strconv.ParseFloat(strings.TrimSpace(r.URL.Query().Get("accuracyMeters")), 64)
	if math.IsNaN(accuracy) || math.IsInf(accuracy, 0) || accuracy < 0 || accuracy > 100000 {
		accuracy = 0
	}
	if strings.TrimSpace(a.Config.GoogleMapsAPIKey) == "" {
		a.error(w, r, domain.Fail(503, "location_unavailable", "Address lookup is unavailable. Please try again later."))
		return
	}
	out, e := reverseWithGoogle(r.Context(), lat, lng, a.Config.GoogleMapsAPIKey)
	if e != nil || out.Location == "" {
		a.error(w, r, domain.Fail(503, "location_unavailable", "Your address could not be resolved. Please try again."))
		return
	}
	out.Latitude = lat
	out.Longitude = lng
	out.AccuracyMeters = accuracy
	out.Source = "browser"
	if out.Address == "" {
		out.Address = out.Location
	}
	if out.Locality == "" {
		out.Locality = out.Primary
	}
	a.json(w, 200, out)
}

func queryCoordinate(r *http.Request, key string, min, max float64) (float64, error) {
	value, e := strconv.ParseFloat(strings.TrimSpace(r.URL.Query().Get(key)), 64)
	if e != nil || math.IsNaN(value) || math.IsInf(value, 0) || value < min || value > max {
		return 0, fmt.Errorf("invalid %s", key)
	}
	return value, nil
}

func reverseWithGoogle(ctx context.Context, latitude, longitude float64, key string) (reverseLocationResponse, error) {
	ctx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()
	query := url.Values{}
	query.Set("latlng", fmt.Sprintf("%.7f,%.7f", latitude, longitude))
	query.Set("key", key)
	query.Set("language", "en")
	req, e := http.NewRequestWithContext(ctx, http.MethodGet, "https://maps.googleapis.com/maps/api/geocode/json?"+query.Encode(), nil)
	if e != nil {
		return reverseLocationResponse{}, e
	}
	res, e := http.DefaultClient.Do(req)
	if e != nil {
		return reverseLocationResponse{}, e
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return reverseLocationResponse{}, fmt.Errorf("google geocode status %d", res.StatusCode)
	}
	var payload googleGeocodeResponse
	if e = json.NewDecoder(io.LimitReader(res.Body, 1<<20)).Decode(&payload); e != nil {
		return reverseLocationResponse{}, e
	}
	if payload.Status != "OK" || len(payload.Results) == 0 {
		return reverseLocationResponse{}, fmt.Errorf("google geocode returned %s", payload.Status)
	}
	return buildGoogleLocation(payload.Results[0]), nil
}

func buildGoogleLocation(result struct {
	FormattedAddress  string `json:"formatted_address"`
	AddressComponents []struct {
		LongName string   `json:"long_name"`
		Types    []string `json:"types"`
	} `json:"address_components"`
}) reverseLocationResponse {
	component := func(wanted ...string) string {
		for _, part := range result.AddressComponents {
			for _, kind := range wanted {
				if hasString(part.Types, kind) && strings.TrimSpace(part.LongName) != "" {
					return strings.TrimSpace(part.LongName)
				}
			}
		}
		return ""
	}
	primary := firstNonEmpty(
		component("neighborhood"),
		component("sublocality_level_2"),
		component("sublocality_level_1"),
		component("sublocality"),
		component("locality"),
		component("administrative_area_level_3"),
	)
	if primary == "" && result.FormattedAddress != "" {
		primary = strings.TrimSpace(strings.Split(result.FormattedAddress, ",")[0])
	}
	secondaryParts := uniqueNonEmpty(
		component("locality"),
		component("administrative_area_level_3"),
		component("administrative_area_level_2"),
		component("administrative_area_level_1"),
		component("country"),
	)
	secondaryParts = removeString(secondaryParts, primary)
	parts := append([]string{primary}, secondaryParts...)
	location := strings.Join(uniqueNonEmpty(parts...), ", ")
	return reverseLocationResponse{
		LocationPoint: domain.LocationPoint{
			Address:    strings.TrimSpace(result.FormattedAddress),
			Locality:   primary,
			City:       component("locality"),
			District:   firstNonEmpty(component("administrative_area_level_3"), component("administrative_area_level_2")),
			State:      component("administrative_area_level_1"),
			Country:    component("country"),
			PostalCode: component("postal_code"),
		},
		Location:  location,
		Primary:   primary,
		Secondary: strings.Join(secondaryParts, ", "),
	}
}

func cleanLocationPoint(p *domain.LocationPoint) *domain.LocationPoint {
	if p == nil {
		return nil
	}
	p.Address = limitClean(p.Address, 500)
	p.Locality = limitClean(p.Locality, 120)
	p.City = limitClean(p.City, 120)
	p.District = limitClean(p.District, 120)
	p.State = limitClean(p.State, 120)
	p.Country = limitClean(p.Country, 80)
	p.PostalCode = limitClean(p.PostalCode, 20)
	p.Source = limitClean(p.Source, 40)
	if p.Latitude < -90 || p.Latitude > 90 || p.Longitude < -180 || p.Longitude > 180 {
		return nil
	}
	if p.AccuracyMeters < 0 || p.AccuracyMeters > 100000 {
		p.AccuracyMeters = 0
	}
	if p.Address == "" && p.Locality == "" && p.City == "" && p.Latitude == 0 && p.Longitude == 0 {
		return nil
	}
	if p.Address == "" {
		p.Address = limitClean(strings.Join(uniqueNonEmpty(p.Locality, p.City, p.District, p.State, p.Country), ", "), 500)
	}
	if p.Locality == "" {
		p.Locality = limitClean(firstNonEmpty(p.City, p.Address), 120)
	}
	if p.Source == "" {
		p.Source = "manual"
	}
	return p
}

func limitClean(value string, max int) string {
	value = clean(value)
	runes := []rune(value)
	if len(runes) <= max {
		return value
	}
	return strings.TrimSpace(string(runes[:max]))
}

func validLocationPoint(p *domain.LocationPoint) bool {
	if p == nil {
		return true
	}
	return p.Latitude >= -90 && p.Latitude <= 90 &&
		p.Longitude >= -180 && p.Longitude <= 180 &&
		len([]rune(p.Address)) <= 500 &&
		len([]rune(p.Locality)) <= 120 &&
		len([]rune(p.City)) <= 120 &&
		len([]rune(p.District)) <= 120 &&
		len([]rune(p.State)) <= 120 &&
		len([]rune(p.Country)) <= 80 &&
		len([]rune(p.PostalCode)) <= 20 &&
		len([]rune(p.Source)) <= 40 &&
		p.AccuracyMeters >= 0 &&
		p.AccuracyMeters <= 100000
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func uniqueNonEmpty(values ...string) []string {
	seen := make(map[string]struct{}, len(values))
	out := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		key := strings.ToLower(trimmed)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, trimmed)
	}
	return out
}

func removeString(values []string, blocked string) []string {
	blocked = strings.ToLower(strings.TrimSpace(blocked))
	if blocked == "" {
		return values
	}
	out := values[:0]
	for _, value := range values {
		if strings.ToLower(strings.TrimSpace(value)) != blocked {
			out = append(out, value)
		}
	}
	return out
}

func hasString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
