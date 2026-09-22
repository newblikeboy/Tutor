package config

import "testing"

func TestProductionRejectsDemoAuth(t *testing.T) {
	t.Setenv("MONGODB_URI", "mongodb://localhost")
	t.Setenv("APP_ENV", "production")
	t.Setenv("WEB_ORIGIN", "https://example.invalid")
	t.Setenv("AUTH_PROVIDER", "password")
	if _, e := Load(); e == nil {
		t.Fatal("demo auth accepted in production")
	}
	t.Setenv("AUTH_PROVIDER", "disabled")
	if _, e := Load(); e != nil {
		t.Fatal(e)
	}
	t.Setenv("TRIAL_FEE_PAISE", "100")
	if _, e := Load(); e == nil {
		t.Fatal("unconfigured payments accepted")
	}
}
