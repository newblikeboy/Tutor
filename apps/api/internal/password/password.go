// Package password stores salted Argon2id hashes, never plaintext credentials.
package password

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"golang.org/x/crypto/argon2"
	"strings"
	"unicode/utf8"
)

const prefix = "$argon2id$v=19$m=19456,t=2,p=1$"

func Valid(value string) bool {
	n := utf8.RuneCountInString(value)
	if n < 15 || n > 128 || len(value) > 512 || strings.TrimSpace(value) == "" {
		return false
	}
	for _, weak := range []string{"passwordpassword", "123456789012345", "1234567890123456", "qwertyuiopasdfgh", "letmeinletmeinletmein"} {
		if strings.EqualFold(value, weak) {
			return false
		}
	}
	return true
}

func Hash(value string) (string, error) {
	if !Valid(value) {
		return "", errors.New("password must be a non-common passphrase of 15 to 128 characters")
	}
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	key := argon2.IDKey([]byte(value), salt, 2, 19456, 1, 32)
	return prefix + base64.RawStdEncoding.EncodeToString(salt) + "$" + base64.RawStdEncoding.EncodeToString(key), nil
}

func Verify(encoded, value string) bool {
	if len(value) > 512 {
		return false
	}
	parts := strings.Split(strings.TrimPrefix(encoded, prefix), "$")
	valid := strings.HasPrefix(encoded, prefix) && len(parts) == 2
	salt, key := make([]byte, 16), make([]byte, 32)
	if valid {
		var err1, err2 error
		salt, err1 = base64.RawStdEncoding.DecodeString(parts[0])
		key, err2 = base64.RawStdEncoding.DecodeString(parts[1])
		valid = err1 == nil && err2 == nil && len(salt) == 16 && len(key) == 32
	}
	if !valid {
		salt, key = make([]byte, 16), make([]byte, 32)
	}
	// Unknown accounts take the same expensive hash path. Corrupt hashes cannot alter cost.
	actual := argon2.IDKey([]byte(value), salt, 2, 19456, 1, 32)
	return subtle.ConstantTimeCompare(actual, key) == 1 && valid
}
