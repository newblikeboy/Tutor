package domain

import "time"

type WeeklyWindow struct {
	Day         int `json:"day" bson:"day"`
	StartMinute int `json:"startMinute" bson:"startMinute"`
	EndMinute   int `json:"endMinute" bson:"endMinute"`
}
type Availability struct {
	ID            string         `json:"tutorId" bson:"_id"`
	Timezone      string         `json:"timezone" bson:"timezone"`
	Windows       []WeeklyWindow `json:"windows" bson:"windows"`
	LeaveDates    []string       `json:"leaveDates" bson:"leaveDates"`
	BufferMinutes int            `json:"bufferMinutes" bson:"bufferMinutes"`
	DailyCapacity int            `json:"dailyCapacity" bson:"dailyCapacity"`
	Paused        bool           `json:"paused" bson:"paused"`
	FeePaise      int64          `json:"feePaise" bson:"feePaise"`
	Version       int            `json:"version" bson:"version"`
}
type Agreement struct {
	ID                 string      `json:"id" bson:"_id"`
	EnrollmentID       string      `json:"enrollmentId" bson:"enrollmentId"`
	Version            int         `json:"version" bson:"version"`
	TutorID            string      `json:"tutorId" bson:"tutorId"`
	Subject            string      `json:"subject" bson:"subject"`
	Mode               string      `json:"mode" bson:"mode"`
	Timezone           string      `json:"timezone" bson:"timezone"`
	SessionCount       int         `json:"sessionCount" bson:"sessionCount"`
	Minutes            int         `json:"minutes" bson:"minutes"`
	Starts             []time.Time `json:"starts" bson:"starts"`
	FeePerSessionPaise int64       `json:"feePerSessionPaise" bson:"feePerSessionPaise"`
	TotalPaise         int64       `json:"totalPaise" bson:"totalPaise"`
	Currency           string      `json:"currency" bson:"currency"`
	CancellationHours  int         `json:"cancellationHours" bson:"cancellationHours"`
	Terms              string      `json:"terms" bson:"terms"`
	TermsVersion       string      `json:"termsVersion" bson:"termsVersion"`
	CreatedAt          time.Time   `json:"createdAt" bson:"createdAt"`
}
type Enrollment struct {
	PaymentIntentID string     `json:"paymentIntentId" bson:"paymentIntentId"`
	ID              string     `json:"id" bson:"_id"`
	OwnerID         string     `json:"-" bson:"ownerId"`
	TrialID         string     `json:"trialId" bson:"trialId"`
	LearnerID       string     `json:"learnerId" bson:"learnerId"`
	LearnerName     string     `json:"learnerName" bson:"learnerName"`
	Class           int        `json:"class" bson:"class"`
	TutorID         string     `json:"tutorId" bson:"tutorId"`
	TutorName       string     `json:"tutorName" bson:"tutorName"`
	MentorID        string     `json:"mentorId" bson:"mentorId"`
	Status          string     `json:"status" bson:"status"`
	Agreement       Agreement  `json:"agreement" bson:"agreement"`
	PlanVersion     int        `json:"planVersion" bson:"planVersion"`
	Version         int        `json:"version" bson:"version"`
	HoldUntil       *time.Time `json:"holdUntil" bson:"holdUntil"`
	CreatedAt       time.Time  `json:"createdAt" bson:"createdAt"`
}
type ClassSession struct {
	ID            string            `json:"id" bson:"_id"`
	EnrollmentID  string            `json:"enrollmentId" bson:"enrollmentId"`
	TutorID       string            `json:"tutorId" bson:"tutorId"`
	Start         time.Time         `json:"start" bson:"start"`
	End           time.Time         `json:"end" bson:"end"`
	BufferMinutes int               `json:"bufferMinutes" bson:"bufferMinutes"`
	Status        string            `json:"status" bson:"status"`
	Timezone      string            `json:"timezone" bson:"timezone"`
	Notes         string            `json:"notes" bson:"notes"`
	Homework      string            `json:"homework" bson:"homework"`
	Review        string            `json:"review" bson:"review"`
	Attendance    string            `json:"attendance" bson:"attendance"`
	Reason        string            `json:"reason" bson:"reason"`
	Version       int               `json:"version" bson:"version"`
	Proposal      *ScheduleProposal `json:"proposal" bson:"proposal"`
}
type ScheduleProposal struct {
	Start  time.Time `json:"start" bson:"start"`
	By     string    `json:"by" bson:"by"`
	Reason string    `json:"reason" bson:"reason"`
}
type LearningTopic struct {
	Title    string `json:"title" bson:"title"`
	Status   string `json:"status" bson:"status"`
	Evidence string `json:"evidence" bson:"evidence"`
	Practice string `json:"practice" bson:"practice"`
}
type LearningPlan struct {
	ID            string          `json:"id" bson:"_id"`
	EnrollmentID  string          `json:"enrollmentId" bson:"enrollmentId"`
	Version       int             `json:"version" bson:"version"`
	StartingPoint string          `json:"startingPoint" bson:"startingPoint"`
	Goals         string          `json:"goals" bson:"goals"`
	Topics        []LearningTopic `json:"topics" bson:"topics"`
	NextSteps     string          `json:"nextSteps" bson:"nextSteps"`
	ReviewDate    time.Time       `json:"reviewDate" bson:"reviewDate"`
	AuthorID      string          `json:"authorId" bson:"authorId"`
	CreatedAt     time.Time       `json:"createdAt" bson:"createdAt"`
}
type Handover struct {
	ID              string    `json:"id" bson:"_id"`
	EnrollmentID    string    `json:"enrollmentId" bson:"enrollmentId"`
	OldTutorID      string    `json:"oldTutorId" bson:"oldTutorId"`
	NewTutorID      string    `json:"newTutorId" bson:"newTutorId"`
	Reason          string    `json:"reason" bson:"reason"`
	NextSteps       string    `json:"nextSteps" bson:"nextSteps"`
	Status          string    `json:"status" bson:"status"`
	FamilyConsentAt time.Time `json:"familyConsentAt" bson:"familyConsentAt"`
	CreatedAt       time.Time `json:"createdAt" bson:"createdAt"`
}
type TuitionDetail struct {
	Enrollment Enrollment     `json:"enrollment"`
	Sessions   []ClassSession `json:"sessions"`
	Plans      []LearningPlan `json:"plans"`
	Agreements []Agreement    `json:"agreements"`
	Handovers  []Handover     `json:"handovers"`
	Remaining  int            `json:"remaining"`
	Delivered  int            `json:"delivered"`
}
