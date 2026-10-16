package domain

import "time"

// Published text is copied into each booking; later edits never rewrite consent.
type TeachingAgreementContent struct {
	Title     string `json:"title" bson:"title"`
	Body      string `json:"body" bson:"body"`
	Privacy   string `json:"privacy" bson:"privacy"`
	Education string `json:"education" bson:"education"`
}
type TeachingAgreementVersion struct {
	TeachingAgreementContent `bson:",inline"`
	Mode                     string    `json:"mode" bson:"mode"`
	Version                  int       `json:"version" bson:"version"`
	PublishedAt              time.Time `json:"publishedAt" bson:"publishedAt"`
}
type TeachingAgreementDraft struct {
	ID        string                    `json:"mode" bson:"_id"`
	Mode      string                    `json:"-" bson:"mode"`
	Version   int                       `json:"version" bson:"version"`
	Draft     TeachingAgreementContent  `json:"draft" bson:"draft"`
	Published *TeachingAgreementVersion `json:"published" bson:"published"`
}
type TutorBookingSignature struct {
	TutorID      string    `json:"tutorId" bson:"tutorId"`
	Name         string    `json:"name" bson:"name"`
	Email        string    `json:"email" bson:"email"`
	DocumentHash string    `json:"documentHash" bson:"documentHash"`
	SignedAt     time.Time `json:"signedAt" bson:"signedAt"`
}
type TutorBookingAgreement struct {
	TeachingAgreementVersion `bson:",inline"`
	DocumentHash             string                 `json:"documentHash" bson:"documentHash"`
	Signature                *TutorBookingSignature `json:"signature" bson:"signature"`
}
