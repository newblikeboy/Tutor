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
	for _, value := range []string{"short", "passwordpassword", strings.Repeat("x", 129), strings.Repeat(" ", 16)} {
		if Valid(value) {
			t.Fatal("weak or oversized password accepted")
		}
	}
	if !Valid("पढ़ाई के लिए एक नया पासवर्ड") {
		t.Fatal("Unicode passphrase rejected")
	}
}
