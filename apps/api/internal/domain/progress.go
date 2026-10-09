package domain

import "time"

type TestResult struct {
	Title   string `json:"title" bson:"title"`
	Score   int    `json:"score" bson:"score"`
	Maximum int    `json:"maximum" bson:"maximum"`
}

type ClassProgress struct {
	Subject        string          `json:"subject" bson:"subject"`
	Topics         []LearningTopic `json:"topics" bson:"topics"`
	HomeworkStatus string          `json:"homeworkStatus" bson:"homeworkStatus"`
	Test           *TestResult     `json:"test,omitempty" bson:"test,omitempty"`
	Feedback       string          `json:"feedback" bson:"feedback"`
	NextSteps      string          `json:"nextSteps" bson:"nextSteps"`
	RecordedAt     time.Time       `json:"recordedAt" bson:"recordedAt"`
}

type ProgressSession struct {
	ClassSession
	TutorName string   `json:"tutorName"`
	Subjects  []string `json:"subjects"`
}

type ProgressTrial struct {
	Trial
	TutorName string `json:"tutorName"`
}

type ProgressPlan struct {
	LearningPlan
	AuthorName string   `json:"authorName"`
	Subjects   []string `json:"subjects"`
}

type LearnerProgress struct {
	Enrollments []Enrollment      `json:"enrollments"`
	Sessions    []ProgressSession `json:"sessions"`
	Trials      []ProgressTrial   `json:"trials"`
	Plans       []ProgressPlan    `json:"plans"`
	Handovers   []Handover        `json:"handovers"`
}
