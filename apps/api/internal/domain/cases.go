package domain

import "time"

type ServiceCase struct {
	ID         string    `json:"id" bson:"_id"`
	OwnerID    string    `json:"-" bson:"ownerId"`
	Kind       string    `json:"kind" bson:"kind"`
	Title      string    `json:"title" bson:"title"`
	Body       string    `json:"body" bson:"body"`
	Status     string    `json:"status" bson:"status"`
	AssignedTo string    `json:"assignedTo" bson:"assignedTo"`
	Version    int       `json:"version" bson:"version"`
	CreatedAt  time.Time `json:"createdAt" bson:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt" bson:"updatedAt"`
	Restricted bool      `json:"restricted" bson:"-"`
	CanReply   bool      `json:"canReply" bson:"-"`
	CanManage  bool      `json:"canManage" bson:"-"`
}
type CaseMessage struct {
	ID         string    `json:"id" bson:"_id"`
	CaseID     string    `json:"caseId" bson:"caseId"`
	AuthorID   string    `json:"-" bson:"authorId"`
	AuthorName string    `json:"authorName" bson:"authorName"`
	AuthorRole string    `json:"authorRole" bson:"authorRole"`
	Body       string    `json:"body" bson:"body"`
	CreatedAt  time.Time `json:"createdAt" bson:"createdAt"`
}
