package app

import "tutorplatform/internal/domain"

func validateFeePlans(a domain.Application, plans []domain.FeePlan) error {
	bad := domain.Fail(422, "fee_plans", "Set an online hourly fee or home packages with 6 weekly classes and 24 monthly classes, including duration.")
	modes := map[string]bool{a.Scope.Mode: a.Scope.Mode != ""}
	if a.Profile != nil {
		for _, area := range a.Profile.TeachingAreas {
			for _, mode := range area.Modes {
				modes[mode] = true
			}
		}
	}
	if len(plans) == 0 || len(plans) > 3 {
		return bad
	}
	seen := map[string]bool{}
	for _, p := range plans {
		key := p.Mode + ":" + p.Period
		if !modes[p.Mode] || seen[key] || p.AmountPaise < 0 || p.AmountPaise > 10_000_000 {
			return bad
		}
		if p.Mode == "online" {
			if p.Period != "hour" || p.Classes != 1 || p.Minutes != 60 {
				return bad
			}
		} else if p.Mode == "home" {
			if !enum(p.Period, "week", "month") || p.Period == "week" && p.Classes != 6 || p.Period == "month" && p.Classes != 24 || p.Minutes < 30 || p.Minutes > 120 {
				return bad
			}
		} else {
			return bad
		}
		seen[key] = true
	}
	if modes["online"] && !seen["online:hour"] || modes["home"] && (!seen["home:week"] || !seen["home:month"]) {
		return bad
	}
	return nil
}
