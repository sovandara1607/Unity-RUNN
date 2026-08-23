package events

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/unity-run-club/api/internal/auth"
)

const testJWTSecret = "test-secret"

func newTestTokens() *auth.TokenIssuer {
	return auth.NewTokenIssuer(testJWTSecret, time.Hour)
}

func bearerToken(t *testing.T, tokens *auth.TokenIssuer, role auth.Role) string {
	t.Helper()
	tok, err := tokens.GenerateAccessToken(uuid.New(), role)
	if err != nil {
		t.Fatalf("GenerateAccessToken() error = %v", err)
	}
	return tok
}

func newTestRouter(h *Handler, tokens *auth.TokenIssuer) http.Handler {
	r := chi.NewRouter()
	r.Route("/api/v1/events", func(ev chi.Router) {
		ev.With(auth.OptionalAuth(tokens)).Get("/", h.List)
		ev.With(auth.OptionalAuth(tokens)).Get("/{slug}", h.GetBySlug)
		ev.With(auth.RequireAuth(tokens, auth.RoleAdmin)).Post("/", h.Create)
		ev.With(auth.RequireAuth(tokens, auth.RoleAdmin)).Patch("/{id}", h.Update)
		ev.With(auth.RequireAuth(tokens, auth.RoleAdmin)).Delete("/{id}", h.Delete)
	})
	return r
}

func TestHandler_GetBySlug_HiddenForPublicWhenDraft(t *testing.T) {
	repo := newFakeRepo()
	svc := NewService(repo, nil)
	h := NewHandler(svc)
	tokens := newTestTokens()
	router := newTestRouter(h, tokens)

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

func TestHandler_GetBySlug_VisibleForStaff(t *testing.T) {
	repo := newFakeRepo()
	svc := NewService(repo, nil)
	h := NewHandler(svc)
	tokens := newTestTokens()
	router := newTestRouter(h, tokens)

	e, err := svc.Create(context.Background(), validCreateReq("Founders Run"))
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/events/"+e.Slug, nil)
	req.Header.Set("Authorization", "Bearer "+bearerToken(t, tokens, auth.RoleStaff))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
}

func TestHandler_Create_RequiresAuth(t *testing.T) {
	repo := newFakeRepo()
	tokens := newTestTokens()
	router := newTestRouter(NewHandler(NewService(repo, nil)), tokens)

	body, _ := json.Marshal(validCreateReq("Founders Run"))
	req := httptest.NewRequest(http.MethodPost, "/api/v1/events/", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusUnauthorized, rec.Body.String())
	}
}

func TestHandler_Create_InsufficientRoleForbidden(t *testing.T) {
	repo := newFakeRepo()
	tokens := newTestTokens()
	router := newTestRouter(NewHandler(NewService(repo, nil)), tokens)

	body, _ := json.Marshal(validCreateReq("Founders Run"))
	req := httptest.NewRequest(http.MethodPost, "/api/v1/events/", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+bearerToken(t, tokens, auth.RoleUser))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusForbidden, rec.Body.String())
	}
}

func TestHandler_Create_ValidationFailure(t *testing.T) {
	repo := newFakeRepo()
	tokens := newTestTokens()
	router := newTestRouter(NewHandler(NewService(repo, nil)), tokens)

	// Missing required fields (name, event_date, start_time).
	body, _ := json.Marshal(map[string]string{})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/events/", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+bearerToken(t, tokens, auth.RoleAdmin))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusUnprocessableEntity, rec.Body.String())
	}
}

func TestHandler_Create_Success(t *testing.T) {
	repo := newFakeRepo()
	tokens := newTestTokens()
	router := newTestRouter(NewHandler(NewService(repo, nil)), tokens)

	body, _ := json.Marshal(validCreateReq("Founders Run"))
	req := httptest.NewRequest(http.MethodPost, "/api/v1/events/", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+bearerToken(t, tokens, auth.RoleAdmin))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusCreated, rec.Body.String())
	}
}

func TestHandler_Create_DuplicateSlugConflict(t *testing.T) {
	repo := newFakeRepo()
	tokens := newTestTokens()
	router := newTestRouter(NewHandler(NewService(repo, nil)), tokens)
	adminBearer := "Bearer " + bearerToken(t, tokens, auth.RoleAdmin)

	req1 := validCreateReq("Founders Run")
	req1.Slug = "founders-run"
	body, _ := json.Marshal(req1)
	r1 := httptest.NewRequest(http.MethodPost, "/api/v1/events/", bytes.NewReader(body))
	r1.Header.Set("Authorization", adminBearer)
	router.ServeHTTP(httptest.NewRecorder(), r1)

	r2 := httptest.NewRequest(http.MethodPost, "/api/v1/events/", bytes.NewReader(body))
	r2.Header.Set("Authorization", adminBearer)
	rec2 := httptest.NewRecorder()
	router.ServeHTTP(rec2, r2)

	if rec2.Code != http.StatusConflict {
		t.Fatalf("status = %d, want %d, body=%s", rec2.Code, http.StatusConflict, rec2.Body.String())
	}
}
