package domain

import "testing"

func TestRequestedArea(t *testing.T) {
	p := TutorApplication{TeachingAreas: []RequestedTeachingArea{
		{ID: "science", Subject: "Science", MinClass: 6, MaxClass: 10, Modes: []string{"online", "home"}},
		{ID: "math-online", Subject: "Mathematics", MinClass: 6, MaxClass: 8, Modes: []string{"online"}},
		{ID: "math-home", Subject: "Mathematics", MinClass: 8, MaxClass: 10, Modes: []string{"home"}},
	}}
	for _, tc := range []struct {
		name     string
		min, max int
		modes    []string
		wantID   string
	}{
		{"later online area", 6, 8, []string{"online"}, "math-online"},
		{"later home area", 9, 10, []string{"home"}, "math-home"},
		{"unrequested class range", 6, 10, []string{"online"}, ""},
		{"unrequested mode", 6, 7, []string{"home"}, ""},
		{"cannot combine modes across cards", 8, 8, []string{"online", "home"}, ""},
		{"mode required", 6, 8, nil, ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			area, ok := p.RequestedArea("Mathematics", tc.min, tc.max, tc.modes)
			if ok != (tc.wantID != "") || area.ID != tc.wantID {
				t.Fatalf("area=%q matched=%v, want %q", area.ID, ok, tc.wantID)
			}
		})
	}
}
