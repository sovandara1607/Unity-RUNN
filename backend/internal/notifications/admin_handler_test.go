package notifications

import (
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

type fakeAutomationRepository struct {
	snapshot *AutomationSnapshot
	retryID  uuid.UUID
	retryErr error
}

func (f *fakeAutomationRepository) AutomationSnapshot(context.Context, bool, int, int) (*AutomationSnapshot, error) {
	return f.snapshot, nil
}
func (f *fakeAutomationRepository) RetryTelegramDelivery(_ context.Context, id uuid.UUID) error {
	f.retryID = id
	return f.retryErr
}

type fakeAutomationRecorder struct {
	action   string
	entityID uuid.UUID
}

func (f *fakeAutomationRecorder) Record(_ context.Context, _ *uuid.UUID, action, _ string, entityID *uuid.UUID, _ map[string]any) {
	f.action = action
	if entityID != nil {
		f.entityID = *entityID
	}
}

func automationTestRouter(t *testing.T, handler *AdminHandler, role auth.Role, userID uuid.UUID) (http.Handler, string) {
	t.Helper()
	tokens := auth.NewTokenIssuer("automation-test-secret", time.Hour)
	token, err := tokens.GenerateAccessToken(userID, role)
	if err != nil {
		t.Fatal(err)
	}
	router := chi.NewRouter()
	router.Route("/api/v1/admin/automations", func(r chi.Router) {
		r.Use(auth.RequireAuth(tokens, auth.RoleAdmin))
		r.Get("/", handler.Snapshot)
		r.Post("/deliveries/{id}/retry", handler.Retry)
	})
	return router, token
}

func TestAutomationAdminSnapshotAndRetry(t *testing.T) {
	deliveryID := uuid.New()
	repo := &fakeAutomationRepository{snapshot: &AutomationSnapshot{Configured: true, ConnectedRunners: 12,
		Counts: AutomationCounts{Total: 20, Sent: 18, Failed: 2}, Recent: []AdminDelivery{}}}
	recorder := &fakeAutomationRecorder{}
	handler := NewAdminHandler(repo, true, recorder)
	actorID := uuid.New()
	router, token := automationTestRouter(t, handler, auth.RoleAdmin, actorID)

	request := httptest.NewRequest(http.MethodGet, "/api/v1/admin/automations/", nil)
	request.Header.Set("Authorization", "Bearer "+token)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("snapshot status = %d, body=%s", response.Code, response.Body.String())
	}
	var payload struct {
		Data AutomationSnapshot `json:"data"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatal(err)
	}
	if payload.Data.ConnectedRunners != 12 || payload.Data.Counts.Sent != 18 {
		t.Fatalf("snapshot = %#v", payload.Data)
	}

	retry := httptest.NewRequest(http.MethodPost, "/api/v1/admin/automations/deliveries/"+deliveryID.String()+"/retry", nil)
	retry.Header.Set("Authorization", "Bearer "+token)
	retryResponse := httptest.NewRecorder()
	router.ServeHTTP(retryResponse, retry)
	if retryResponse.Code != http.StatusNoContent {
		t.Fatalf("retry status = %d, body=%s", retryResponse.Code, retryResponse.Body.String())
	}
	if repo.retryID != deliveryID || recorder.action != "telegram_delivery_retried" || recorder.entityID != deliveryID {
		t.Fatalf("retry/audit = repo:%v action:%q entity:%v", repo.retryID, recorder.action, recorder.entityID)
	}
}

func TestAutomationAdminRejectsStaff(t *testing.T) {
	handler := NewAdminHandler(&fakeAutomationRepository{snapshot: &AutomationSnapshot{}}, true, nil)
	router, token := automationTestRouter(t, handler, auth.RoleStaff, uuid.New())
	request := httptest.NewRequest(http.MethodGet, "/api/v1/admin/automations/", nil)
	request.Header.Set("Authorization", "Bearer "+token)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("staff status = %d, want 403", response.Code)
	}
}

func TestSafeFailureReasonDoesNotExposeRawProviderText(t *testing.T) {
	raw := "Post https://api.telegram.org/botSECRET/sendMessage: connection reset"
	if got := safeFailureReason(raw); got == raw || got == "" {
		t.Fatalf("safeFailureReason() = %q", got)
	}
}
