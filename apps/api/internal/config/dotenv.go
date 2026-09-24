package config

import (
	"bufio"
	"errors"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// LoadDevelopmentEnv is invoked only by CLI entrypoints, before Load. Explicit
// process variables win. Production receives its environment from systemd.
// Values are literal: no shell, expansion, interpolation or execution occurs.
func LoadDevelopmentEnv() error {
	if os.Getenv("APP_ENV") == "production" {
		return nil
	}
	dir, e := os.Getwd()
	if e != nil {
		return errors.New("cannot locate development configuration")
	}
	for depth := 0; depth < 3; depth++ {
		file, e := os.Open(filepath.Join(dir, ".env"))
		if e == nil {
			defer file.Close()
			values, e := parseDevelopmentEnv(io.LimitReader(file, 65537))
			if e != nil {
				return e
			}
			if values["APP_ENV"] == "production" {
				return errors.New("production environment must be supplied explicitly; .env auto-loading is development only")
			}
			for key, value := range values {
				if _, exists := os.LookupEnv(key); !exists {
					if e = os.Setenv(key, value); e != nil {
						return errors.New("cannot load development configuration")
					}
				}
			}
			return nil
		}
		if !os.IsNotExist(e) {
			return errors.New("cannot read development configuration")
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return nil
}

var envKey = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)

func parseDevelopmentEnv(r io.Reader) (map[string]string, error) {
	out := map[string]string{}
	scanner := bufio.NewScanner(r)
	total := 0
	for scanner.Scan() {
		line := strings.TrimSpace(strings.TrimPrefix(scanner.Text(), "\ufeff"))
		total += len(scanner.Bytes()) + 1
		if total > 65536 {
			return nil, errors.New("development configuration exceeds size limit")
		}
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		line = strings.TrimPrefix(line, "export ")
		key, value, ok := strings.Cut(line, "=")
		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)
		if !ok || !envKey.MatchString(key) {
			return nil, errors.New("invalid development environment entry; use KEY=value")
		}
		if strings.HasPrefix(value, `"`) || strings.HasPrefix(value, "'") {
			if len(value) < 2 || value[len(value)-1] != value[0] {
				return nil, errors.New("invalid quoted development environment value")
			}
			value = value[1 : len(value)-1]
		}
		if strings.ContainsRune(value, 0) {
			return nil, errors.New("invalid development environment value")
		}
		out[key] = value
	}
	if scanner.Err() != nil {
		return nil, errors.New("cannot parse development configuration")
	}
	return out, nil
}
