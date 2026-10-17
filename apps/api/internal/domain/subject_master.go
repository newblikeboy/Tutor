package domain

import "time"

// IDs are the original subject names used by retained scopes and agreements.
// Changing the display name never rewrites those references.
type Subject struct {
	ID             string    `json:"id" bson:"_id"`
	Name           string    `json:"name" bson:"name"`
	NormalizedName string    `json:"-" bson:"normalizedName"`
	Active         bool      `json:"active" bson:"active"`
	SortOrder      int       `json:"sortOrder" bson:"sortOrder"`
	System         bool      `json:"system" bson:"system"`
	Version        int       `json:"version" bson:"version"`
	UseRevision    int       `json:"-" bson:"useRevision"`
	UpdatedAt      time.Time `json:"updatedAt" bson:"updatedAt"`
}

// Initial migration data only. Runtime choices always come from MongoDB.
var InitialSubjectNames = []string{AllSubjects, "Mathematics", "Science", "English", "Hindi", "Social Science"}
