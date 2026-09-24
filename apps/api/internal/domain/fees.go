package domain

import "time"

// Fee schedules are set by staff, independently of applicant answers and availability.
type FeePlan struct {
	Mode        string `json:"mode" bson:"mode"`
	Period      string `json:"period" bson:"period"`
	AmountPaise int64  `json:"amountPaise" bson:"amountPaise"`
	Classes     int    `json:"classes" bson:"classes"`
	Minutes     int    `json:"minutes" bson:"minutes"`
}

type TutorFees struct {
	Plans   []FeePlan `json:"plans" bson:"plans"`
	Version int       `json:"version" bson:"version"`
	SetBy   string    `json:"setBy" bson:"setBy"`
	SetAt   time.Time `json:"setAt" bson:"setAt"`
}

func (a Application) FeePlans() []FeePlan {
	plans := []FeePlan{}
	if a.Fees != nil {
		for _, plan := range a.Fees.Plans {
			if plan.Mode == a.Scope.Mode {
				plans = append(plans, plan)
			}
		}
	}
	return plans
}

func (a Application) HourlyFee() (FeePlan, bool) {
	for _, plan := range a.FeePlans() {
		if plan.Mode == "online" && plan.Period == "hour" {
			return plan, true
		}
	}
	return FeePlan{}, false
}

func (p FeePlan) LessonFee(minutes int) int64 {
	return (p.AmountPaise*int64(minutes) + 30) / 60
}
