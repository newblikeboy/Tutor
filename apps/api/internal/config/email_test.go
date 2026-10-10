package config

import (
	"encoding/base64"
	"testing"
)

func TestSMTPConfiguration(t *testing.T) {
	for key, value := range map[string]string{"APP_ENV": "test", "MONGODB_URI": "mongodb://127.0.0.1", "AUTH_PROVIDER": "password", "PAYMENT_PROVIDER": "disabled", "MEDIA_PROVIDER": "disabled", "VIDEO_PROVIDER": "disabled", "MEETING_PROVIDER": "disabled", "TEST_ZOOM_ENDPOINT": "", "TEST_CLOUDINARY_ENDPOINT": "", "CLAMAV_ADDRESS": "", "TRIAL_FEE_PAISE": "0", "MAIL_PROVIDER": "disabled"} {
		t.Setenv(key, value)
	}
	if _, err := Load(); err != nil {
		t.Fatal(err)
	}
	t.Setenv("MAIL_PROVIDER", "smtp")
	if _, err := Load(); err == nil {
		t.Fatal("SMTP accepted without credentials")
	}
	for key, value := range map[string]string{"SMTP_HOST": "smtp.gmail.com", "SMTP_PORT": "587", "SMTP_SECURITY": "starttls", "SMTP_USER": "support@gocoaching.in", "SMTP_PASSWORD": "fixture-private-password", "SMTP_FROM": "support@gocoaching.in", "MAIL_TOKEN_KEY": base64.StdEncoding.EncodeToString(make([]byte, 32))} {
		t.Setenv(key, value)
	}
	if _, err := Load(); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct{ key, value string }{{"SMTP_SECURITY", "plain"}, {"SMTP_PORT", "0"}, {"SMTP_PORT", "65536"}, {"SMTP_FROM", "support@gocoaching.in\r\nBcc: attacker@example.test"}, {"MAIL_TOKEN_KEY", "short"}, {"SMTP_PASSWORD", ""}, {"SMTP_HOST", "smtp.gmail.com/path"}} {
		t.Run(tc.key+tc.value, func(t *testing.T) {
			t.Setenv(tc.key, tc.value)
			if _, err := Load(); err == nil {
				t.Fatal("unsafe SMTP configuration accepted")
			}
		})
	}
}
