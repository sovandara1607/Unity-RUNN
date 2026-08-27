package objectstore

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type fakePutClient struct{ input *s3.PutObjectInput }

func (f *fakePutClient) HeadBucket(_ context.Context, _ *s3.HeadBucketInput, _ ...func(*s3.Options)) (*s3.HeadBucketOutput, error) {
	return &s3.HeadBucketOutput{}, nil
}

func (f *fakePutClient) PutObject(_ context.Context, input *s3.PutObjectInput, _ ...func(*s3.Options)) (*s3.PutObjectOutput, error) {
	f.input = input
	return &s3.PutObjectOutput{}, nil
}

func (f *fakePutClient) GetObject(_ context.Context, _ *s3.GetObjectInput, _ ...func(*s3.Options)) (*s3.GetObjectOutput, error) {
	return nil, ErrNotFound
}

func (f *fakePutClient) DeleteObject(_ context.Context, _ *s3.DeleteObjectInput, _ ...func(*s3.Options)) (*s3.DeleteObjectOutput, error) {
	return &s3.DeleteObjectOutput{}, nil
}

func TestLocalPut(t *testing.T) {
	root := t.TempDir()
	store := NewLocal(root, "/uploads")
	url, err := store.Put(context.Background(), "events/poster.png", "image/png", bytes.NewBufferString("png"), 3)
	if err != nil {
		t.Fatalf("Put() error = %v", err)
	}
	if url != "/uploads/events/poster.png" {
		t.Fatalf("url = %q", url)
	}
	data, err := os.ReadFile(filepath.Join(root, "events", "poster.png"))
	if err != nil || string(data) != "png" {
		t.Fatalf("stored data = %q, error = %v", data, err)
	}
}

func TestNormalizeR2EndpointAcceptsDashboardBucketURL(t *testing.T) {
	got, err := normalizeR2Endpoint("https://account.r2.cloudflarestorage.com/unity-runn-club", "unity-runn-club")
	if err != nil {
		t.Fatalf("normalizeR2Endpoint() error = %v", err)
	}
	if got != "https://account.r2.cloudflarestorage.com" {
		t.Fatalf("endpoint = %q", got)
	}
}

func TestSafeKeyRejectsTraversal(t *testing.T) {
	for _, key := range []string{"../secret", "events/../../secret", "/absolute"} {
		if _, err := safeKey(key); err == nil {
			t.Fatalf("safeKey(%q) accepted an unsafe key", key)
		}
	}
}

func TestR2PutUsesBucketKeyAndPublicURL(t *testing.T) {
	client := &fakePutClient{}
	store := &R2{client: client, bucket: "unity-runn-club", publicURL: "https://assets.example.com"}
	got, err := store.Put(context.Background(), "events/poster.png", "image/png", bytes.NewBufferString("png"), 3)
	if err != nil {
		t.Fatalf("Put() error = %v", err)
	}
	if got != "https://assets.example.com/events/poster.png" {
		t.Fatalf("url = %q", got)
	}
	if client.input == nil || *client.input.Bucket != "unity-runn-club" || *client.input.Key != "events/poster.png" {
		t.Fatalf("PutObject input = %#v", client.input)
	}
}

func TestR2Integration(t *testing.T) {
	if os.Getenv("R2_INTEGRATION") != "1" {
		t.Skip("set R2_INTEGRATION=1 to exercise a real bucket")
	}
	store, err := NewR2(
		os.Getenv("R2_ENDPOINT"), os.Getenv("R2_ACCESS_KEY_ID"),
		os.Getenv("R2_SECRET_ACCESS_KEY"), os.Getenv("R2_BUCKET"), "/api/v1/media",
	)
	if err != nil {
		t.Fatalf("NewR2() error = %v", err)
	}
	key := fmt.Sprintf("system/smoke-%d.txt", time.Now().UnixNano())
	defer func() {
		if err := store.Delete(context.Background(), key); err != nil {
			t.Errorf("cleanup Delete() error = %v", err)
		}
	}()
	if _, err := store.Put(context.Background(), key, "text/plain", bytes.NewBufferString("r2-ok"), 5); err != nil {
		t.Fatalf("Put() error = %v", err)
	}
	object, err := store.Get(context.Background(), key)
	if err != nil {
		t.Fatalf("Get() error = %v", err)
	}
	defer object.Body.Close()
	data, err := io.ReadAll(object.Body)
	if err != nil || string(data) != "r2-ok" {
		t.Fatalf("Get() data = %q, error = %v", data, err)
	}
}
