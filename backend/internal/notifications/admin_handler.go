package notifications

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/unity-run-club/api/internal/auth"
	"github.com/unity-run-club/api/internal/httpresponse"
)

type automationRepository interface {
	AutomationSnapshot(context.Context, bool, int, int) (*AutomationSnapshot, error)
	RetryTelegramDelivery(context.Context, uuid.UUID) error
}

type automationAuditRecorder interface {
	Record(context.Context, *uuid.UUID, string, string, *uuid.UUID, map[string]any)
}

type AdminHandler struct {
	repo       automationRepository
	configured bool
	recorder   automationAuditRecorder
}

func NewAdminHandler(repo automationRepository, configured bool, recorder automationAuditRecorder) *AdminHandler {
	return &AdminHandler{repo: repo, configured: configured, recorder: recorder}
}

func (h *AdminHandler) Snapshot(w http.ResponseWriter, r *http.Request) {
	snapshot, err := h.repo.AutomationSnapshot(r.Context(), h.configured, 30, 40)
	if err != nil {
		httpresponse.WriteError(w, http.StatusInternalServerError, "internal_error", "failed to load automation activity")
		return
	}
	if snapshot.Recent == nil {
		snapshot.Recent = []AdminDelivery{}
	}
	httpresponse.WriteData(w, http.StatusOK, snapshot)
}

func (h *AdminHandler) Retry(w http.ResponseWriter, r *http.Request) {
	deliveryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_id", "delivery id must be a UUID")
		return
	}
	err = h.repo.RetryTelegramDelivery(r.Context(), deliveryID)
	switch {
	case errors.Is(err, ErrNotFound):
		httpresponse.WriteError(w, http.StatusNotFound, "not_found", "Telegram delivery not found")
	case errors.Is(err, ErrDeliveryNotRetryable):
		httpresponse.WriteError(w, http.StatusConflict, "not_retryable", "only failed Telegram deliveries can be retried")
	case err != nil:
		httpresponse.WriteError(w, http.StatusInternalServerError, "internal_error", "failed to queue Telegram retry")
	default:
		if actor, ok := auth.UserFromContext(r.Context()); ok && h.recorder != nil {
			h.recorder.Record(r.Context(), &actor.ID, "telegram_delivery_retried", "notification_delivery", &deliveryID,
				map[string]any{"queued_at": time.Now().UTC().Format(time.RFC3339)})
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
