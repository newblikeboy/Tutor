package domain

import "time"

const StudyPricePaise int64 = 9900

type StudyQuestion struct {
	Prompt        string   `json:"prompt" bson:"prompt"`
	Options       []string `json:"options" bson:"options"`
	CorrectOption *int     `json:"correctOption,omitempty" bson:"correctOption"`
}

type StudyMaterial struct {
	ID          string          `json:"id" bson:"_id"`
	Title       string          `json:"title" bson:"title"`
	Description string          `json:"description" bson:"description"`
	Kind        string          `json:"kind" bson:"kind"`
	Class       int             `json:"class" bson:"class"`
	Board       string          `json:"board" bson:"board"`
	Subject     string          `json:"subject" bson:"subject"`
	Status      string          `json:"status" bson:"status"`
	FileID      string          `json:"fileId,omitempty" bson:"fileId"`
	Questions   []StudyQuestion `json:"questions,omitempty" bson:"questions"`
	Version     int             `json:"version" bson:"version"`
	UpdatedAt   time.Time       `json:"updatedAt" bson:"updatedAt"`
	UpdatedBy   string          `json:"-" bson:"updatedBy"`
}

type StudyAccess struct {
	ID        string    `json:"id" bson:"_id"` // One authoritative lock and entitlement per student.
	OwnerID   string    `json:"-" bson:"ownerId"`
	LearnerID string    `json:"learnerId" bson:"learnerId"`
	IntentID  string    `json:"intentId,omitempty" bson:"intentId"`
	StartsAt  time.Time `json:"startsAt" bson:"startsAt"`
	ExpiresAt time.Time `json:"expiresAt" bson:"expiresAt"`
	Simulated bool      `json:"simulated" bson:"simulated"`
	Version   int       `json:"version" bson:"version"`
}

type StudyAttempt struct {
	ID              string          `json:"id" bson:"_id"`
	OwnerID         string          `json:"-" bson:"ownerId"`
	LearnerID       string          `json:"learnerId" bson:"learnerId"`
	MaterialID      string          `json:"materialId" bson:"materialId"`
	Title           string          `json:"title" bson:"title"`
	MaterialVersion int             `json:"materialVersion" bson:"materialVersion"`
	Score           int             `json:"score" bson:"score"`
	Total           int             `json:"total" bson:"total"`
	Answers         []int           `json:"answers" bson:"answers"`
	Snapshot        []StudyQuestion `json:"-" bson:"snapshot"`
	CreatedAt       time.Time       `json:"createdAt" bson:"createdAt"`
}
