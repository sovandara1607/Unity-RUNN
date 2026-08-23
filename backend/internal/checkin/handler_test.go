package checkin

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/unity-run-club/api/internal/auth"
)

func newTestRouter(svc *Service, tokens *auth.TokenIssuer) http.Handler {
	h := NewHandler(svc)
	r := chi.NewRouter()
	r.With(auth.RequireAuth(tokens, auth.RoleStaff)).Post("/api/v1/check-in", h.CheckIn)
	return r
}

func TestHandler_CheckIn_RequiresStaffRole(t *testing.T) {
	svc, _, regs := newTestService()
	regs.seedConfirmed("raw-token-1")
	tokens := auth.NewTokenIssuer("test-secret", time.Hour)
	router := newTestRouter(svc, tokens)

	userToken, _ := tokens.GenerateAccessToken(uuid.New(), auth.RoleUser)
	body, _ := json.Marshal(CheckInRequest{Token: "raw-token-1"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/check-in", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+userToken)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusForbidden, rec.Body.String())
	}
}

func TestHandler_CheckIn_FullFlow(t *testing.T) {
	svc, _, regs := newTestService()
	regs.seedConfirmed("raw-token-1")
	tokens := auth.NewTokenIssuer("test-secret", time.Hour)
	router := newTestRouter(svc, tokens)

	staffToken, _ := tokens.GenerateAccessToken(uuid.New(), auth.RoleStaff)
	body, _ := json.Marshal(CheckInRequest{Token: "raw-token-1"})

	req1 := httptest.NewRequest(http.MethodPost, "/api/v1/check-in", bytes.NewReader(body))
	req1.Header.Set("Authorization", "Bearer "+staffToken)
	rec1 := httptest.NewRecorder()
	router.ServeHTTP(rec1, req1)
	if rec1.Code != http.StatusCreated {
		t.Fatalf("first check-in status = %d, want %d, body=%s", rec1.Code, http.StatusCreated, rec1.Body.String())
	}

	// Second scan of the same token must 409.
	req2 := httptest.NewRequest(http.MethodPost, "/api/v1/check-in", bytes.NewReader(body))
	req2.Header.Set("Authorization", "Bearer "+staffToken)
	rec2 := httptest.NewRecorder()
	router.ServeHTTP(rec2, req2)
	if rec2.Code != http.StatusConflict {
		t.Fatalf("second check-in status = %d, want %d, body=%s", rec2.Code, http.StatusConflict, rec2.Body.String())
	}
}

func TestHandler_CheckIn_InvalidToken(t *testing.T) {
	svc, _, _ := newTestService()
	tokens := auth.NewTokenIssuer("test-secret", time.Hour)
	router := newTestRouter(svc, tokens)

	staffToken, _ := tokens.GenerateAccessToken(uuid.New(), auth.RoleStaff)
	body, _ := json.Marshal(CheckInRequest{Token: "bogus"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/check-in", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+staffToken)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusNotFound, rec.Body.String())
	}
}
