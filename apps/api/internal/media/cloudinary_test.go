package media

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestCloudinaryPrivateDocuments(t *testing.T) {
	for _, extension := range []string{"pdf", "jpg", "png"} {
		t.Run(extension, func(t *testing.T) {
			data := []byte("original fixture document bytes")
			key := strings.Repeat("b", 64) + "." + extension
			mode := "authenticated"
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch r.URL.Path {
				case "/raw/upload":
					if e := r.ParseMultipartForm(MaxBytes); e != nil {
						t.Error(e)
						w.WriteHeader(400)
						return
					}
					defer r.MultipartForm.RemoveAll()
					if r.FormValue("public_id") != "private-documents/"+key || r.FormValue("type") != "authenticated" {
						t.Error("document asset is not private")
					}
					f, header, e := r.FormFile("file")
					if e != nil {
						t.Error(e)
						return
					}
					defer f.Close()
					body, _ := io.ReadAll(f)
					if !bytes.Equal(body, data) || header.Filename != "original."+extension {
						t.Error("original changed")
					}
					fmt.Fprintf(w, `{"public_id":"private-documents/%s","resource_type":"raw","type":"%s","bytes":%d}`, key, mode, len(data))
				case "/raw/download":
					p := r.URL.Query()
					if p.Get("public_id") != "private-documents/"+key || p.Get("format") != extension || p.Get("type") != "authenticated" || p.Get("expires_at") == "" {
						t.Error("incorrect private download")
					}
					canonical := "expires_at=" + p.Get("expires_at") + "&format=" + extension + "&public_id=private-documents/" + key + "&timestamp=" + p.Get("timestamp") + "&type=authenticatedtest-secret"
					sum := sha256.Sum256([]byte(canonical))
					if p.Get("signature") != hex.EncodeToString(sum[:]) {
						t.Error("download signature does not match")
					}
					w.Write(data)
				default:
					t.Error("document went to the wrong endpoint")
					w.WriteHeader(404)
				}
			}))
			defer server.Close()
			c := NewCloudinaryDocuments("test-cloud", "test-key", "test-secret")
			c.endpoint = server.URL + "/raw"
			if e := c.Put(context.Background(), key, data); e != nil {
				t.Fatal(e)
			}
			got, e := c.Read(context.Background(), key)
			if e != nil || !bytes.Equal(got, data) {
				t.Fatal("document retrieval failed")
			}
			mode = "upload"
			if e := c.Put(context.Background(), key, data); e == nil {
				t.Fatal("accepted public document")
			}
			for _, invalid := range []string{"../other.pdf", strings.Repeat("b", 64), strings.Repeat("b", 64) + ".html", url.QueryEscape(key) + "?download=1"} {
				if _, e := c.Read(context.Background(), invalid); e == nil {
					t.Fatal("invalid document key accepted")
				}
			}
		})
	}
}

func TestCloudinaryAuthenticatedOriginal(t *testing.T) {
	data := []byte("fictional video bytes; file validation is tested separately")
	key := strings.Repeat("a", 64)
	public := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/video/upload":
			if e := r.ParseMultipartForm(MaxVideoBytes); e != nil {
				t.Error(e)
				w.WriteHeader(400)
				return
			}
			defer r.MultipartForm.RemoveAll()
			if r.FormValue("type") != "authenticated" || r.FormValue("public_id") != "tutor-applications/"+key || r.FormValue("api_key") != "fixture-key" || r.FormValue("overwrite") != "true" {
				t.Error("upload is not authenticated and server-keyed")
			}
			canonical := "overwrite=true&public_id=tutor-applications/" + key + "&timestamp=" + r.FormValue("timestamp") + "&type=authenticatedfixture-secret"
			sum := sha256.Sum256([]byte(canonical))
			if r.FormValue("signature") != hex.EncodeToString(sum[:]) {
				t.Error("incorrect upload signature")
			}
			f, _, e := r.FormFile("file")
			if e != nil {
				t.Error(e)
				return
			}
			defer f.Close()
			body, _ := io.ReadAll(f)
			if !bytes.Equal(body, data) {
				t.Error("upload changed original")
			}
			kind := "authenticated"
			if public {
				kind = "upload"
			}
			fmt.Fprintf(w, `{"public_id":"tutor-applications/%s","resource_type":"video","type":"%s","format":"mp4","bytes":%d}`, key, kind, len(data))
		case "/video/download":
			p := r.URL.Query()
			if p.Get("type") != "authenticated" || p.Get("expires_at") == "" || p.Get("public_id") != "tutor-applications/"+key || p.Get("signature") == "" {
				t.Error("unsigned private retrieval")
			}
			w.Write(data)
		default:
			t.Error("unexpected endpoint")
			w.WriteHeader(404)
		}
	}))
	defer server.Close()
	c := NewCloudinary("fixture-cloud", "fixture-key", "fixture-secret")
	c.endpoint = server.URL + "/video"
	if e := c.Put(context.Background(), key, data); e != nil {
		t.Fatal(e)
	}
	got, e := c.Read(context.Background(), key)
	if e != nil || !bytes.Equal(got, data) {
		t.Fatal("original retrieval failed")
	}
	public = true
	if e = c.Put(context.Background(), key, data); e == nil {
		t.Fatal("accepted public asset")
	}
	if _, e = c.Read(context.Background(), "../other"); e == nil {
		t.Fatal("accepted foreign asset key")
	}
}
