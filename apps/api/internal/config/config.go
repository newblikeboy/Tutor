package config

import (
	"errors"
	"os"
	"strings"
)

type Config struct{ Env, Name, Addr, Origin, URI, Database, AuthProvider string }

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
func Load() (Config, error) {
	c := Config{env("APP_ENV", "development"), env("APP_NAME", "Tutor Platform"), env("HTTP_ADDR", "127.0.0.1:8080"), env("WEB_ORIGIN", "http://127.0.0.1:5173"), os.Getenv("MONGODB_URI"), env("MONGODB_DATABASE", "tutor_dev"), env("AUTH_PROVIDER", "password")}
	if c.URI == "" {
		return c, errors.New("MONGODB_URI is required; no database fallback")
	}
	if c.Env != "development" && c.Env != "test" && c.Env != "production" {
		return c, errors.New("invalid APP_ENV")
	}
	if c.Env == "production" && (c.AuthProvider != "disabled" || !strings.HasPrefix(c.Origin, "https://")) {
		return c, errors.New("production requires HTTPS and AUTH_PROVIDER=disabled until live auth/MFA review")
	}
	if c.AuthProvider != "password" && c.AuthProvider != "disabled" {
		return c, errors.New("unconfigured auth provider")
	}
	if env("PAYMENT_PROVIDER", "disabled") != "disabled" || env("TRIAL_FEE_PAISE", "0") != "0" {
		return c, errors.New("paid trials are not enabled in this milestone")
	}
	return c, nil
}
