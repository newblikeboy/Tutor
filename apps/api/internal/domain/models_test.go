package domain

import (
	"testing"
	"time"
)

func TestEligibilityRequiresActiveScope(t *testing.T) {
	now := time.Now()
	a := Application{Status: "approved", Scope: Scope{Subject: "Mathematics", MinClass: 8, MaxClass: 9, Mode: "online", ExpiresAt: now.Add(time.Hour)}}
	if !Eligible(a, 8, now) {
		t.Fatal("valid approval denied")
	}
	for _, status := range []string{"draft", "submitted", "assessed", "suspended", "revoked", "paused"} {
		a.Status = status
		if Eligible(a, 8, now) {
			t.Fatalf("%s allowed", status)
		}
	}
	a.Status = "approved"
	if Eligible(a, 7, now) || Eligible(a, 10, now) || Eligible(a, 8, now.Add(time.Hour)) {
		t.Fatal("class or explicit expiry bypass")
	}
	a.Scope.Mode = "home"
	if Eligible(a, 8, now) {
		t.Fatal("unimplemented home mode permitted")
	}
}
func TestOverlapHalfOpenAndDayBoundary(t *testing.T) {
	start := time.Date(2026, 9, 23, 23, 30, 0, 0, time.UTC)
	end := start.Add(time.Hour)
	if !Overlap(start, end, start.Add(45*time.Minute), end.Add(time.Hour)) {
		t.Fatal("missed overnight overlap")
	}
	if Overlap(start, end, end, end.Add(time.Hour)) {
		t.Fatal("adjacent intervals conflict")
	}
}
