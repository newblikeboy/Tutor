package media

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Cloudinary stores original files as authenticated assets. Signed retrieval URLs
// stay on the server; the application still controls scanning and every download.
type Cloudinary struct {
	endpoint, key, secret        string
	client                       *http.Client
	resourceType, prefix, format string
	maxBytes                     int
}

func NewCloudinary(cloud, key, secret string) *Cloudinary {
	return newCloudinary(cloud, key, secret, "video", "tutor-applications/", "mp4", MaxVideoBytes)
}

// Raw storage preserves PDF/image bytes without document conversions.
func NewCloudinaryDocuments(cloud, key, secret string) *Cloudinary {
	return newCloudinary(cloud, key, secret, "raw", "private-documents/", "", MaxBytes)
}
func newCloudinary(cloud, key, secret, resource, prefix, format string, limit int) *Cloudinary {
	return &Cloudinary{endpoint: "https://api.cloudinary.com/v1_1/" + url.PathEscape(cloud) + "/" + resource, key: key, secret: secret, resourceType: resource, prefix: prefix, format: format, maxBytes: limit, client: &http.Client{Timeout: 20 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}
}
func (c *Cloudinary) publicID(key string) string {
	return c.prefix + key
}

var cloudinaryDocumentKey = regexp.MustCompile(`^[a-f0-9]{64}\.(pdf|jpg|png)$`)

func (c *Cloudinary) validKey(key string) bool {
	if c.resourceType == "raw" {
		return cloudinaryDocumentKey.MatchString(key)
	}
	return keyPattern.MatchString(key)
}
func (c *Cloudinary) fileFormat(key string) string {
	if c.resourceType == "raw" {
		return key[strings.LastIndexByte(key, '.')+1:]
	}
	return c.format
}
func (c *Cloudinary) sign(p url.Values) {
	keys := make([]string, 0, len(p))
	for k := range p {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		parts = append(parts, k+"="+p.Get(k))
	}
	sum := sha256.Sum256([]byte(strings.Join(parts, "&") + c.secret))
	p.Set("signature", hex.EncodeToString(sum[:]))
	p.Set("api_key", c.key)
}
func (c *Cloudinary) Put(ctx context.Context, key string, data []byte) error {
	if !c.validKey(key) || len(data) == 0 || len(data) > c.maxBytes {
		return ErrStorage
	}
	p := url.Values{"public_id": {c.publicID(key)}, "type": {"authenticated"}, "overwrite": {"true"}, "timestamp": {strconv.FormatInt(time.Now().Unix(), 10)}}
	c.sign(p)
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for k, v := range p {
		if e := writer.WriteField(k, v[0]); e != nil {
			return ErrStorage
		}
	}
	file, e := writer.CreateFormFile("file", "original."+c.fileFormat(key))
	if e != nil {
		return ErrStorage
	}
	if _, e = file.Write(data); e != nil {
		return ErrStorage
	}
	if e = writer.Close(); e != nil {
		return ErrStorage
	}
	req, e := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint+"/upload", &body)
	if e != nil {
		return ErrStorage
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	res, e := c.client.Do(req)
	if e != nil {
		return ErrStorage
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return ErrStorage
	}
	var saved struct {
		PublicID     string `json:"public_id"`
		ResourceType string `json:"resource_type"`
		Type         string `json:"type"`
		Bytes        int    `json:"bytes"`
		Format       string `json:"format"`
	}
	if json.NewDecoder(io.LimitReader(res.Body, 64*1024)).Decode(&saved) != nil || saved.PublicID != p.Get("public_id") || saved.ResourceType != c.resourceType || saved.Type != "authenticated" || (c.resourceType == "video" && saved.Format != c.format) || saved.Bytes != len(data) {
		return ErrStorage
	}
	return nil
}
func (c *Cloudinary) Read(ctx context.Context, key string) ([]byte, error) {
	if !c.validKey(key) {
		return nil, ErrStorage
	}
	now := time.Now()
	p := url.Values{"public_id": {c.publicID(key)}, "format": {c.fileFormat(key)}, "type": {"authenticated"}, "timestamp": {strconv.FormatInt(now.Unix(), 10)}, "expires_at": {strconv.FormatInt(now.Add(time.Minute).Unix(), 10)}}
	c.sign(p)
	req, e := http.NewRequestWithContext(ctx, http.MethodGet, c.endpoint+"/download?"+p.Encode(), nil)
	if e != nil {
		return nil, ErrStorage
	}
	res, e := c.client.Do(req)
	if e != nil {
		return nil, ErrStorage
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return nil, ErrStorage
	}
	data, e := io.ReadAll(io.LimitReader(res.Body, int64(c.maxBytes)+1))
	if e != nil || len(data) > c.maxBytes {
		return nil, ErrStorage
	}
	return data, nil
}
