package domain

import "time"

type Message struct {
	ID           string    `json:"id" bson:"_id"`
	EnrollmentID string    `json:"enrollmentId" bson:"enrollmentId"`
	AuthorID     string    `json:"-" bson:"authorId"`
	AuthorName   string    `json:"authorName" bson:"authorName"`
	AuthorRole   string    `json:"authorRole" bson:"authorRole"`
	Body         string    `json:"body" bson:"body"`
	CreatedAt    time.Time `json:"createdAt" bson:"createdAt"`
}
type Notification struct {
	ID        string    `json:"id" bson:"_id"`
	OwnerID   string    `json:"-" bson:"ownerId"`
	Kind      string    `json:"kind" bson:"kind"`
	TargetID  string    `json:"targetId" bson:"targetId"`
	Read      bool      `json:"read" bson:"read"`
	CreatedAt time.Time `json:"createdAt" bson:"createdAt"`
}
