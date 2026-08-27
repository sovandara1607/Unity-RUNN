package objectstore

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)

type fakeReader struct{ object *Object }

func (f fakeReader) Get(_ context.Context, key string) (*Object, error) {
	if key != "events/poster.png" || f.object == nil {
		return nil, ErrNotFound
	}
	return f.object, nil
}

func TestMediaHandlerServesCachedObject(t *testing.T) {
	body := io.NopCloser(bytes.NewBufferString("png"))
	size := int64(3)
	router := chi.NewRouter()
	router.Get("/api/v1/media/*", NewMediaHandler(fakeReader{object: &Object{
		Body: body, ContentType: "image/png", ETag: `"etag"`, ContentLength: &size,
	}}).Get)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/v1/media/events/poster.png", nil))
	if recorder.Code != http.StatusOK || recorder.Body.String() != "png" {
		t.Fatalf("status = %d, body = %q", recorder.Code, recorder.Body.String())
	}
	if recorder.Header().Get("Cache-Control") != "public, max-age=31536000, immutable" {
		t.Fatalf("Cache-Control = %q", recorder.Header().Get("Cache-Control"))
	}
}
