package config

import "testing"

func TestRecruitmentProviderConfiguration(t *testing.T) {
	for k, v := range map[string]string{"MONGODB_URI": "mongodb://localhost", "APP_ENV": "test", "AUTH_PROVIDER": "password", "PAYMENT_PROVIDER": "disabled", "MEDIA_PROVIDER": "disabled", "VIDEO_PROVIDER": "disabled", "MEETING_PROVIDER": "disabled", "CLAMAV_ADDRESS": "", "TRIAL_FEE_PAISE": "0", "TEST_ZOOM_ENDPOINT": ""} {
		t.Setenv(k, v)
	}
	t.Setenv("VIDEO_PROVIDER", "cloudinary")
	for _, k := range []string{"CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"} {
		t.Setenv(k, "")
	}
	if _, e := Load(); e == nil {
		t.Fatal("unconfigured Cloudinary accepted")
	}
	for k, v := range map[string]string{"CLOUDINARY_CLOUD_NAME": "test-cloud", "CLOUDINARY_API_KEY": "test-key", "CLOUDINARY_API_SECRET": "test-secret"} {
		t.Setenv(k, v)
	}
	if _, e := Load(); e != nil {
		t.Fatal(e)
	}
	t.Setenv("MEETING_PROVIDER", "zoom")
	t.Run("document-only Cloudinary requires credentials", func(t *testing.T) {
		t.Setenv("MEETING_PROVIDER", "disabled")
		t.Setenv("VIDEO_PROVIDER", "disabled")
		t.Setenv("MEDIA_PROVIDER", "cloudinary")
		if _, e := Load(); e != nil {
			t.Fatal(e)
		}
		t.Setenv("CLOUDINARY_API_SECRET", "")
		if _, e := Load(); e == nil {
			t.Fatal("document storage accepted without credentials")
		}
	})
	for _, k := range []string{"ZOOM_ACCOUNT_ID", "ZOOM_CLIENT_ID", "ZOOM_CLIENT_SECRET", "ZOOM_HOST_USER_ID"} {
		t.Setenv(k, "")
	}
	if _, e := Load(); e == nil {
		t.Fatal("unconfigured Zoom accepted")
	}
	for _, k := range []string{"ZOOM_ACCOUNT_ID", "ZOOM_CLIENT_ID", "ZOOM_CLIENT_SECRET", "ZOOM_HOST_USER_ID"} {
		t.Setenv(k, "test-only")
	}
	t.Setenv("TEST_ZOOM_ENDPOINT", "http://127.0.0.1:7999")
	if _, e := Load(); e != nil {
		t.Fatal(e)
	}
	t.Setenv("APP_ENV", "development")
	if _, e := Load(); e == nil {
		t.Fatal("test provider override accepted outside tests")
	}
	t.Setenv("TEST_ZOOM_ENDPOINT", "")
	t.Setenv("APP_ENV", "production")
	t.Setenv("AUTH_PROVIDER", "disabled")
	t.Setenv("WEB_ORIGIN", "https://example.test")
	if _, e := Load(); e == nil {
		t.Fatal("production Cloudinary without scanner accepted")
	}
}

func TestProductionRejectsDemoAuth(t *testing.T) {
	t.Setenv("MEDIA_PROVIDER", "disabled")
	t.Setenv("PAYMENT_PROVIDER", "disabled")
	t.Setenv("CLAMAV_ADDRESS", "")
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

func TestIntegrationConfigurationFailsClosed(t *testing.T) {
	for k, v := range map[string]string{"MONGODB_URI": "mongodb://localhost", "APP_ENV": "test", "AUTH_PROVIDER": "password", "PAYMENT_PROVIDER": "disabled", "MEDIA_PROVIDER": "disabled", "CLAMAV_ADDRESS": "", "TRIAL_FEE_PAISE": "0", "RAZORPAY_KEY_ID": "", "RAZORPAY_KEY_SECRET": "", "RAZORPAY_WEBHOOK_SECRET": ""} {
		t.Setenv(k, v)
	}
	t.Setenv("PAYMENT_PROVIDER", "razorpay")
	if _, e := Load(); e == nil {
		t.Fatal("missing credentials accepted")
	}
	t.Setenv("RAZORPAY_KEY_ID", "rzp_live_test_rejected")
	t.Setenv("RAZORPAY_KEY_SECRET", "unit-test-secret-value")
	t.Setenv("RAZORPAY_WEBHOOK_SECRET", "unit-test-webhook-secret")
	if _, e := Load(); e == nil {
		t.Fatal("live keys accepted in test")
	}
	t.Setenv("RAZORPAY_KEY_ID", "rzp_test_configuration")
	if _, e := Load(); e != nil {
		t.Fatal("valid sandbox configuration rejected")
	}
	t.Setenv("PAYMENT_PROVIDER", "disabled")
	t.Setenv("CLAMAV_ADDRESS", "0.0.0.0:3310")
	if _, e := Load(); e == nil {
		t.Fatal("public scanner accepted")
	}
	t.Setenv("CLAMAV_ADDRESS", "127.0.0.1:3310")
	if _, e := Load(); e != nil {
		t.Fatal("private scanner rejected")
	}
	t.Setenv("MEDIA_PROVIDER", "s3")
	t.Setenv("S3_ENDPOINT", "http://storage.example.invalid")
	if _, e := Load(); e == nil {
		t.Fatal("insecure object storage accepted")
	}
}
