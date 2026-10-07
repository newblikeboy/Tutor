package domain

import "time"

// Money is always integer paise. Rates are basis points (18% = 1800).
type BusinessSettings struct {
	ID               string    `json:"-" bson:"_id"`
	Version          int       `json:"version" bson:"version"`
	LegalName        string    `json:"legalName" bson:"legalName"`
	Address          string    `json:"address" bson:"address"`
	StateCode        string    `json:"stateCode" bson:"stateCode"`
	GSTIN            string    `json:"gstin" bson:"gstin"`
	SAC              string    `json:"sac" bson:"sac"`
	CommissionGSTBPS int64     `json:"commissionGstBps" bson:"commissionGstBps"`
	TaxPolicy        string    `json:"taxPolicy" bson:"taxPolicy"`
	Reviewed         bool      `json:"reviewed" bson:"reviewed"`
	UpdatedBy        string    `json:"updatedBy" bson:"updatedBy"`
	UpdatedAt        time.Time `json:"updatedAt" bson:"updatedAt"`
}

type FinancialAmounts struct {
	Gross        int64 `json:"grossPaise" bson:"grossPaise"`
	TutorNet     int64 `json:"tutorNetPaise" bson:"tutorNetPaise"`
	Platform     int64 `json:"platformPaise" bson:"platformPaise"`
	GST          int64 `json:"gstPaise" bson:"gstPaise"`
	TuitionGST   int64 `json:"tuitionGstPaise" bson:"tuitionGstPaise"`
	TDS          int64 `json:"tdsPaise" bson:"tdsPaise"`
	TCS          int64 `json:"tcsPaise" bson:"tcsPaise"`
	GatewayCost  int64 `json:"gatewayCostPaise" bson:"gatewayCostPaise"`
	Revenue      int64 `json:"revenuePaise" bson:"revenuePaise"`
	Contribution int64 `json:"contributionPaise" bson:"contributionPaise"`
}

type TaxReview struct {
	TuitionGST  int64  `json:"tuitionGstPaise" bson:"tuitionGstPaise"`
	TDSBase     int64  `json:"tdsBasePaise" bson:"tdsBasePaise"`
	TDSBPS      int64  `json:"tdsBps" bson:"tdsBps"`
	TCSBase     int64  `json:"tcsBasePaise" bson:"tcsBasePaise"`
	TCSBPS      int64  `json:"tcsBps" bson:"tcsBps"`
	GatewayCost int64  `json:"gatewayCostPaise" bson:"gatewayCostPaise"`
	Interstate  bool   `json:"interstate" bson:"interstate"`
	Reason      string `json:"reason" bson:"reason"`
}

type FinanceBooking struct {
	ID           string            `json:"id" bson:"_id"`
	EnrollmentID string            `json:"enrollmentId" bson:"enrollmentId"`
	TutorID      string            `json:"tutorId" bson:"tutorId"`
	TutorName    string            `json:"tutorName" bson:"tutorName"`
	Status       string            `json:"status" bson:"status"`
	Amounts      FinancialAmounts  `json:"amounts" bson:"amounts"`
	Business     *BusinessSettings `json:"business,omitempty" bson:"business,omitempty"`
	Tax          *TaxReview        `json:"tax,omitempty" bson:"tax,omitempty"`
	ReviewedBy   string            `json:"reviewedBy" bson:"reviewedBy"`
	CreatedAt    time.Time         `json:"createdAt" bson:"createdAt"`
}

type ClassEarning struct {
	ID           string           `json:"id" bson:"_id"`
	IntentID     string           `json:"intentId" bson:"intentId"`
	EnrollmentID string           `json:"enrollmentId" bson:"enrollmentId"`
	TutorID      string           `json:"tutorId" bson:"tutorId"`
	Amounts      FinancialAmounts `json:"amounts" bson:"amounts"`
	DueAt        time.Time        `json:"dueAt" bson:"dueAt"`
	EarnedAt     time.Time        `json:"earnedAt" bson:"earnedAt"`
	BatchID      string           `json:"batchId" bson:"batchId"`
}

type EarningHold struct {
	Kind      string    `json:"kind" bson:"kind"`
	Gross     int64     `json:"grossPaise" bson:"grossPaise"`
	ID        string    `json:"id" bson:"_id"`
	IntentID  string    `json:"intentId" bson:"intentId"`
	TutorID   string    `json:"tutorId" bson:"tutorId"`
	Reason    string    `json:"reason" bson:"reason"`
	UpdatedAt time.Time `json:"updatedAt" bson:"updatedAt"`
}

