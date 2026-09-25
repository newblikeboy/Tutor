package domain

import "time"

type InboxPerson struct {
	ID     string `json:"id" bson:"id"`
	Name   string `json:"name" bson:"name"`
	Role   string `json:"role" bson:"role"`
	Sample bool   `json:"sample" bson:"sample"`
}
type InboxRecipient struct {
	InboxPerson  `bson:",inline"`
	EnrollmentID string `json:"enrollmentId" bson:"enrollmentId"`
}
type InboxInput struct {
	Nonce        string `json:"nonce" bson:"nonce"`
	RecipientID  string `json:"recipientId" bson:"recipientId"`
	EnrollmentID string `json:"enrollmentId" bson:"enrollmentId"`
	Subject      string `json:"subject" bson:"subject"`
	Body         string `json:"body" bson:"body"`
}
type InboxUpdate struct {
	ID         string      `json:"id" bson:"_id"`
	SenderID   string      `json:"senderId" bson:"senderId"`
	Sender     InboxPerson `json:"sender" bson:"sender"`
	Recipient  InboxPerson `json:"recipient" bson:"recipient"`
	InboxInput `bson:",inline"`
	CreatedAt  time.Time  `json:"createdAt" bson:"createdAt"`
	ReadAt     *time.Time `json:"readAt" bson:"readAt"`
}
