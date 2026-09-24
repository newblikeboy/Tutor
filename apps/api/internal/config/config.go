package config

import (
	"errors"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

type Config struct {
	TestZoomURL                                                                               string
	Env, Name, Addr, Origin, URI, Database, AuthProvider                                      string
	PaymentProvider, RazorpayKeyID, RazorpaySecret, RazorpayWebhookSecret                     string
	MediaProvider, MediaRoot, S3Endpoint, S3Region, S3Bucket, S3Key, S3Secret, ScannerAddress string
	VideoProvider, CloudinaryCloud, CloudinaryKey, CloudinarySecret                           string
	MeetingProvider, ZoomAccountID, ZoomClientID, ZoomSecret, ZoomHostID                      string
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
func Load() (Config, error) {
	c := Config{Env: env("APP_ENV", "development"), Name: env("APP_NAME", "TheGyanSetu"), Addr: env("HTTP_ADDR", "127.0.0.1:8080"), Origin: env("WEB_ORIGIN", "http://127.0.0.1:5173"), URI: os.Getenv("MONGODB_URI"), Database: env("MONGODB_DATABASE", "tutor_dev"), AuthProvider: env("AUTH_PROVIDER", "password"), PaymentProvider: env("PAYMENT_PROVIDER", "disabled"), RazorpayKeyID: os.Getenv("RAZORPAY_KEY_ID"), RazorpaySecret: os.Getenv("RAZORPAY_KEY_SECRET"), RazorpayWebhookSecret: os.Getenv("RAZORPAY_WEBHOOK_SECRET")}
	if c.URI == "" {
		return c, errors.New("MONGODB_URI is required; no database fallback")
	}
	if c.Env != "development" && c.Env != "test" && c.Env != "production" {
		return c, errors.New("invalid APP_ENV")
	}
	c.MediaProvider = env("MEDIA_PROVIDER", "disabled")
	c.MediaRoot = os.Getenv("MEDIA_ROOT")
	c.ScannerAddress = os.Getenv("CLAMAV_ADDRESS")
	c.VideoProvider = env("VIDEO_PROVIDER", "disabled")
	c.CloudinaryCloud, c.CloudinaryKey, c.CloudinarySecret = os.Getenv("CLOUDINARY_CLOUD_NAME"), os.Getenv("CLOUDINARY_API_KEY"), os.Getenv("CLOUDINARY_API_SECRET")
	c.MeetingProvider = env("MEETING_PROVIDER", "disabled")
	c.ZoomAccountID, c.ZoomClientID, c.ZoomSecret, c.ZoomHostID = os.Getenv("ZOOM_ACCOUNT_ID"), os.Getenv("ZOOM_CLIENT_ID"), os.Getenv("ZOOM_CLIENT_SECRET"), os.Getenv("ZOOM_HOST_USER_ID")
	c.TestZoomURL = os.Getenv("TEST_ZOOM_ENDPOINT")
	if c.TestZoomURL != "" {
		u, e := url.Parse(c.TestZoomURL)
		if e != nil || c.Env != "test" || u.Scheme != "http" || u.Hostname() != "127.0.0.1" || u.Port() == "" || u.User != nil || u.Path != "" || u.RawQuery != "" || u.Fragment != "" {
			return c, errors.New("Zoom fixture endpoint is restricted to loopback in APP_ENV=test")
		}
	}
	if c.VideoProvider != "disabled" && c.VideoProvider != "cloudinary" && c.VideoProvider != "disk" {
		return c, errors.New("invalid video provider")
	}
	if (c.VideoProvider == "cloudinary" || c.MediaProvider == "cloudinary") && (!regexp.MustCompile(`^[a-zA-Z0-9_-]+$`).MatchString(c.CloudinaryCloud) || c.CloudinaryKey == "" || c.CloudinarySecret == "") {
		return c, errors.New("Cloudinary requires private cloud name, API key and API secret")
	}
	if c.VideoProvider == "disk" && (c.Env == "production" || c.MediaProvider != "disk") {
		return c, errors.New("disk video storage is an explicit development/test adapter and requires MEDIA_PROVIDER=disk")
	}
	if c.MeetingProvider != "disabled" && c.MeetingProvider != "zoom" {
		return c, errors.New("invalid meeting provider")
	}
	if c.MeetingProvider == "zoom" && (c.ZoomAccountID == "" || c.ZoomClientID == "" || c.ZoomSecret == "" || strings.TrimSpace(c.ZoomHostID) == "") {
		return c, errors.New("Zoom requires private server-to-server OAuth credentials and a host user ID")
	}
	c.S3Endpoint = os.Getenv("S3_ENDPOINT")
	c.S3Region = os.Getenv("S3_REGION")
	c.S3Bucket = os.Getenv("S3_BUCKET")
	c.S3Key = os.Getenv("S3_ACCESS_KEY")
	c.S3Secret = os.Getenv("S3_SECRET_KEY")
	if c.MediaProvider != "disabled" && c.MediaProvider != "disk" && c.MediaProvider != "s3" && c.MediaProvider != "cloudinary" {
		return c, errors.New("invalid private storage provider")
	}
	if c.MediaProvider == "disk" && (c.Env == "production" || !filepath.IsAbs(c.MediaRoot)) {
		return c, errors.New("private disk storage requires an absolute development-only directory outside the web root")
	}
	if c.MediaProvider == "s3" {
		u, e := url.Parse(c.S3Endpoint)
		if e != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || c.S3Region == "" || c.S3Bucket == "" || c.S3Key == "" || c.S3Secret == "" {
			return c, errors.New("private S3 storage requires an HTTPS endpoint, region, bucket and private credentials")
		}
	}
	if c.ScannerAddress != "" {
		host, _, e := net.SplitHostPort(c.ScannerAddress)
		ip := net.ParseIP(host)
		if e != nil || ip == nil || !ip.IsLoopback() {
			return c, errors.New("ClamAV must use a private loopback TCP address")
		}
	}
	if c.Env == "production" && (c.MediaProvider != "disabled" || c.VideoProvider != "disabled") && c.ScannerAddress == "" {
		return c, errors.New("production uploads require the configured private scanner")
	}
	if c.Env == "production" && (c.AuthProvider != "disabled" || !strings.HasPrefix(c.Origin, "https://")) {
		return c, errors.New("production requires HTTPS and AUTH_PROVIDER=disabled until live auth/MFA review")
	}
	if c.AuthProvider != "password" && c.AuthProvider != "disabled" {
		return c, errors.New("unconfigured auth provider")
	}
	if env("TRIAL_FEE_PAISE", "0") != "0" {
		return c, errors.New("paid trials are not enabled in this milestone")
	}
	if c.PaymentProvider != "disabled" && c.PaymentProvider != "razorpay" {
		return c, errors.New("unsupported payment provider")
	}
	if c.PaymentProvider == "razorpay" {
		if c.Env == "production" {
			return c, errors.New("live payments await operator release review and sandbox acceptance")
		}
		if !strings.HasPrefix(c.RazorpayKeyID, "rzp_test_") || len(c.RazorpaySecret) < 16 || len(c.RazorpayWebhookSecret) < 16 {
			return c, errors.New("Razorpay requires private test credentials and a separate webhook secret; live keys are not accepted in development")
		}
	}
	return c, nil
}
