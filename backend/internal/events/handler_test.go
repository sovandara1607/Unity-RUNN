package events

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/unity-run-club/api/internal/adminauth"
)

func newTestRouter(h *Handler, adminKey string) http.Handler {
	r := chi.NewRouter()
	r.Route("/api/v1/events", func(ev chi.Router) {
		ev.With(adminauth.WithAdminKey(adminKey)).Get("/", h.List)
		ev.With(adminauth.WithAdminKey(adminKey)).Get("/{slug}", h.GetBySlug)
		ev.With(adminauth.RequireAdminKey(adminKey)).Post("/", h.Create)
		ev.With(adminauth.RequireAdminKey(adminKey)).Patch("/{id}", h.Update)
		ev.With(adminauth.RequireAdminKey(adminKey)).Delete("/{id}", h.Delete)
	})
	return r
}

const testAdminKey = "s3cret"

func TestHandler_GetBySlug_HiddenForPublicWhenDraft(t *testing.T) {
	repo := newFakeRepo()
	svc := NewService(repo)
	h := NewHandler(svc)
	router := newTestRouter(h, testAdminKey)

	e, err := svc.Create(context.Background(), validCreateReq("Founders Run"))
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/events/"+e.Slug, nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusNotFound, rec.Body.String())
	}
}

func TestHandler_GetBySlug_VisibleForAdmin(t *testing.T) {
	repo := newFakeRepo()
	svc := NewService(repo)
	h := NewHandler(svc)
	router := newTestRouter(h, testAdminKey)

	e, err := svc.Create(context.Background(), validCreateReq("Founders Run"))
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/events/"+e.Slug, nil)
	req.Header.Set(adminauth.HeaderName, testAdminKey)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
}

func TestHandler_Create_RequiresAdminKey(t *testing.T) {
	repo := newFakeRepo()
	h := NewHandler(NewService(repo))
	router := newTestRouter(h, testAdminKey)

	body, _ := json.Marshal(validCreateReq("Founders Run"))
	req := httptest.NewRequest(http.MethodPost, "/api/v1/events/", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusUnauthorized, rec.Body.String())
	}
}

func TestHandler_Create_ValidationFailure(t *testing.T) {
	repo := newFakeRepo()
	h := NewHandler(NewService(repo))
	router := newTestRouter(h, testAdminKey)

	// Missing required fields (name, event_date, start_time).
	body, _ := json.Marshal(map[string]string{})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/events/", bytes.NewReader(body))
	req.Header.Set(adminauth.HeaderName, testAdminKey)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusUnprocessableEntity, rec.Body.String())
	}
}

func TestHandler_Create_Success(t *testing.T) {
	repo := newFakeRepo()
	h := NewHandler(NewService(repo))
	router := newTestRouter(h, testAdminKey)

	body, _ := json.Marshal(validCreateReq("Founders Run"))
	req := httptest.NewRequest(http.MethodPost, "/api/v1/events/", bytes.NewReader(body))
	req.Header.Set(adminauth.HeaderName, testAdminKey)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusCreated, rec.Body.String())
	}
}

func TestHandler_Create_DuplicateSlugConflict(t *testing.T) {
	repo := newFakeRepo()
	h := NewHandler(NewService(repo))
	router := newTestRouter(h, testAdminKey)

	req1 := validCreateReq("Founders Run")
	req1.Slug = "founders-run"
	body, _ := json.Marshal(req1)
	r1 := httptest.NewRequest(http.MethodPost, "/api/v1/events/", bytes.NewReader(body))
	r1.Header.Set(adminauth.HeaderName, testAdminKey)
	httptest.NewRecorder()
	router.ServeHTTP(httptest.NewRecorder(), r1)

	r2 := httptest.NewRequest(http.MethodPost, "/api/v1/events/", bytes.NewReader(body))
	r2.Header.Set(adminauth.HeaderName, testAdminKey)
	rec2 := httptest.NewRecorder()
	router.ServeHTTP(rec2, r2)

	if rec2.Code != http.StatusConflict {
		t.Fatalf("status = %d, want %d, body=%s", rec2.Code, http.StatusConflict, rec2.Body.String())
	}
}
