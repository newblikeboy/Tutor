package config

import (
	"encoding/base64"
	"testing"
)

func TestGoogleInterviewConfiguration(t *testing.T) {
	for k, v := range map[string]string{"MONGODB_URI": "mongodb://127.0.0.1", "APP_ENV": "development", "AUTH_PROVIDER": "password", "PAYMENT_PROVIDER": "disabled", "MEDIA_PROVIDER": "disabled", "VIDEO_PROVIDER": "disabled", "MAIL_PROVIDER": "disabled", "MEETING_PROVIDER": "disabled", "INTERVIEW_PROVIDER": "google", "GOOGLE_OAUTH_CLIENT_ID": "fixture-client", "GOOGLE_OAUTH_CLIENT_SECRET": "fixture-secret", "GOOGLE_OAUTH_REDIRECT_URI": "https://gocoaching.in/api/integrations/google/callback", "GOOGLE_TOKEN_KEY": "", "TEST_GOOGLE_ENDPOINT": "", "TEST_CLOUDINARY_ENDPOINT": "", "CLAMAV_ADDRESS": "", "WEB_ORIGIN": "https://gocoaching.in", "HTTP_ADDR": "127.0.0.1:8080", "TRIAL_FEE_PAISE": "0"} {
		t.Setenv(k, v)
	}
	if _, e := Load(); e == nil {
		t.Fatal("unencrypted Google tokens permitted")
	}
	t.Setenv("GOOGLE_TOKEN_KEY", base64.StdEncoding.EncodeToString(make([]byte, 32)))
	if c, e := Load(); e != nil || c.InterviewProvider != "google" {
		t.Fatal("Google configuration rejected", e)
	}
	t.Setenv("APP_ENV", "production")
	if _, e := Load(); e != nil {
		t.Fatal(e)
	}
	t.Setenv("GOOGLE_OAUTH_REDIRECT_URI", "https://other.example/api/integrations/google/callback")
	if _, e := Load(); e == nil {
		t.Fatal("cross-origin production callback accepted")
	}
	t.Setenv("APP_ENV", "test")
	t.Setenv("GOOGLE_OAUTH_REDIRECT_URI", "http://127.0.0.1:5174/api/integrations/google/callback")
	for _, endpoint := range []string{"http://localhost:7996", "https://127.0.0.1:7996", "http://127.0.0.1:7996/path", "http://127.0.0.1:7996?x=1", "http://user:password@127.0.0.1:7996"} {
		t.Setenv("TEST_GOOGLE_ENDPOINT", endpoint)
		if _, e := Load(); e == nil {
			t.Fatal("unsafe test override accepted")
		}
	}
	t.Setenv("TEST_GOOGLE_ENDPOINT", "http://127.0.0.1:7996")
	if _, e := Load(); e != nil {
		t.Fatal(e)
	}
	t.Setenv("APP_ENV", "development")
	if _, e := Load(); e == nil {
		t.Fatal("Google fixture allowed in development")
	}
}
