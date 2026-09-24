package media

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

func TestDirectCloudinaryCapabilities(t *testing.T) {
	c := NewCloudinaryDirect("test-cloud", "test-key", "test-secret")
	now := time.Unix(1700000000, 0)
	id := "private-uploads/" + strings.Repeat("a", 64)
	grant := c.Grant(id, "image", "png", now)
	if grant.URL != "https://api.cloudinary.com/v1_1/test-cloud/image/upload" || grant.Fields["type"] != "authenticated" || grant.Fields["overwrite"] != "false" || grant.Fields["allowed_formats"] != "png" {
		t.Fatal("unrestricted upload grant")
	}
	sum := sha256.Sum256([]byte("allowed_formats=png&overwrite=false&public_id=" + id + "&timestamp=1700000000&type=authenticatedtest-secret"))
	if grant.Fields["signature"] != hex.EncodeToString(sum[:]) {
		t.Fatal("incorrect Cloudinary signature")
	}
	for _, v := range grant.Fields {
		if v == "test-secret" {
			t.Fatal("secret exposed")
		}
	}
	raw := c.Delivery(id, "image", "png", false, now)
	u, _ := url.Parse(raw)
	if u.Query().Get("expires_at") != "1700000300" || u.Query().Get("attachment") != "false" || u.Query().Get("type") != "authenticated" {
		t.Fatal("delivery is not bounded/private")
	}
	response := Asset{PublicID: id, ResourceType: "image", Type: "authenticated", Format: "png", Bytes: 50, Version: 1, AssetID: "asset-id", ETag: "etag", URL: "https://attacker.invalid/file"}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		key, secret, ok := r.BasicAuth()
		if !ok || key != "test-key" || secret != "test-secret" {
			t.Error("missing provider authentication")
		}
		if r.URL.Path != "/resources/image/authenticated/"+id {
			t.Error("incorrect authoritative lookup")
		}
		_ = json.NewEncoder(w).Encode(response)
	}))
	defer server.Close()
	c.UseTestEndpoint(server.URL)
	asset, e := c.Verify(context.Background(), id, "image")
	if e != nil || !strings.HasPrefix(asset.URL, "https://res.cloudinary.com/test-cloud/image/authenticated/v1/") {
		t.Fatal("unverified URL accepted", e)
	}
	for _, change := range []func(){func() { response.Type = "upload" }, func() { response.PublicID = "another-asset" }, func() { response.ResourceType = "raw" }, func() { response.AssetID = "" }} {
		before := response
		change()
		if _, e = c.Verify(context.Background(), id, "image"); e == nil {
			t.Fatal("unrelated or public asset accepted")
		}
		response = before
	}
}
func TestDirectUploadMetadata(t *testing.T) {
	for _, c := range []struct {
		name, mime string
		size       int
		app, valid bool
	}{
		{"photo.jpg", "image/jpeg", 50, true, true}, {"photo.png", "image/png", 50, true, true}, {"resume.pdf", "application/pdf", 50, false, true}, {"intro.mp4", "video/mp4", 50, true, true},
		{"intro.mp4", "video/mp4", 50, false, false}, {"x.svg", "image/svg+xml", 50, true, false}, {"x.jpg", "application/pdf", 50, true, false}, {"x.png", "image/png", MaxBytes + 1, true, false}, {"x.mp4", "video/mp4", MaxVideoBytes + 1, true, false}, {"x.pdf", "application/pdf", 0, true, false},
	} {
		_, _, _, e := UploadMetadata(c.name, c.mime, c.size, c.app)
		if (e == nil) != c.valid {
			t.Errorf("%s: %v", c.name, e)
		}
	}
}
