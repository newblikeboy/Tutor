package domain

import "time"

type Interview struct {
	Start      time.Time `json:"start" bson:"start"`
	End        time.Time `json:"end" bson:"end"`
	Timezone   string    `json:"timezone" bson:"timezone"`
	JoinURL    string    `json:"joinUrl" bson:"joinUrl"`
	Status     string    `json:"status" bson:"status"`
	Provider   string    `json:"provider,omitempty" bson:"provider,omitempty"`
	SyncStatus string    `json:"syncStatus,omitempty" bson:"syncStatus,omitempty"`
	MeetingID  string    `json:"-" bson:"meetingId,omitempty"`
	JobID      string    `json:"-" bson:"jobId,omitempty"`
	HostKey    string    `json:"-" bson:"hostKey,omitempty"`
}

type StaffEvent struct {
	Event       `bson:",inline"`
	ActorName   string             `json:"actorName" bson:"actorName"`
	Reason      string             `json:"reason" bson:"reason"`
	FromStatus  string             `json:"fromStatus" bson:"fromStatus"`
	ToStatus    string             `json:"toStatus" bson:"toStatus"`
	Interview   *Interview         `json:"interview" bson:"interview,omitempty"`
	Scores      []int              `json:"scores" bson:"scores"`
	Evidence    string             `json:"evidence" bson:"evidence"`
	Scope       *Scope             `json:"scope" bson:"scope,omitempty"`
	Eligibility *EligibilityReview `json:"eligibility" bson:"eligibility,omitempty"`
	Fees        *TutorFees         `json:"fees" bson:"fees,omitempty"`
}

func (a Application) AcademicMentor() string {
	if a.MentorID != "" {
		return a.MentorID
	}
	return a.AssessorID
}

type StaffMember struct {
	ID     string `json:"id" bson:"_id"`
	Name   string `json:"name" bson:"name"`
	Role   string `json:"role" bson:"role"`
	Status string `json:"status" bson:"status,omitempty"`
}

type AdminFamily struct {
	ParentID          string            `json:"parentId"`
	ParentName        string            `json:"parentName"`
	ParentEmail       string            `json:"parentEmail"`
	Sample            bool              `json:"sample"`
	Learners          []Learner         `json:"learners"`
	Enrollments       []AdminEnrollment `json:"enrollments"`
	EnrollmentStatus  map[string]int64  `json:"enrollmentStatus"`
	PaidEnrollments   int64             `json:"paidEnrollments"`
	UnpaidEnrollments int64             `json:"unpaidEnrollments"`
}

type AdminEnrollment struct {
	ID           string `json:"id"`
	LearnerID    string `json:"learnerId"`
	LearnerName  string `json:"learnerName"`
	TutorID      string `json:"tutorId"`
	TutorName    string `json:"tutorName"`
	MentorID     string `json:"mentorId"`
	MentorName   string `json:"mentorName"`
	Status       string `json:"status"`
	PaymentState string `json:"paymentState"`
	AmountPaise  int64  `json:"amountPaise"`
}

type FounderRevenue struct {
	GrossPaise    int64 `json:"grossPaise"`
	RefundedPaise int64 `json:"refundedPaise"`
	NetPaise      int64 `json:"netPaise"`
}

type FinanceMonth struct {
	Month         string `json:"month"`
	GrossPaise    int64  `json:"grossPaise"`
	RefundedPaise int64  `json:"refundedPaise"`
	NetPaise      int64  `json:"netPaise"`
	Payments      int64  `json:"payments"`
}

type FounderReport struct {
	Metrics          map[string]int64 `json:"metrics"`
	TutorStatus      map[string]int64 `json:"tutorStatus"`
	MentorStatus     map[string]int64 `json:"mentorStatus"`
	EnrollmentStatus map[string]int64 `json:"enrollmentStatus"`
	RefundStatus     map[string]int64 `json:"refundStatus"`
	Revenue          FounderRevenue   `json:"revenue"`
	MonthlyRevenue   []FinanceMonth   `json:"monthlyRevenue"`
}

type MentorAcademicReport struct {
	Metrics     map[string]int64         `json:"metrics"`
	Tutors      []MentorTutorReport      `json:"tutors"`
	Assignments []MentorAssignmentReport `json:"assignments"`
}

type MentorTutorReport struct {
	TutorID         string `json:"tutorId"`
	TutorName       string `json:"tutorName"`
	Status          string `json:"status"`
	ActiveLearners  int64  `json:"activeLearners"`
	ReviewedClasses int64  `json:"reviewedClasses"`
	MissedClasses   int64  `json:"missedClasses"`
	AwaitingReviews int64  `json:"awaitingReviews"`
}

type MentorAssignmentReport struct {
	EnrollmentID     string `json:"enrollmentId"`
	LearnerName      string `json:"learnerName"`
	TutorID          string `json:"tutorId"`
	TutorName        string `json:"tutorName"`
	Status           string `json:"status"`
	PlanVersion      int    `json:"planVersion"`
	DeliveredClasses int64  `json:"deliveredClasses"`
	RemainingClasses int64  `json:"remainingClasses"`
	NextReviewDate   string `json:"nextReviewDate"`
}

type TutorFollowup struct {
	ID          string    `json:"id" bson:"_id"`
	Kind        string    `json:"-" bson:"kind"`
	Status      string    `json:"status" bson:"status"`
	TutorID     string    `json:"tutorId" bson:"tutorId"`
	TutorName   string    `json:"tutorName" bson:"tutorName"`
	Reason      string    `json:"reason" bson:"reason"`
	Resolution  string    `json:"resolution" bson:"resolution"`
	Version     int       `json:"version" bson:"version"`
	AvailableAt time.Time `json:"createdAt" bson:"availableAt"`
	Attempts    int       `json:"-" bson:"attempts"`
	Trials      int64     `json:"trials" bson:"-"`
	Enrollments int64     `json:"enrollments" bson:"-"`
}
