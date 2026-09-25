package domain

import "time"

// InboxKey contains public identity keys and a client-encrypted private-key vault.
// The passphrase and unencrypted private keys never reach the API.
type InboxKey struct {
	ID            string `json:"userId" bson:"_id"`
	Version       int    `json:"version" bson:"version"`
	EncryptionKey string `json:"encryptionKey" bson:"encryptionKey"`
	SigningKey    string `json:"signingKey" bson:"signingKey"`
	Fingerprint   string `json:"fingerprint" bson:"fingerprint"`
	Salt          string `json:"salt" bson:"salt"`
	IV            string `json:"iv" bson:"iv"`
	Vault         string `json:"vault" bson:"vault"`
}

type InboxPerson struct {
	ID     string `json:"id" bson:"id"`
	Name   string `json:"name" bson:"name"`
	Role   string `json:"role" bson:"role"`
	Sample bool   `json:"sample" bson:"sample"`
}

type InboxRecipient struct {
	InboxPerson  `bson:",inline"`
	EnrollmentID string `json:"enrollmentId" bson:"enrollmentId"`
	Ready        bool   `json:"ready" bson:"ready"`
}

// Metadata is visible to the service; subject and body exist only in Ciphertext.
type InboxEnvelope struct {
	Version              int    `json:"version" bson:"version"`
	Nonce                string `json:"nonce" bson:"nonce"`
	RecipientID          string `json:"recipientId" bson:"recipientId"`
	EnrollmentID         string `json:"enrollmentId" bson:"enrollmentId"`
	SenderFingerprint    string `json:"senderFingerprint" bson:"senderFingerprint"`
	RecipientFingerprint string `json:"recipientFingerprint" bson:"recipientFingerprint"`
	IV                   string `json:"iv" bson:"iv"`
	Ciphertext           string `json:"ciphertext" bson:"ciphertext"`
	SenderWrappedKey     string `json:"senderWrappedKey" bson:"senderWrappedKey"`
	RecipientWrappedKey  string `json:"recipientWrappedKey" bson:"recipientWrappedKey"`
	Signature            string `json:"signature" bson:"signature"`
}

type InboxUpdate struct {
	ID            string      `json:"id" bson:"_id"`
	SenderID      string      `json:"senderId" bson:"senderId"`
	Sender        InboxPerson `json:"sender" bson:"sender"`
	Recipient     InboxPerson `json:"recipient" bson:"recipient"`
	InboxEnvelope `bson:",inline"`
	CreatedAt     time.Time  `json:"createdAt" bson:"createdAt"`
	ReadAt        *time.Time `json:"readAt" bson:"readAt"`
	ReadSignature string     `json:"readSignature" bson:"readSignature"`
}
