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
	if _, e := Load(); e != nil {
		t.Fatal("Cloudinary must not require a local scanner:", e)
	}
}

func TestProductionPasswordConfiguration(t *testing.T) {
	t.Setenv("MEDIA_PROVIDER", "disabled")
	t.Setenv("PAYMENT_PROVIDER", "disabled")
	t.Setenv("CLAMAV_ADDRESS", "")
	t.Setenv("MONGODB_URI", "mongodb://localhost")
	t.Setenv("APP_ENV", "production")
	t.Setenv("HTTP_ADDR", "127.0.0.1:8080")
	t.Setenv("VIDEO_PROVIDER", "disabled")
	t.Setenv("MEETING_PROVIDER", "disabled")
	t.Setenv("TEST_ZOOM_ENDPOINT", "")
	t.Setenv("TEST_CLOUDINARY_ENDPOINT", "")
	t.Setenv("TRIAL_FEE_PAISE", "0")
	t.Setenv("WEB_ORIGIN", "https://example.invalid")
	t.Setenv("AUTH_PROVIDER", "password")
	if _, e := Load(); e != nil {
		t.Fatal("production password configuration rejected:", e)
	}
	for _, origin := range []string{"http://example.invalid", "https://", "https://user:secret@example.invalid", "https://example.invalid/path", "https://example.invalid?", "https://example.invalid?x=1", "https://example.invalid#fragment"} {
		t.Setenv("WEB_ORIGIN", origin)
		if _, e := Load(); e == nil {
			t.Fatal("invalid production origin accepted", origin)
		}
	}
	t.Setenv("WEB_ORIGIN", "https://143.110.177.39")
	for _, addr := range []string{"0.0.0.0:8080", ":8080", "[::]:8080", "192.0.2.1:8080"} {
		t.Setenv("HTTP_ADDR", addr)
		if _, e := Load(); e == nil {
			t.Fatal("public API binding accepted", addr)
		}
	}
	t.Setenv("HTTP_ADDR", "127.0.0.1:8080")
	t.Setenv("AUTH_PROVIDER", "demo")
	if _, e := Load(); e == nil {
		t.Fatal("demo provider accepted")
	}
	t.Setenv("AUTH_PROVIDER", "disabled")
	if _, e := Load(); e != nil {
		t.Fatal(e)
	}
	t.Setenv("AUTH_PROVIDER", "")
	if c, e := Load(); e != nil || c.AuthProvider != "disabled" {
		t.Fatal("production authentication must be explicitly enabled", e)
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

func TestCloudinaryFixtureRestrictedToTests(t *testing.T) {
	for k, v := range map[string]string{"MONGODB_URI": "mongodb://localhost", "APP_ENV": "test", "AUTH_PROVIDER": "password", "PAYMENT_PROVIDER": "disabled", "MEDIA_PROVIDER": "disabled", "VIDEO_PROVIDER": "disabled", "MEETING_PROVIDER": "disabled", "CLAMAV_ADDRESS": "", "TEST_ZOOM_ENDPOINT": "", "TRIAL_FEE_PAISE": "0"} {
		t.Setenv(k, v)
	}
	for _, endpoint := range []string{"https://cloudinary.example", "http://localhost:7998", "http://127.0.0.1:7998/path", "http://127.0.0.1:7998?key=x", "http://user:password@127.0.0.1:7998"} {
		t.Setenv("TEST_CLOUDINARY_ENDPOINT", endpoint)
		if _, e := Load(); e == nil {
			t.Fatal("invalid provider override accepted")
		}
	}
	t.Setenv("TEST_CLOUDINARY_ENDPOINT", "http://127.0.0.1:7998")
	if _, e := Load(); e != nil {
		t.Fatal(e)
	}
	t.Setenv("APP_ENV", "development")
	if _, e := Load(); e == nil {
		t.Fatal("test override accepted in development")
	}
}
