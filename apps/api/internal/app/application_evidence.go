package app

import (
	"context"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"tutorplatform/internal/domain"
)

type applicationEvidenceLink struct{ field, id, kind string }

func applicationEvidenceLinks(p domain.TutorApplication) []applicationEvidenceLink {
	links := []applicationEvidenceLink{
		{"about.photoFileId", p.About.PhotoFileID, "photo"},
		{"about.aadhaarFrontFileId", p.About.AadhaarFrontFileID, "identity"},
		{"about.aadhaarBackFileId", p.About.AadhaarBackFileID, "identity"},
		{"education.class10FileId", p.Education.Class10FileID, "document"},
		{"education.class12FileId", p.Education.Class12FileID, "document"},
		{"education.resumeFileId", p.Education.ResumeFileID, "document"},
		{"approach.worksheetFileId", p.Approach.WorksheetFileID, "document"},
		{"approach.demoFileId", p.Approach.DemoFileID, "video"},
	}
	for _, id := range p.Education.EducationFileIDs {
		links = append(links, applicationEvidenceLink{"education.educationFileIds", id, "document"})
	}
	for _, id := range p.Education.HigherQualificationFileIDs {
		links = append(links, applicationEvidenceLink{"education.higherQualificationFileIds", id, "document"})
	}
	return links
}

// Bind a selected file to its purpose permanently, even after it is replaced.
// Identity and qualification evidence must never become public profile media.
func (a *App) bindApplicationEvidence(ctx context.Context, old *domain.Application, owner string, p domain.TutorApplication, submit bool) error {
	for _, link := range applicationEvidenceLinks(p) {
		if link.id == "" {
			continue
		}
		f, err := a.privateFile(ctx, link.id)
		if err == mongo.ErrNoDocuments {
			return domain.Fail(422, "application_file", "Choose a saved file belonging to this application.")
		}
		if err != nil {
			return err
		}
		image := enum(f.ContentType, "image/jpeg", "image/png")
		permitted := image || link.kind == "document" && f.ContentType == "application/pdf" || link.kind == "video" && f.ContentType == "video/mp4"
		if link.kind == "video" && f.ContentType != "video/mp4" {
			permitted = false
		}
		if f.TargetKind != "application" || f.TargetID != owner || f.UploaderID != owner || !permitted || !enum(f.Status, "quarantined", "clean", "ready") || f.ApplicationPurpose != "" && f.ApplicationPurpose != link.field {
			return domain.Fail(422, "application_file", "Use a separate file of the correct type for each application document.")
		}
		// New mandatory evidence must be provider-verified (or legacy scanner-cleared).
		required := link.kind == "photo" || link.kind == "identity" || link.field == "education.class10FileId" || link.field == "education.class12FileId"
		ready := f.Provider == "cloudinary" && f.Status == "ready" || f.Provider != "cloudinary" && f.Status == "clean" && f.ScannedAt != nil
		if submit && required && !ready {
			return domain.Fail(422, "application_file", "Wait until each required document is ready before submitting.")
		}
		if f.ApplicationPurpose == "" {
			found := false
			for i := range old.Attachments {
				if old.Attachments[i].ID == f.ID {
					old.Attachments[i].ApplicationPurpose = link.field
					found = true
					break
				}
			}
			if !found {
				if _, err = a.Store.C("files").UpdateOne(ctx, bson.M{"_id": f.ID}, bson.M{"$set": bson.M{"applicationPurpose": link.field}}); err != nil {
					return err
				}
			}
		}
	}
	return nil
}

func publicApplicationMedia(v domain.Application, f domain.PrivateFile) bool {
	if f.ApplicationPurpose != "" {
		return f.ApplicationPurpose == "about.photoFileId" || f.ApplicationPurpose == "approach.demoFileId"
	}
	if f.TargetKind != "application" {
		return true
	}
	if f.ContentType == "video/mp4" {
		return true
	}
	// An interrupted KYC upload may be ready before the draft links it. Never
	// offer arbitrary unclassified application files as public media. Retain
	// only previously selected legacy portraits. Videos cannot be KYC images.
	return v.Profile != nil && (f.ID == v.Profile.About.PhotoFileID || f.ID == v.Profile.Approach.DemoFileID) ||
		v.PublicProfile != nil && (f.ID == v.PublicProfile.PhotoFileID || f.ID == v.PublicProfile.IntroVideoFileID)
}
