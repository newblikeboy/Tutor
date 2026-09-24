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
}

func (a Application) AcademicMentor() string {
	if a.MentorID != "" {
		return a.MentorID
	}
	return a.AssessorID
}

type StaffMember struct {
	ID   string `json:"id" bson:"_id"`
	Name string `json:"name" bson:"name"`
	Role string `json:"role" bson:"role"`
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
