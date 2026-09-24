package domain

import "time"

const ApplicationNoticeVersion = "application-2026-09-23-v1-draft"

// Requested teaching areas are private application data, never teaching permissions.
type TutorApplication struct {
	SchemaVersion int                     `json:"schemaVersion" bson:"schemaVersion"`
	About         ApplicantAbout          `json:"about" bson:"about"`
	Education     ApplicantEducation      `json:"education" bson:"education"`
	TeachingAreas []RequestedTeachingArea `json:"teachingAreas" bson:"teachingAreas"`
	FirstAreaID   string                  `json:"firstAreaId" bson:"firstAreaId"`
	Availability  ApplicantAvailability   `json:"availability" bson:"availability"`
	Approach      ApplicantApproach       `json:"approach" bson:"approach"`
	Fees          ApplicantFees           `json:"fees" bson:"fees"`
	Declarations  ApplicantDeclarations   `json:"declarations" bson:"declarations"`
}
type ApplicantAbout struct {
	FullName               string   `json:"fullName" bson:"fullName"`
	DisplayName            string   `json:"displayName" bson:"displayName"`
	Mobile                 string   `json:"mobile" bson:"mobile"`
	City                   string   `json:"city" bson:"city"`
	Locality               string   `json:"locality" bson:"locality"`
	PIN                    string   `json:"pin" bson:"pin"`
	CommunicationLanguages []string `json:"communicationLanguages" bson:"communicationLanguages"`
}
type ApplicantEducation struct {
	Qualification      string   `json:"qualification" bson:"qualification"`
	Specialisation     string   `json:"specialisation" bson:"specialisation"`
	Institution        string   `json:"institution" bson:"institution"`
	CompletionYear     int      `json:"completionYear" bson:"completionYear"`
	Pursuing           string   `json:"pursuing" bson:"pursuing"`
	Programme          string   `json:"programme" bson:"programme"`
	CurrentInstitution string   `json:"currentInstitution" bson:"currentInstitution"`
	CurrentStage       string   `json:"currentStage" bson:"currentStage"`
	ExpectedCompletion string   `json:"expectedCompletion" bson:"expectedCompletion"`
	Additional         string   `json:"additional" bson:"additional"`
	NewToTutoring      bool     `json:"newToTutoring" bson:"newToTutoring"`
	ExperienceYears    int      `json:"experienceYears" bson:"experienceYears"`
	ExperienceMonths   int      `json:"experienceMonths" bson:"experienceMonths"`
	Settings           []string `json:"settings" bson:"settings"`
	Summary            string   `json:"summary" bson:"summary"`
	Occupation         string   `json:"occupation" bson:"occupation"`
	OutsideWork        string   `json:"outsideWork" bson:"outsideWork"`
	ResumeFileID       string   `json:"resumeFileId" bson:"resumeFileId"`
	EducationFileIDs   []string `json:"educationFileIds" bson:"educationFileIds"`
}
type RequestedTeachingArea struct {
	ID              string   `json:"id" bson:"id"`
	Subject         string   `json:"subject" bson:"subject"`
	MinClass        int      `json:"minClass" bson:"minClass"`
	MaxClass        int      `json:"maxClass" bson:"maxClass"`
	Boards          []string `json:"boards" bson:"boards"`
	Languages       []string `json:"languages" bson:"languages"`
	Modes           []string `json:"modes" bson:"modes"`
	PriorExperience string   `json:"priorExperience" bson:"priorExperience"`
}
type ApplicationSlot struct {
	Day   int    `json:"day" bson:"day"`
	Start string `json:"start" bson:"start"`
	End   string `json:"end" bson:"end"`
}
type ApplicantAvailability struct {
	Timezone      string                `json:"timezone" bson:"timezone"`
	Slots         []ApplicationSlot     `json:"slots" bson:"slots"`
	EarliestStart string                `json:"earliestStart" bson:"earliestStart"`
	WeeklyHours   int                   `json:"weeklyHours" bson:"weeklyHours"`
	MaxStudents   int                   `json:"maxStudents" bson:"maxStudents"`
	Durations     []int                 `json:"durations" bson:"durations"`
	Period        string                `json:"period" bson:"period"`
	UntilDate     string                `json:"untilDate" bson:"untilDate"`
	Interruptions string                `json:"interruptions" bson:"interruptions"`
	Home          HomeTeachingRequest   `json:"home" bson:"home"`
	Online        OnlineTeachingRequest `json:"online" bson:"online"`
}
type HomeTeachingRequest struct {
	Localities    []string `json:"localities" bson:"localities"`
	TravelKM      int      `json:"travelKm" bson:"travelKm"`
	Charges       string   `json:"charges" bson:"charges"`
	BufferMinutes int      `json:"bufferMinutes" bson:"bufferMinutes"`
}
type OnlineTeachingRequest struct {
	Device         string `json:"device" bson:"device"`
	Camera         string `json:"camera" bson:"camera"`
	Microphone     string `json:"microphone" bson:"microphone"`
	Internet       string `json:"internet" bson:"internet"`
	PrivateSpace   string `json:"privateSpace" bson:"privateSpace"`
	ScreenSharing  string `json:"screenSharing" bson:"screenSharing"`
	DigitalWriting string `json:"digitalWriting" bson:"digitalWriting"`
}
type ApplicantApproach struct {
	Introduction    string            `json:"introduction" bson:"introduction"`
	Scenario        string            `json:"scenario" bson:"scenario"`
	Understanding   string            `json:"understanding" bson:"understanding"`
	Demonstration   string            `json:"demonstration" bson:"demonstration"`
	DemoAreaID      string            `json:"demoAreaId" bson:"demoAreaId"`
	DemoTopic       string            `json:"demoTopic" bson:"demoTopic"`
	DemoFileID      string            `json:"demoFileId" bson:"demoFileId"`
	WorksheetFileID string            `json:"worksheetFileId" bson:"worksheetFileId"`
	AssessmentSlots []ApplicationSlot `json:"assessmentSlots" bson:"assessmentSlots"`
}
type ApplicantFees struct {
	Preference     string         `json:"preference" bson:"preference"`
	SessionMinutes int            `json:"sessionMinutes" bson:"sessionMinutes"`
	Rates          []ExpectedRate `json:"rates" bson:"rates"`
	Comments       string         `json:"comments" bson:"comments"`
}
type ExpectedRate struct {
	AreaID      string `json:"areaId" bson:"areaId"`
	Mode        string `json:"mode" bson:"mode"`
	AmountPaise int64  `json:"amountPaise" bson:"amountPaise"`
}
type ApplicantDeclarations struct {
	Accuracy      bool   `json:"accuracy" bson:"accuracy"`
	Conduct       bool   `json:"conduct" bson:"conduct"`
	DataUse       bool   `json:"dataUse" bson:"dataUse"`
	Marketing     bool   `json:"marketing" bson:"marketing"`
	NoticeVersion string `json:"noticeVersion" bson:"noticeVersion"`
}
type ApplicationReceipt struct {
	NoticeVersion string    `json:"noticeVersion" bson:"noticeVersion"`
	At            time.Time `json:"at" bson:"at"`
	Marketing     bool      `json:"marketing" bson:"marketing"`
}
type EligibilityReview struct {
	Status     string     `json:"status" bson:"status"`
	Reason     string     `json:"reason" bson:"reason"`
	ReviewerID string     `json:"reviewerId" bson:"reviewerId"`
	ReviewedAt *time.Time `json:"reviewedAt" bson:"reviewedAt,omitempty"`
}

func (p TutorApplication) HasMode(mode string) bool {
	for _, area := range p.TeachingAreas {
		for _, selected := range area.Modes {
			if selected == mode {
				return true
			}
		}
	}
	return false
}
func (p TutorApplication) NeedsEligibilityReview() bool {
	return p.Education.Occupation == "employed_teacher" || p.Education.OutsideWork != "none"
}
func (p TutorApplication) FirstArea() (RequestedTeachingArea, bool) {
	for _, area := range p.TeachingAreas {
		if area.ID == p.FirstAreaID {
			return area, true
		}
	}
	return RequestedTeachingArea{}, false
}
