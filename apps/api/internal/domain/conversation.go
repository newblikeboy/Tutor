package domain

import "time"

type Message struct {
	ID           string              `json:"id" bson:"_id"`
	EnrollmentID string              `json:"enrollmentId" bson:"enrollmentId"`
	AuthorID     string              `json:"-" bson:"authorId"`
	AuthorName   string              `json:"authorName" bson:"authorName"`
	AuthorRole   string              `json:"authorRole" bson:"authorRole"`
	Body         string              `json:"body" bson:"body"`
	Attachments  []MessageAttachment `json:"attachments,omitempty" bson:"attachments,omitempty"`
	CreatedAt    time.Time           `json:"createdAt" bson:"createdAt"`
}
type MessageAttachment struct {
	ID          string `json:"id" bson:"id"`
	Name        string `json:"name" bson:"name"`
	ContentType string `json:"contentType" bson:"contentType"`
	Size        int    `json:"size" bson:"size"`
}
type Notification struct {
	ReadAt    *time.Time `json:"readAt,omitempty" bson:"readAt,omitempty"`
	ID        string     `json:"id" bson:"_id"`
	OwnerID   string     `json:"-" bson:"ownerId"`
	Kind      string     `json:"kind" bson:"kind"`
	TargetID  string     `json:"targetId" bson:"targetId"`
	Read      bool       `json:"read" bson:"read"`
	CreatedAt time.Time  `json:"createdAt" bson:"createdAt"`
}