type ClassTaxReview struct {
	ID         string           `json:"id" bson:"_id"`
	TutorID    string           `json:"tutorId" bson:"tutorId"`
	Amounts    FinancialAmounts `json:"amounts" bson:"amounts"`
	Tax        TaxReview        `json:"tax" bson:"tax"`
	Business   BusinessSettings `json:"business" bson:"business"`
	ReviewedBy string           `json:"reviewedBy" bson:"reviewedBy"`
	ReviewedAt time.Time        `json:"reviewedAt" bson:"reviewedAt"`
}

type PayoutBatch struct {
	ID          string     `json:"id" bson:"_id"`
	TutorID     string     `json:"tutorId" bson:"tutorId"`
	Amount      int64      `json:"amountPaise" bson:"amountPaise"`
	ClassIDs    []string   `json:"classIds" bson:"classIds"`
	Status      string     `json:"status" bson:"status"`
	CreatedBy   string     `json:"createdBy" bson:"createdBy"`
	Reference   string     `json:"reference" bson:"reference"`
	RecordedBy  string     `json:"recordedBy" bson:"recordedBy"`
	ConfirmedBy string     `json:"confirmedBy" bson:"confirmedBy"`
	CreatedAt   time.Time  `json:"createdAt" bson:"createdAt"`
	PaidAt      *time.Time `json:"paidAt,omitempty" bson:"paidAt,omitempty"`
}

func CalculateFinance(gross, gstBPS int64, tax TaxReview) (FinancialAmounts, error) {
	if gross < 1 || gross > 240000000 || gstBPS < 0 || gstBPS > 2800 || tax.TuitionGST < 0 || tax.TuitionGST > gross || tax.TDSBase < 0 || tax.TDSBase > gross*2 || tax.TCSBase < 0 || tax.TCSBase > gross*2 || tax.TDSBPS < 0 || tax.TDSBPS > 2000 || tax.TCSBPS < 0 || tax.TCSBPS > 100 || tax.GatewayCost < 0 || tax.GatewayCost > gross {
		return FinancialAmounts{}, Fail(422, "tax_amount", "Check the tax bases, rates and actual gateway cost.")
	}
	a := FinancialAmounts{Gross: gross, TutorNet: (gross*75 + 50) / 100, GatewayCost: tax.GatewayCost, TuitionGST: tax.TuitionGST}
	a.Platform = gross - a.TutorNet
	a.GST = (a.Platform*gstBPS + (10000+gstBPS)/2) / (10000 + gstBPS)
	a.TDS = (tax.TDSBase*tax.TDSBPS + 5000) / 10000
	a.TCS = (tax.TCSBase*tax.TCSBPS + 5000) / 10000
	a.Revenue = a.Platform - a.GST
	a.Contribution = a.Revenue - a.TDS - a.TCS - a.GatewayCost - a.TuitionGST
	return a, nil
}

// Allocate cumulative rounding differences so each class balances and totals are exact.
func AllocateFinance(a FinancialAmounts, index, count int) FinancialAmounts {
	part := func(n int64) int64 { return n*int64(index+1)/int64(count) - n*int64(index)/int64(count) }
	b := FinancialAmounts{Gross: part(a.Gross), TutorNet: part(a.TutorNet), GST: part(a.GST), TDS: part(a.TDS), TCS: part(a.TCS), GatewayCost: part(a.GatewayCost), TuitionGST: part(a.TuitionGST)}
	b.Platform = b.Gross - b.TutorNet
	b.Revenue = b.Platform - b.GST
	b.Contribution = b.Revenue - b.TDS - b.TCS - b.GatewayCost - b.TuitionGST
	return b
}

// Wednesday 09:00 IST after the service/review week ends on Sunday.
func WeeklyPayoutDue(at time.Time) time.Time {
	ist := time.FixedZone("IST", 19800)
	d := at.In(ist)
	monday := time.Date(d.Year(), d.Month(), d.Day(), 0, 0, 0, 0, ist).AddDate(0, 0, -((int(d.Weekday()) + 6) % 7))
	return monday.AddDate(0, 0, 9).Add(9 * time.Hour).UTC()
}
