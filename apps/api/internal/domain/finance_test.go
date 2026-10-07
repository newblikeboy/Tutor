package domain

import (
	"reflect"
	"testing"
	"time"
)

func TestGuaranteedTutorAllocation(t *testing.T) {
	a, err := CalculateFinance(100000, 1800, TaxReview{TDSBase: 100000, TDSBPS: 10, TCSBase: 100000, TCSBPS: 50, GatewayCost: 2360})
	if err != nil {
		t.Fatal(err)
	}
	if a.TutorNet != 75000 || a.Platform != 25000 || a.GST != 3814 || a.TDS != 100 || a.TCS != 500 || a.Revenue != 21186 || a.Contribution != 18226 {
		t.Fatalf("unexpected split: %+v", a)
	}
	// Even costs above platform income must never reduce the promised bank payout.
	b, err := CalculateFinance(100000, 1800, TaxReview{TDSBase: 200000, TDSBPS: 2000, GatewayCost: 100000})
	if err != nil || b.TutorNet != 75000 || b.Contribution >= 0 {
		t.Fatalf("guarantee changed with costs: %+v %v", b, err)
	}
	c, err := CalculateFinance(100000, 1800, TaxReview{TuitionGST: 15254})
	if err != nil || c.TutorNet != 75000 || c.Contribution != 5932 {
		t.Fatalf("tuition tax reduced tutor share: %+v %v", c, err)
	}
}

func TestClassAllocationBalancesEveryPaise(t *testing.T) {
	for gross := int64(100); gross < 1200; gross++ {
		a, err := CalculateFinance(gross, 1800, TaxReview{TDSBase: gross, TDSBPS: 10, TCSBase: gross, TCSBPS: 50, GatewayCost: 3, TuitionGST: 7})
		if err != nil {
			t.Fatal(err)
		}
		for count := 1; count <= 31; count++ {
			sum := FinancialAmounts{}
			for i := 0; i < count; i++ {
				b := AllocateFinance(a, i, count)
				if b.Gross != b.TutorNet+b.GST+b.Revenue || b.Contribution != b.Revenue-b.TDS-b.TCS-b.GatewayCost-b.TuitionGST {
					t.Fatalf("unbalanced class %+v", b)
				}
				sv, bv := reflect.ValueOf(&sum).Elem(), reflect.ValueOf(b)
				for j := 0; j < sv.NumField(); j++ {
					sv.Field(j).SetInt(sv.Field(j).Int() + bv.Field(j).Int())
				}
			}
			if sum != a {
				t.Fatalf("rounding lost money: gross %d count %d: %+v != %+v", gross, count, sum, a)
			}
		}
	}
}

func TestFinanceRejectsUnboundedInputs(t *testing.T) {
	for _, tax := range []TaxReview{{TDSBase: -1}, {TDSBase: 201}, {TDSBPS: 2001}, {TCSBPS: 101}, {GatewayCost: 101}} {
		if _, err := CalculateFinance(100, 1800, tax); err == nil {
			t.Fatalf("accepted invalid tax %+v", tax)
		}
	}
	for _, gross := range []int64{-1, 0, 240000001, 9223372036854775807} {
		if _, err := CalculateFinance(gross, 1800, TaxReview{}); err == nil {
			t.Fatalf("accepted gross %d", gross)
		}
	}
	// A valid package can allocate less than one rupee to an individual class.
	for _, gross := range []int64{1, 8, 99} {
		a, e := CalculateFinance(gross, 1800, TaxReview{})
		if e != nil || a.Gross != a.TutorNet+a.Platform {
			t.Fatalf("small class allocation: %+v %v", a, e)
		}
	}
}

func TestWeeklyPayoutUsesISTWeekBoundary(t *testing.T) {
	for _, tc := range []struct{ at, due string }{
		{"2026-10-04T18:29:59Z", "2026-10-07T03:30:00Z"},
		{"2026-10-04T18:30:00Z", "2026-10-14T03:30:00Z"},
		{"2026-10-07T04:00:00Z", "2026-10-14T03:30:00Z"},
	} {
		at, _ := time.Parse(time.RFC3339, tc.at)
		if got := WeeklyPayoutDue(at).Format(time.RFC3339); got != tc.due {
			t.Fatalf("%s: %s != %s", tc.at, got, tc.due)
		}
	}
}
