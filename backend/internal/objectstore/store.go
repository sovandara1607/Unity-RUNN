package objectstore

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/smithy-go"
)

var ErrNotFound = errors.New("objectstore: object not found")

type Store interface {
	Put(ctx context.Context, key, contentType string, body io.Reader, size int64) (string, error)
}

type HealthChecker interface {
	Ping(ctx context.Context) error
}

type Local struct {
	root      string
	publicURL string
}

func NewLocal(root, publicURL string) *Local {
	return &Local{root: root, publicURL: strings.TrimRight(publicURL, "/")}
}

func (s *Local) Ping(_ context.Context) error {
	info, err := os.Stat(s.root)
	if err != nil {
		return fmt.Errorf("objectstore: local root unavailable: %w", err)
	}
	if !info.IsDir() {
		return fmt.Errorf("objectstore: local root is not a directory")
	}
	return nil
}

func (s *Local) Put(_ context.Context, key, _ string, body io.Reader, _ int64) (string, error) {
	cleanKey, err := safeKey(key)
	if err != nil {
		return "", err
	}
	path := filepath.Join(s.root, filepath.FromSlash(cleanKey))
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return "", fmt.Errorf("objectstore: create local directory: %w", err)
	}
	dst, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return "", fmt.Errorf("objectstore: create local object: %w", err)
	}
	if _, err := io.Copy(dst, body); err != nil {
		_ = dst.Close()
		_ = os.Remove(path)
		return "", fmt.Errorf("objectstore: write local object: %w", err)
	}
	if err := dst.Close(); err != nil {
		_ = os.Remove(path)
		return "", fmt.Errorf("objectstore: close local object: %w", err)
	}
	return s.publicURL + "/" + cleanKey, nil
}

type r2API interface {
	HeadBucket(context.Context, *s3.HeadBucketInput, ...func(*s3.Options)) (*s3.HeadBucketOutput, error)
	PutObject(context.Context, *s3.PutObjectInput, ...func(*s3.Options)) (*s3.PutObjectOutput, error)
	GetObject(context.Context, *s3.GetObjectInput, ...func(*s3.Options)) (*s3.GetObjectOutput, error)
	DeleteObject(context.Context, *s3.DeleteObjectInput, ...func(*s3.Options)) (*s3.DeleteObjectOutput, error)
}

func (s *R2) Ping(ctx context.Context) error {
	if _, err := s.client.HeadBucket(ctx, &s3.HeadBucketInput{Bucket: aws.String(s.bucket)}); err != nil {
		return fmt.Errorf("objectstore: R2 bucket unavailable: %w", err)
	}
	return nil
}

func (s *R2) Delete(ctx context.Context, key string) error {
	cleanKey, err := safeKey(key)
	if err != nil {
		return err
	}
	_, err = s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(cleanKey),
	})
	if err != nil {
		return fmt.Errorf("objectstore: delete from R2: %w", err)
	}
	return nil
}

type R2 struct {
	client    r2API
	bucket    string
	publicURL string
}

type Object struct {
	Body          io.ReadCloser
	ContentType   string
	CacheControl  string
	ETag          string
	ContentLength *int64
}

type Reader interface {
	Get(ctx context.Context, key string) (*Object, error)
}

// NewR2 builds a path-style S3 client for Cloudflare R2. endpoint may be the
// dashboard URL with or without the trailing /<bucket> segment.
func NewR2(endpoint, accessKeyID, secretAccessKey, bucket, publicURL string) (*R2, error) {
	endpoint, err := normalizeR2Endpoint(endpoint, bucket)
	if err != nil {
		return nil, err
	}
	client := s3.NewFromConfig(aws.Config{
		Region:      "auto",
		Credentials: credentials.NewStaticCredentialsProvider(accessKeyID, secretAccessKey, ""),
	}, func(options *s3.Options) {
		options.BaseEndpoint = aws.String(endpoint)
		options.UsePathStyle = true
	})
	return &R2{client: client, bucket: bucket, publicURL: strings.TrimRight(publicURL, "/")}, nil
}

func (s *R2) Put(ctx context.Context, key, contentType string, body io.Reader, size int64) (string, error) {
	cleanKey, err := safeKey(key)
	if err != nil {
		return "", err
	}
	_, err = s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:        aws.String(s.bucket),
		Key:           aws.String(cleanKey),
		Body:          body,
		ContentLength: aws.Int64(size),
		ContentType:   aws.String(contentType),
		CacheControl:  aws.String("public, max-age=31536000, immutable"),
	})
	if err != nil {
		return "", fmt.Errorf("objectstore: upload to R2: %w", err)
	}
	return s.publicURL + "/" + cleanKey, nil
}

func (s *R2) Get(ctx context.Context, key string) (*Object, error) {
	cleanKey, err := safeKey(key)
	if err != nil {
		return nil, ErrNotFound
	}
	result, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(cleanKey),
	})
	if err != nil {
		var apiErr smithy.APIError
		if errors.As(err, &apiErr) && (apiErr.ErrorCode() == "NoSuchKey" || apiErr.ErrorCode() == "NotFound") {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("objectstore: read from R2: %w", err)
	}
	return &Object{
		Body:          result.Body,
		ContentType:   aws.ToString(result.ContentType),
		CacheControl:  aws.ToString(result.CacheControl),
		ETag:          aws.ToString(result.ETag),
		ContentLength: result.ContentLength,
	}, nil
}

func normalizeR2Endpoint(raw, bucket string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" {
		return "", fmt.Errorf("objectstore: R2 endpoint must be a valid https URL")
	}
	path := strings.Trim(parsed.Path, "/")
	if path != "" && path != bucket {
		return "", fmt.Errorf("objectstore: R2 endpoint path must be empty or match the bucket")
	}
	parsed.Path, parsed.RawPath, parsed.RawQuery, parsed.Fragment = "", "", "", ""
	return strings.TrimRight(parsed.String(), "/"), nil
}

func safeKey(key string) (string, error) {
	key = strings.TrimSpace(strings.ReplaceAll(key, "\\", "/"))
	clean := strings.TrimPrefix(filepath.ToSlash(filepath.Clean("/"+key)), "/")
	if key == "" || clean == "." || clean != key || strings.Contains(clean, "../") {
		return "", fmt.Errorf("objectstore: invalid object key")
	}
	return clean, nil
}
