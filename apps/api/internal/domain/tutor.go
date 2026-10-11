package domain

import "time"

// Provider secrets and reusable meeting URLs never appear in schedule responses.
type LessonMeeting struct {
	Provider    string    `json:"provider,omitempty" bson:"provider,omitempty"`
	OrganizerID string    `json:"-" bson:"organizerId,omitempty"`
	ETag        string    `json:"-" bson:"etag,omitempty"`
	HostKey     string    `json:"-" bson:"hostKey,omitempty"`
	Start       time.Time `json:"-" bson:"start,omitempty"`
	End         time.Time `json:"-" bson:"end,omitempty"`
	LastError   string    `json:"lastError,omitempty" bson:"lastError,omitempty"`
	Status      string    `json:"status" bson:"status"`
	JobID       string    `json:"-" bson:"jobId"`
	ID          string    `json:"-" bson:"id"`
	JoinURL     string    `json:"-" bson:"joinUrl"`
}

type TutorWorkspace struct {
	Briefs        []TutorLearnerBrief `json:"briefs"`
	Learners      []Learner           `json:"learners"`
	Enrollments   []Enrollment        `json:"enrollments"`
	Sessions      []ClassSession      `json:"sessions"`
	Trials        []Trial             `json:"trials"`
	Notifications []Notification      `json:"notifications"`
}

type TutorLearnerBrief struct {
	LearnerID string         `json:"learnerId"`
	Location  *LocationPoint `json:"location,omitempty"`
}
