package media

import (
	"bytes"
	"context"
	"crypto/sha256"
	"errors"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

const MaxBytes = 3 * 1024 * 1024
const MaxVideoBytes = 25 * 1024 * 1024

var keyPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)
var ErrStorage = errors.New("private file storage unavailable")

type Store interface {
	Put(context.Context, string, []byte) error
	Read(context.Context, string) ([]byte, error)
}

type Disk struct{ root string }

func NewDisk(root string) (*Disk, error) {
	if !filepath.IsAbs(root) {
		return nil, ErrStorage
	}
	for _, part := range strings.Split(strings.ToLower(filepath.ToSlash(filepath.Clean(root))), "/") {
		if part == "public" || part == "dist" || part == "web" {
			return nil, ErrStorage
		}
	}
	if e := os.MkdirAll(root, 0700); e != nil {
		return nil, ErrStorage
	}
	return &Disk{root: root}, nil
}
func (d *Disk) Put(ctx context.Context, key string, data []byte) error {
	if !keyPattern.MatchString(key) || len(data) > MaxVideoBytes || ctx.Err() != nil {
		return ErrStorage
	}
	root, e := os.OpenRoot(d.root)
	if e != nil {
		return ErrStorage
	}
	defer root.Close()
	f, e := root.OpenFile(key, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if os.IsExist(e) {
		old, err := d.Read(ctx, key)
		if err == nil && sha256.Sum256(old) == sha256.Sum256(data) {
			return nil
		}
		return ErrStorage
	}
	if e != nil {
		return ErrStorage
	}
	_, e = f.Write(data)
	if e == nil {
		e = f.Sync()
	}
	closeErr := f.Close()
	if e != nil || closeErr != nil {
		return ErrStorage
	}
	return nil
}
func (d *Disk) Read(ctx context.Context, key string) ([]byte, error) {
	if !keyPattern.MatchString(key) || ctx.Err() != nil {
		return nil, ErrStorage
	}
	root, e := os.OpenRoot(d.root)
	if e != nil {
		return nil, ErrStorage
	}
	defer root.Close()
	f, e := root.Open(key)
	if e != nil {
		return nil, ErrStorage
	}
	defer f.Close()
	return boundedRead(f)
}
func boundedRead(r io.Reader) ([]byte, error) {
	data, e := io.ReadAll(io.LimitReader(r, MaxVideoBytes+1))
	if e != nil || len(data) > MaxVideoBytes {
		return nil, ErrStorage
	}
	return data, nil
}

type S3 struct {
	client *s3.Client
	bucket string
}

func NewS3(endpoint, region, bucket, key, secret string) *S3 {
	cfg := aws.Config{Region: region, Credentials: aws.NewCredentialsCache(credentials.NewStaticCredentialsProvider(key, secret, "")), HTTPClient: &http.Client{Timeout: 10 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}
	client := s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(endpoint)
		o.UsePathStyle = true
		o.RetryMaxAttempts = 2
	})
	return &S3{client: client, bucket: bucket}
}
func (s *S3) Put(ctx context.Context, key string, data []byte) error {
	if !keyPattern.MatchString(key) || len(data) > MaxVideoBytes {
		return ErrStorage
	}
	_, e := s.client.PutObject(ctx, &s3.PutObjectInput{Bucket: aws.String(s.bucket), Key: aws.String("private/" + key), Body: bytes.NewReader(data), ContentType: aws.String("application/octet-stream"), ServerSideEncryption: types.ServerSideEncryptionAes256})
	if e != nil {
		return ErrStorage
	}
	return nil
}
func (s *S3) Read(ctx context.Context, key string) ([]byte, error) {
	if !keyPattern.MatchString(key) {
		return nil, ErrStorage
	}
	r, e := s.client.GetObject(ctx, &s3.GetObjectInput{Bucket: aws.String(s.bucket), Key: aws.String("private/" + key)})
	if e != nil {
		return nil, ErrStorage
	}
	defer r.Body.Close()
	return boundedRead(r.Body)
}
