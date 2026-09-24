package media

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// Direct uploads keep file bytes on Cloudinary. Only provider-verified references
// are saved by the application; the API secret never leaves the server.
type Asset struct {
	PublicID     string `json:"public_id"`
	ResourceType string `json:"resource_type"`
	Type         string `json:"type"`
	Format       string `json:"format"`
	Bytes        int    `json:"bytes"`
	Version      int64  `json:"version"`
	AssetID      string `json:"asset_id"`
	ETag         string `json:"etag"`
	URL          string `json:"secure_url"`
}
type UploadGrant struct {
	URL    string            `json:"url"`
	Fields map[string]string `json:"fields"`
}
type DirectStore interface {
	Grant(string, string, string, time.Time) UploadGrant
	Verify(context.Context, string, string) (Asset, error)
	Delivery(string, string, string, bool, time.Time) string
}
type CloudinaryDirect struct {
	cloud, endpoint string
	signer          *Cloudinary
}

func NewCloudinaryDirect(cloud, key, secret string) *CloudinaryDirect {
	return &CloudinaryDirect{cloud: cloud, endpoint: "https://api.cloudinary.com/v1_1/" + url.PathEscape(cloud), signer: NewCloudinary(cloud, key, secret)}
}

// Only the test environment's validated loopback configuration can select this.
func (c *CloudinaryDirect) UseTestEndpoint(endpoint string) { c.endpoint = endpoint }
func (c *CloudinaryDirect) Grant(id, resource, format string, now time.Time) UploadGrant {
	p := url.Values{"public_id": {id}, "type": {"authenticated"}, "overwrite": {"false"}, "allowed_formats": {format}, "timestamp": {strconv.FormatInt(now.Unix(), 10)}}
	c.signer.sign(p)
	fields := map[string]string{}
	for k := range p {
		fields[k] = p.Get(k)
	}
	return UploadGrant{URL: c.endpoint + "/" + resource + "/upload", Fields: fields}
}
func (c *CloudinaryDirect) Verify(ctx context.Context, id, resource string) (Asset, error) {
	var asset Asset
	req, e := http.NewRequestWithContext(ctx, http.MethodGet, c.endpoint+"/resources/"+resource+"/authenticated/"+url.PathEscape(id), nil)
	if e != nil {
		return asset, ErrStorage
	}
	req.SetBasicAuth(c.signer.key, c.signer.secret)
	res, e := c.signer.client.Do(req)
	if e != nil {
		return asset, ErrStorage
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK || json.NewDecoder(io.LimitReader(res.Body, 64*1024)).Decode(&asset) != nil {
		return Asset{}, ErrStorage
	}
	if asset.PublicID != id || asset.ResourceType != resource || asset.Type != "authenticated" || asset.Version < 1 || asset.AssetID == "" || asset.Bytes < 1 {
		return Asset{}, ErrStorage
	}
	// Never store or redirect to a client-supplied URL. Construct the canonical
	// authenticated asset reference from metadata returned by Cloudinary itself.
	suffix := ""
	if resource != "raw" {
		suffix = "." + asset.Format
	}
	asset.URL = "https://res.cloudinary.com/" + url.PathEscape(c.cloud) + "/" + resource + "/authenticated/v" + strconv.FormatInt(asset.Version, 10) + "/" + id + suffix
	return asset, nil
}
func (c *CloudinaryDirect) Delivery(id, resource, format string, attachment bool, now time.Time) string {
	p := url.Values{"public_id": {id}, "type": {"authenticated"}, "timestamp": {strconv.FormatInt(now.Unix(), 10)}, "expires_at": {strconv.FormatInt(now.Add(5*time.Minute).Unix(), 10)}, "attachment": {strconv.FormatBool(attachment)}}
	if format != "" {
		p.Set("format", format)
	}
	c.signer.sign(p)
	return c.endpoint + "/" + resource + "/download?" + p.Encode()
}
func UploadMetadata(name, contentType string, size int, application bool) (string, string, string, error) {
	name = strings.TrimSpace(filepath.Base(strings.ReplaceAll(name, "\\", "/")))
	if name == "" || len(name) > 180 || strings.ContainsAny(name, "\r\n\x00") || size < 1 {
		return "", "", "", ErrStorage
	}
	format, resource, limit := "", "", MaxBytes
	switch strings.ToLower(filepath.Ext(name)) {
	case ".jpg", ".jpeg":
		format, resource = "jpg", "image"
		if contentType != "image/jpeg" {
			return "", "", "", ErrStorage
		}
	case ".png":
		format, resource = "png", "image"
		if contentType != "image/png" {
			return "", "", "", ErrStorage
		}
	case ".pdf":
		format, resource = "pdf", "raw"
		if contentType != "application/pdf" {
			return "", "", "", ErrStorage
		}
	case ".mp4":
		format, resource, limit = "mp4", "video", MaxVideoBytes
		if !application || contentType != "video/mp4" {
			return "", "", "", ErrStorage
		}
	default:
		return "", "", "", ErrStorage
	}
	if size > limit {
		return "", "", "", ErrStorage
	}
	return name, resource, format, nil
}
