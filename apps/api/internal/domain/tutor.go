package domain

// Provider secrets and reusable meeting URLs never appear in schedule responses.
type LessonMeeting struct {
	Status  string `json:"status" bson:"status"`
	JobID   string `json:"-" bson:"jobId"`
	ID      string `json:"-" bson:"id"`
	JoinURL string `json:"-" bson:"joinUrl"`
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
