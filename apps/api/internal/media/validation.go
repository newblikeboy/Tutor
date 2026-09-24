package media

import (
	"bytes"
	"encoding/binary"
	"errors"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"net/http"
	"path"
	"strings"
	"unicode"
)

// Application videos remain private and quarantined. Container checks are not a virus scan.
func ValidateApplication(name string, data []byte) (string, string, error) {
	if strings.ToLower(path.Ext(name)) != ".mp4" {
		return Validate(name, data)
	}
	fail := errors.New("use a valid MP4 of at most 25 MiB")
	if len(data) < 24 || len(data) > MaxVideoBytes || http.DetectContentType(data) != "video/mp4" {
		return "", "", fail
	}
	moov, mdat := false, false
	for offset := 0; offset < len(data); {
		if len(data)-offset < 8 {
			return "", "", fail
		}
		n := uint64(binary.BigEndian.Uint32(data[offset : offset+4]))
		header := 8
		if n == 1 {
			if len(data)-offset < 16 {
				return "", "", fail
			}
			n = binary.BigEndian.Uint64(data[offset+8 : offset+16])
			header = 16
		}
		if n == 0 {
			n = uint64(len(data) - offset)
		}
		if n <= uint64(header) || n > uint64(len(data)-offset) {
			return "", "", fail
		}
		switch string(data[offset+4 : offset+8]) {
		case "moov":
			moov = true
		case "mdat":
			mdat = true
		}
		offset += int(n)
	}
	if !moov || !mdat {
		return "", "", fail
	}
	name = path.Base(strings.ReplaceAll(name, `\`, "/"))
	name = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) || unicode.Is(unicode.Cf, r) || strings.ContainsRune(`<>:"|?*`, r) {
			return '_'
		}
		return r
	}, strings.TrimSpace(name))
	if len([]rune(name)) > 100 {
		name = string([]rune(name)[len([]rune(name))-100:])
	}
	return name, "video/mp4", nil
}

func Validate(name string, data []byte) (string, string, error) {
	fail := errors.New("use a valid JPEG, PNG or PDF of at most 3 MiB")
	if len(data) == 0 || len(data) > MaxBytes {
		return "", "", fail
	}
	name = path.Base(strings.ReplaceAll(name, `\`, "/"))
	name = strings.TrimSpace(name)
	name = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) || unicode.Is(unicode.Cf, r) || strings.ContainsRune(`<>:"|?*`, r) {
			return '_'
		}
		return r
	}, name)
	if len([]rune(name)) > 100 {
		name = string([]rune(name)[len([]rune(name))-100:])
	}
	kind := http.DetectContentType(data)
	extension := strings.ToLower(path.Ext(name))
	switch kind {
	case "image/jpeg", "image/png":
		if (kind == "image/jpeg" && extension != ".jpg" && extension != ".jpeg") || (kind == "image/png" && extension != ".png") {
			return "", "", fail
		}
		cfg, _, e := image.DecodeConfig(bytes.NewReader(data))
		if e != nil || cfg.Width < 1 || cfg.Height < 1 || int64(cfg.Width)*int64(cfg.Height) > 20000000 {
			return "", "", fail
		}
		if _, _, e = image.Decode(bytes.NewReader(data)); e != nil {
			return "", "", fail
		}
	case "application/pdf":
		if extension != ".pdf" || !bytes.HasPrefix(data, []byte("%PDF-")) || !bytes.Contains(data[max(0, len(data)-1024):], []byte("%%EOF")) {
			return "", "", fail
		}
	default:
		return "", "", fail
	}
	return name, kind, nil
}
