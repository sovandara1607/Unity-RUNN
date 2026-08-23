package registrations

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
	"github.com/unity-run-club/api/internal/payments"
)

func newTestRouter(svc *Service, tokens *auth.TokenIssuer) http.Handler {
	h := NewHandler(svc)
	r := chi.NewRouter()
	r.Route("/api/v1", func(api chi.Router) {
		api.Get("/events/{eventId}/categories/{categoryId}/availability", h.Availability)
		api.With(auth.RequireAuth(tokens, auth.RoleUser)).Post("/events/{eventId}/registrations", h.Register)
		api.Route("/registrations", func(reg chi.Router) {
			reg.Use(auth.RequireAuth(tokens, auth.RoleUser))
			reg.Get("/{id}", h.GetByID)
			reg.Post("/{id}/cancel", h.Cancel)
		})
	})
	return r
}

func bearerFor(t *testing.T, tokens *auth.TokenIssuer, userID uuid.UUID, role auth.Role) string {
	t.Helper()
	tok, err := tokens.GenerateAccessToken(userID, role)
	if err != nil {
		t.Fatalf("GenerateAccessToken() error = %v", err)
	}
	return "Bearer " + tok
}

func TestHandler_RegisterThenGetThenCancel(t *testing.T) {
	svc, _, er := newTestSetup(&fakePaymentProvider{status: payments.StatusSucceeded})
	eventID, categoryID := seedEventAndCategory(er, 0, 10)
	tokens := auth.NewTokenIssuer("test-secret", time.Hour)
	router := newTestRouter(svc, tokens)

	userID := uuid.New()
	bearer := bearerFor(t, tokens, userID, auth.RoleUser)

	// Register.
	body, _ := json.Marshal(validRegisterReq(categoryID))
	regReq := httptest.NewRequest(http.MethodPost, "/api/v1/events/"+eventID.String()+"/registrations", bytes.NewReader(body))
	regReq.Header.Set("Authorization", bearer)
	regRec := httptest.NewRecorder()
	router.ServeHTTP(regRec, regReq)
	if regRec.Code != http.StatusCreated {
		t.Fatalf("register status = %d, want %d, body=%s", regRec.Code, http.StatusCreated, regRec.Body.String())
	}

	var created struct {
		Data struct {
			Registration Registration `json:"registration"`
			TicketToken  string       `json:"ticket_token"`
		} `json:"data"`
	}
	if err := json.Unmarshal(regRec.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode register body: %v", err)
	}
	regID := created.Data.Registration.ID

	// Owner can view it.
	getReq := httptest.NewRequest(http.MethodGet, "/api/v1/registrations/"+regID.String(), nil)
	getReq.Header.Set("Authorization", bearer)
	getRec := httptest.NewRecorder()
	router.ServeHTTP(getRec, getReq)
	if getRec.Code != http.StatusOK {
		t.Fatalf("get status = %d, want %d, body=%s", getRec.Code, http.StatusOK, getRec.Body.String())
	}

	// A different user cannot view it.
	otherBearer := bearerFor(t, tokens, uuid.New(), auth.RoleUser)
	getReq2 := httptest.NewRequest(http.MethodGet, "/api/v1/registrations/"+regID.String(), nil)
	getReq2.Header.Set("Authorization", otherBearer)
	getRec2 := httptest.NewRecorder()
	router.ServeHTTP(getRec2, getReq2)
	if getRec2.Code != http.StatusForbidden {
		t.Fatalf("get by non-owner status = %d, want %d, body=%s", getRec2.Code, http.StatusForbidden, getRec2.Body.String())
	}

	// Owner cancels.
	cancelReq := httptest.NewRequest(http.MethodPost, "/api/v1/registrations/"+regID.String()+"/cancel", nil)
	cancelReq.Header.Set("Authorization", bearer)
	cancelRec := httptest.NewRecorder()
	router.ServeHTTP(cancelRec, cancelReq)
	if cancelRec.Code != http.StatusNoContent {
		t.Fatalf("cancel status = %d, want %d, body=%s", cancelRec.Code, http.StatusNoContent, cancelRec.Body.String())
	}

	// Cancelling again fails.
	cancelReq2 := httptest.NewRequest(http.MethodPost, "/api/v1/registrations/"+regID.String()+"/cancel", nil)
	cancelReq2.Header.Set("Authorization", bearer)
	cancelRec2 := httptest.NewRecorder()
	router.ServeHTTP(cancelRec2, cancelReq2)
	if cancelRec2.Code != http.StatusConflict {
		t.Fatalf("second cancel status = %d, want %d, body=%s", cancelRec2.Code, http.StatusConflict, cancelRec2.Body.String())
	}
}

func TestHandler_Register_RequiresAuth(t *testing.T) {
	svc, _, er := newTestSetup(&fakePaymentProvider{status: payments.StatusSucceeded})
	eventID, categoryID := seedEventAndCategory(er, 0, 10)
	tokens := auth.NewTokenIssuer("test-secret", time.Hour)
	router := newTestRouter(svc, tokens)

	body, _ := json.Marshal(validRegisterReq(categoryID))
	req := httptest.NewRequest(http.MethodPost, "/api/v1/events/"+eventID.String()+"/registrations", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusUnauthorized, rec.Body.String())
	}
}

func TestHandler_Availability(t *testing.T) {
	svc, _, er := newTestSetup(&fakePaymentProvider{status: payments.StatusSucceeded})
	eventID, categoryID := seedEventAndCategory(er, 0, 10)
	tokens := auth.NewTokenIssuer("test-secret", time.Hour)
	router := newTestRouter(svc, tokens)

	// Register one to move the counter.
	userID := uuid.New()
	if _, err := svc.Register(context.Background(), userID, eventID, validRegisterReq(categoryID)); err != nil {
		t.Fatalf("Register() error = %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/events/"+eventID.String()+"/categories/"+categoryID.String()+"/availability", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var body struct {
		Data Availability `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if body.Data.Taken != 1 || body.Data.Available != 9 {
		t.Errorf("availability = %+v, want taken=1 available=9", body.Data)
	}
}
