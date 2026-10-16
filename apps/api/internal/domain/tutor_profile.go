package domain

import "time"

// Presentation fields are independent of immutable application evidence and staff decisions.
type TutorPublicProfile struct {
	Introduction     string    `json:"introduction" bson:"introduction"`
	PhotoFileID      string    `json:"photoFileId" bson:"photoFileId"`
	IntroVideoFileID string    `json:"introVideoFileId" bson:"introVideoFileId"`
	PublishVideo     bool      `json:"publishVideo" bson:"publishVideo"`
	Version          int       `json:"version" bson:"version"`
	UpdatedAt        time.Time `json:"updatedAt" bson:"updatedAt"`
}

type PublicTrialTime struct {
	Start time.Time `json:"start"`
	End   time.Time `json:"end"`
}
