package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDevelopmentEnvironmentLiteralParsing(t *testing.T) {
	values, e := parseDevelopmentEnv(strings.NewReader("\ufeff# example\r\nexport TEST_LITERAL='value $() `command` # literal'\r\nTEST_EQUALS=a=b=c\nEMPTY=\n"))
	if e != nil || values["TEST_LITERAL"] != "value $() `command` # literal" || values["TEST_EQUALS"] != "a=b=c" {
		t.Fatal("literal values changed")
	}
	for _, input := range []string{"INVALID KEY=value", "MISSING_EQUALS", `VALUE="unclosed`, "VALUE=" + strings.Repeat("a", 66000)} {
		if _, e = parseDevelopmentEnv(strings.NewReader(input)); e == nil {
			t.Fatal("invalid input accepted")
		}
	}
}
func TestDevelopmentEnvSearchAndPrecedence(t *testing.T) {
	dir := t.TempDir()
	nested := filepath.Join(dir, "apps", "api")
	if e := os.MkdirAll(nested, 0700); e != nil {
		t.Fatal(e)
	}
	if e := os.WriteFile(filepath.Join(dir, ".env"), []byte("TUTOR_ENV_TEST_EXISTING=from-file\nTUTOR_ENV_TEST_NEW=literal-value\n"), 0600); e != nil {
		t.Fatal(e)
	}
	t.Chdir(nested)
	t.Setenv("APP_ENV", "test")
	t.Setenv("TUTOR_ENV_TEST_EXISTING", "explicit")
	previous, exists := os.LookupEnv("TUTOR_ENV_TEST_NEW")
	os.Unsetenv("TUTOR_ENV_TEST_NEW")
	t.Cleanup(func() {
		if exists {
			os.Setenv("TUTOR_ENV_TEST_NEW", previous)
		} else {
			os.Unsetenv("TUTOR_ENV_TEST_NEW")
		}
	})
	if e := LoadDevelopmentEnv(); e != nil {
		t.Fatal(e)
	}
	if os.Getenv("TUTOR_ENV_TEST_EXISTING") != "explicit" || os.Getenv("TUTOR_ENV_TEST_NEW") != "literal-value" {
		t.Fatal("environment precedence failed")
	}
	t.Setenv("APP_ENV", "production")
	os.Unsetenv("TUTOR_ENV_TEST_NEW")
	if e := LoadDevelopmentEnv(); e != nil {
		t.Fatal(e)
	}
	if _, exists := os.LookupEnv("TUTOR_ENV_TEST_NEW"); exists {
		t.Fatal("production loaded file")
	}
}
