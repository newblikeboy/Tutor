package app

import (
	"encoding/json"
	"testing"
	"time"
	"tutorplatform/internal/domain"
)

func (tc *testClient) setTestFees(id string, amount int64) {
	tc.t.Helper()
	detail := tc.ok("GET", "/staff/applications/"+id, nil, 200)
	raw, _ := json.Marshal(detail["application"])
	var application domain.Application
	if err := json.Unmarshal(raw, &application); err != nil {
		tc.t.Fatal(err)
	}
	modes := map[string]bool{application.Scope.Mode: true}
	if application.Profile != nil {
		for _, area := range application.Profile.TeachingAreas {
			for _, mode := range area.Modes {
				modes[mode] = true
			}
		}
	}
	plans := []domain.FeePlan{}
	if modes["online"] {
		plans = append(plans, domain.FeePlan{Mode: "online", Period: "hour", AmountPaise: amount, Classes: 1, Minutes: 60})
	}
	if modes["home"] {
		plans = append(plans, domain.FeePlan{Mode: "home", Period: "week", AmountPaise: amount * 3, Classes: 3, Minutes: 60}, domain.FeePlan{Mode: "home", Period: "month", AmountPaise: amount * 12, Classes: 12, Minutes: 60})
	}
	tc.decide(id, map[string]any{"action": "fees", "feePlans": plans}, 200)
}

func TestFeePlanValidationAndPublicScope(t *testing.T) {
	p := completeApplication("Fee fixture", time.Now())
	a := domain.Application{Profile: &p, Scope: domain.Scope{Mode: "online"}}
	plans := []domain.FeePlan{{Mode: "online", Period: "hour", AmountPaise: 50101, Classes: 1, Minutes: 60}, {Mode: "home", Period: "week", AmountPaise: 150000, Classes: 3, Minutes: 60}, {Mode: "home", Period: "month", AmountPaise: 500000, Classes: 12, Minutes: 60}}
	if err := validateFeePlans(a, plans); err != nil {
		t.Fatal(err)
	}
	for name, change := range map[string]func([]domain.FeePlan) []domain.FeePlan{
		"missing home plan": func(p []domain.FeePlan) []domain.FeePlan { return p[:2] },
		"duplicate":         func(p []domain.FeePlan) []domain.FeePlan { p[2] = p[1]; return p },
		"negative":          func(p []domain.FeePlan) []domain.FeePlan { p[0].AmountPaise = -1; return p },
		"fractional hour":   func(p []domain.FeePlan) []domain.FeePlan { p[0].Minutes = 30; return p },
		"home hourly":       func(p []domain.FeePlan) []domain.FeePlan { p[1].Period = "hour"; return p },
		"missing classes":   func(p []domain.FeePlan) []domain.FeePlan { p[1].Classes = 0; return p },
		"weekly capacity":   func(p []domain.FeePlan) []domain.FeePlan { p[1].Classes = 8; return p },
		"short class":       func(p []domain.FeePlan) []domain.FeePlan { p[2].Minutes = 10; return p },
	} {
		t.Run(name, func(t *testing.T) {
			if validateFeePlans(a, change(append([]domain.FeePlan{}, plans...))) == nil {
				t.Fatal("invalid fee accepted")
			}
		})
	}
	a.Fees = &domain.TutorFees{Plans: plans, Version: 1}
	if len(a.FeePlans()) != 1 || a.FeePlans()[0].Period != "hour" {
		t.Fatal("unapproved home fees published")
	}
	a.Scope.Mode = "home"
	if len(a.FeePlans()) != 2 {
		t.Fatal("home weekly and monthly fees missing")
	}
	if _, ok := a.HourlyFee(); ok {
		t.Fatal("home fees treated as online billing")
	}
	if plans[0].LessonFee(30) != 25051 || plans[0].LessonFee(90) != 75152 {
		t.Fatal("hourly fees not rounded to nearest paise")
	}
}
