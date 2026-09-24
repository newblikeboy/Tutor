package password

import (
	"strings"
	"testing"
)

func TestSaltedHashAndVerification(t *testing.T) {
	value := "A long learning passphrase 42"
	a, err := Hash(value)
	if err != nil {
		t.Fatal(err)
	}
	b, _ := Hash(value)
	if a == b || strings.Contains(a, value) {
		t.Fatal("passwords must have independent salts")
	}
	if !Verify(a, value) || Verify(a, "Wrong long passphrase") || Verify("", value) || Verify("$argon2id$v=19$m=999999999,t=99,p=1$bad$bad", value) {
		t.Fatal("incorrect verification")
	}
}

func TestPassphraseBounds(t *testing.T) {
	for _, value := range []string{"short", "Abcd!42", "passwordpassword", strings.Repeat("x", 129), strings.Repeat(" ", 8)} {
		if Valid(value) {
			t.Fatal("weak or oversized password accepted")
		}
	}
	for _, value := range []string{"Abcd!842", strings.Repeat("é", 8), strings.Repeat("x", 128)} {
		if !Valid(value) {
			t.Fatal("password within the eight-to-128-character bounds rejected")
		}
		hash, err := Hash(value)
		if err != nil || !Verify(hash, value) {
			t.Fatal("valid password failed hash/verification")
		}
	}
	if _, err := Hash("Abcd!42"); err == nil {
		t.Fatal("seven-character password was hashed")
	}
	if !Valid("पढ़ाई के लिए एक नया पासवर्ड") {
		t.Fatal("Unicode passphrase rejected")
	}
}
