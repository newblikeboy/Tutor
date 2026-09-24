package domain

import "time"

type PrivateFile struct {
	ID              string     `json:"id" bson:"_id"`
	TargetKind      string     `json:"targetKind" bson:"targetKind"`
	TargetID        string     `json:"targetId" bson:"targetId"`
	UploaderID      string     `json:"-" bson:"uploaderId"`
	UploaderName    string     `json:"uploaderName" bson:"uploaderName"`
	Name            string     `json:"name" bson:"name"`
	ContentType     string     `json:"contentType" bson:"contentType"`
	Size            int        `json:"size" bson:"size"`
	ObjectKey       string     `json:"-" bson:"objectKey"`
	Provider        string     `json:"provider,omitempty" bson:"provider,omitempty"`
	URL             string     `json:"-" bson:"url,omitempty"`
	PublicID        string     `json:"-" bson:"publicId,omitempty"`
	ResourceType    string     `json:"-" bson:"resourceType,omitempty"`
	AssetID         string     `json:"-" bson:"assetId,omitempty"`
	AssetVersion    int64      `json:"-" bson:"assetVersion,omitempty"`
	UploadExpiresAt *time.Time `json:"-" bson:"uploadExpiresAt,omitempty"`
	Scanner         string     `json:"-" bson:"scanner,omitempty"`
	Checksum        string     `json:"-" bson:"checksum"`
	Status          string     `json:"status" bson:"status"`
	CreatedAt       time.Time  `json:"createdAt" bson:"createdAt"`
	ScannedAt       *time.Time `json:"scannedAt,omitempty" bson:"scannedAt,omitempty"`
}
