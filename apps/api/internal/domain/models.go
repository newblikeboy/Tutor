package domain

import "time"

type User struct {
	ID          string `json:"id" bson:"_id"`
	Name        string `json:"name" bson:"name"`
	Email       string `json:"email,omitempty" bson:"email,omitempty"`
	Role        string `json:"role" bson:"role"`
	Sample      bool   `json:"sample" bson:"sample"`
	AuthVersion int    `json:"-" bson:"authVersion"`
}
type Scope struct {
	Subject   string    `json:"subject" bson:"subject"`
	MinClass  int       `json:"minClass" bson:"minClass"`
	MaxClass  int       `json:"maxClass" bson:"maxClass"`
	Mode      string    `json:"mode" bson:"mode"`
	ExpiresAt time.Time `json:"expiresAt" bson:"expiresAt"`
}
type Application struct {
	ID            string              `json:"id" bson:"_id"`
	Name          string              `json:"name" bson:"name"`
	Education     string              `json:"education" bson:"education"`
	Approach      string              `json:"approach" bson:"approach"`
	Language      string              `json:"language" bson:"language"`
	Experience    int                 `json:"experience" bson:"experience"`
	Status        string              `json:"status" bson:"status"`
	Scope         Scope               `json:"scope" bson:"scope"`
	AssessorID    string              `json:"assessorId" bson:"assessorId"`
	MentorID      string              `json:"mentorId" bson:"mentorId"`
	AssessmentAt  time.Time           `json:"assessmentAt" bson:"assessmentAt"`
	Scores        []int               `json:"scores" bson:"scores"`
	Reason        string              `json:"reason" bson:"reason"`
	Evidence      string              `json:"evidence" bson:"evidence"`
	Sample        bool                `json:"sample" bson:"sample"`
	UpdatedAt     time.Time           `json:"updatedAt" bson:"updatedAt"`
	Version       int                 `json:"version" bson:"version"`
	Interview     *Interview          `json:"interview" bson:"interview,omitempty"`
	ConflictClear bool                `json:"conflictClear" bson:"conflictClear"`
	Profile       *TutorApplication   `json:"profile" bson:"profile,omitempty"`
	FormVersion   int                 `json:"formVersion" bson:"formVersion"`
	FormStep      int                 `json:"formStep" bson:"formStep"`
	Submission    *ApplicationReceipt `json:"submission" bson:"submission,omitempty"`
	Eligibility   *EligibilityReview  `json:"eligibility" bson:"eligibility,omitempty"`
	Fees          *TutorFees          `json:"fees" bson:"fees,omitempty"`
	Attachments   []PrivateFile       `json:"-" bson:"attachments,omitempty"`
}
type PublicTutor struct {
	FeePlans     []FeePlan `json:"feePlans"`
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Approach     string    `json:"approach"`
	Language     string    `json:"language"`
	Experience   int       `json:"experience"`
	Scope        Scope     `json:"scope"`
	AssessmentAt time.Time `json:"assessmentAt"`
	Sample       bool      `json:"sample"`
}

func (a Application) Public() PublicTutor {
	return PublicTutor{a.FeePlans(), a.ID, a.Name, a.Approach, a.Language, a.Experience, a.Scope, a.AssessmentAt, a.Sample}
}

type Consent struct {
	ID           string    `json:"id" bson:"_id"`
	OwnerID      string    `json:"ownerId" bson:"ownerId"`
	Relationship string    `json:"relationship" bson:"relationship"`
	Version      string    `json:"version" bson:"version"`
	At           time.Time `json:"at" bson:"at"`
	Verification string    `json:"verification" bson:"verification"`
}
type Learner struct {
	ID        string `json:"id" bson:"_id"`
	OwnerID   string `json:"-" bson:"ownerId"`
	Name      string `json:"name" bson:"name"`
	Class     int    `json:"class" bson:"class"`
	Board     string `json:"board" bson:"board"`
	Language  string `json:"language" bson:"language"`
	Kind      string `json:"kind" bson:"kind"`
	ConsentID string `json:"-" bson:"consentId"`
}
type Requirement struct {
	ID        string    `json:"id" bson:"_id"`
	OwnerID   string    `json:"-" bson:"ownerId"`
	LearnerID string    `json:"learnerId" bson:"learnerId"`
	Subject   string    `json:"subject" bson:"subject"`
	Goal      string    `json:"goal" bson:"goal"`
	Locality  string    `json:"locality" bson:"locality"`
	Status    string    `json:"status" bson:"status"`
	CreatedAt time.Time `json:"createdAt" bson:"createdAt"`
}
type Trial struct {
	ScheduleTimezone string     `json:"-" bson:"scheduleTimezone,omitempty"`
	BufferMinutes    int        `json:"-" bson:"bufferMinutes,omitempty"`
	ID               string     `json:"id" bson:"_id"`
	OwnerID          string     `json:"-" bson:"ownerId"`
	LearnerID        string     `json:"learnerId" bson:"learnerId"`
	RequirementID    string     `json:"requirementId" bson:"requirementId"`
	TutorID          string     `json:"tutorId" bson:"tutorId"`
	MentorID         string     `json:"mentorId" bson:"mentorId"`
	LearnerName      string     `json:"learnerName" bson:"learnerName"`
	Subject          string     `json:"subject" bson:"subject"`
	Class            int        `json:"class" bson:"class"`
	Start            time.Time  `json:"start" bson:"start"`
	End              time.Time  `json:"end" bson:"end"`
	Status           string     `json:"status" bson:"status"`
	FeePaise         int64      `json:"feePaise" bson:"feePaise"`
	TermsVersion     string     `json:"termsVersion" bson:"termsVersion"`
	Terms            string     `json:"terms" bson:"terms"`
	Notes            string     `json:"notes" bson:"notes"`
	NextSteps        string     `json:"nextSteps" bson:"nextSteps"`
	Review           string     `json:"review" bson:"review"`
	ReviewAt         *time.Time `json:"reviewAt,omitempty" bson:"reviewAt,omitempty"`
	CreatedAt        time.Time  `json:"createdAt" bson:"createdAt"`
}
type Draft struct {
	ID        string `json:"-" bson:"_id"`
	Step      int    `json:"step" bson:"step"`
	LearnerID string `json:"learnerId" bson:"learnerId"`
	Goal      string `json:"goal" bson:"goal"`
	Locality  string `json:"locality" bson:"locality"`
}
type Event struct {
	ID     string    `json:"id" bson:"_id"`
	Actor  string    `json:"actor" bson:"actor"`
	Action string    `json:"action" bson:"action"`
	Target string    `json:"target" bson:"target"`
	At     time.Time `json:"at" bson:"at"`
}
type Dashboard struct {
	User         User          `json:"user"`
	Learners     []Learner     `json:"learners"`
	Requirements []Requirement `json:"requirements"`
	Trials       []Trial       `json:"trials"`
	Applications []Application `json:"applications"`
	Events       []Event       `json:"events"`
	Draft        *Draft        `json:"draft"`
}
type Fault struct {
	Status  int
	Code    string
	Message string
}

func (f *Fault) Error() string                    { return f.Message }
func Fail(status int, code, message string) error { return &Fault{status, code, message} }
func Eligible(a Application, class int, now time.Time) bool {
	return a.Status == "approved" && a.Scope.Subject == "Mathematics" && a.Scope.Mode == "online" && class >= a.Scope.MinClass && class <= a.Scope.MaxClass && a.Scope.ExpiresAt.After(now)
}
func Overlap(a, b, c, d time.Time) bool { return a.Before(d) && c.Before(b) }
