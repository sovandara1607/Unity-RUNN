package registrations

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/unity-run-club/api/internal/auth"
	"github.com/unity-run-club/api/internal/events"
	"github.com/unity-run-club/api/internal/httpresponse"
)

type Handler struct {
	svc *Service
}

// NewHandler builds a Handler backed by svc.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// Availability handles GET /api/v1/events/:eventId/categories/:categoryId/availability.
func (h *Handler) Availability(w http.ResponseWriter, r *http.Request) {
	eventID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_id", "event id must be a UUID")
		return
	}
	categoryID, err := uuid.Parse(chi.URLParam(r, "categoryId"))
	if err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_id", "categoryId must be a UUID")
		return
	}

	avail, err := h.svc.GetAvailability(r.Context(), eventID, categoryID)
	if errors.Is(err, events.ErrNotFound) {
		httpresponse.WriteError(w, http.StatusNotFound, "not_found", "category not found")
		return
	}
	if err != nil {
		httpresponse.WriteError(w, http.StatusInternalServerError, "internal_error", "failed to load availability")
		return
	}

	httpresponse.WriteData(w, http.StatusOK, avail)
}

// Register handles POST /api/v1/events/:eventId/registrations.
func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	caller, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpresponse.WriteError(w, http.StatusUnauthorized, "unauthorized", "missing or invalid access token")
		return
	}

	eventID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_id", "eventId must be a UUID")
		return
	}

	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_body", "malformed JSON body")
		return
	}
	if err := validate.Struct(req); err != nil {
		httpresponse.WriteError(w, http.StatusUnprocessableEntity, "validation_failed", err.Error())
		return
	}

	result, err := h.svc.Register(r.Context(), caller.ID, eventID, req)
	switch {
	case errors.Is(err, ErrInvalidCategory):
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_category", "category does not belong to this event")
	case errors.Is(err, ErrRegistrationClosed):
		httpresponse.WriteError(w, http.StatusConflict, "registration_closed", "registration is not currently open")
	case errors.Is(err, ErrDuplicateRegistration):
		httpresponse.WriteError(w, http.StatusConflict, "duplicate_registration", "you already have an active registration for this event")
	case errors.Is(err, ErrCapacityFull):
		httpresponse.WriteError(w, http.StatusConflict, "capacity_full", "this category is fully booked")
	case errors.Is(err, ErrLockNotAcquired):
		httpresponse.WriteError(w, http.StatusTooManyRequests, "busy", "this category is receiving a lot of registrations right now, try again in a moment")
	case errors.Is(err, ErrRateLimited):
		httpresponse.WriteError(w, http.StatusTooManyRequests, "rate_limited", "too many registration attempts, try again later")
	case errors.Is(err, ErrPaymentUnavailable):
		httpresponse.WriteError(w, http.StatusBadGateway, "payment_unavailable", "payment could not be started; your place was released")
	case err != nil:
		httpresponse.WriteError(w, http.StatusInternalServerError, "internal_error", "failed to register")
	default:
		httpresponse.WriteData(w, http.StatusCreated, map[string]any{
			"registration": result.Registration,
			"ticket_token": result.TicketToken,
			"payment":      result.Payment,
		})
	}
}

func (h *Handler) Payment(w http.ResponseWriter, r *http.Request) {
	caller, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpresponse.WriteError(w, http.StatusUnauthorized, "unauthorized", "missing or invalid access token")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_id", "id must be a UUID")
		return
	}
	payment, err := h.svc.GetPayment(r.Context(), caller.ID, caller.Role, id)
	writePaymentResult(w, payment, err)
}

func (h *Handler) VerifyPayment(w http.ResponseWriter, r *http.Request) {
	caller, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpresponse.WriteError(w, http.StatusUnauthorized, "unauthorized", "missing or invalid access token")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_id", "id must be a UUID")
		return
	}
	result, err := h.svc.VerifyPayment(r.Context(), caller.ID, caller.Role, id)
	if err != nil {
		writePaymentResult(w, nil, err)
		return
	}
	httpresponse.WriteData(w, http.StatusOK, map[string]any{"registration": result.Registration, "payment": result.Payment})
}

func writePaymentResult(w http.ResponseWriter, payment *PaymentCheckout, err error) {
	switch {
	case errors.Is(err, ErrNotFound):
		httpresponse.WriteError(w, http.StatusNotFound, "not_found", "payment not found")
	case errors.Is(err, ErrForbidden):
		httpresponse.WriteError(w, http.StatusForbidden, "forbidden", "you don't have access to this payment")
	case errors.Is(err, ErrPaymentMismatch):
		httpresponse.WriteError(w, http.StatusConflict, "payment_mismatch", "the settled payment does not match this registration")
	case errors.Is(err, ErrPaymentUnavailable):
		httpresponse.WriteError(w, http.StatusConflict, "payment_unavailable", "payment is not available for this registration")
	case errors.Is(err, ErrPaymentExpired):
		httpresponse.WriteError(w, http.StatusGone, "payment_expired", "this payment expired; choose the event again to start a new registration")
	case err != nil:
		httpresponse.WriteError(w, http.StatusBadGateway, "payment_provider_error", "could not verify payment with Bakong")
	default:
		httpresponse.WriteData(w, http.StatusOK, payment)
	}
}

// GetByID handles GET /api/v1/registrations/:id.
func (h *Handler) GetByID(w http.ResponseWriter, r *http.Request) {
	caller, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpresponse.WriteError(w, http.StatusUnauthorized, "unauthorized", "missing or invalid access token")
		return
	}

	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_id", "id must be a UUID")
		return
	}

	reg, err := h.svc.GetByID(r.Context(), caller.ID, caller.Role, id)
	switch {
	case errors.Is(err, ErrNotFound):
		httpresponse.WriteError(w, http.StatusNotFound, "not_found", "registration not found")
	case errors.Is(err, ErrForbidden):
		httpresponse.WriteError(w, http.StatusForbidden, "forbidden", "you don't have access to this registration")
	case err != nil:
		httpresponse.WriteError(w, http.StatusInternalServerError, "internal_error", "failed to load registration")
	default:
		httpresponse.WriteData(w, http.StatusOK, reg)
	}
}

// ListMine handles GET /api/v1/me/registrations.
func (h *Handler) ListMine(w http.ResponseWriter, r *http.Request) {
	caller, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpresponse.WriteError(w, http.StatusUnauthorized, "unauthorized", "missing or invalid access token")
		return
	}

	regs, err := h.svc.ListForUser(r.Context(), caller.ID)
	if err != nil {
		httpresponse.WriteError(w, http.StatusInternalServerError, "internal_error", "failed to list registrations")
		return
	}

	httpresponse.WriteData(w, http.StatusOK, map[string]any{"registrations": regs})
}


func (h *Handler) Ticket(w http.ResponseWriter, r *http.Request) {
	caller, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpresponse.WriteError(w, http.StatusUnauthorized, "unauthorized", "missing or invalid access token")
		return
	}

	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_id", "id must be a UUID")
		return
	}

	token, err := h.svc.IssueTicketToken(r.Context(), caller.ID, caller.Role, id)
	switch {
	case errors.Is(err, ErrNotFound):
		httpresponse.WriteError(w, http.StatusNotFound, "not_found", "registration not found")
	case errors.Is(err, ErrForbidden):
		httpresponse.WriteError(w, http.StatusForbidden, "forbidden", "you don't have access to this registration")
	case errors.Is(err, ErrNotConfirmed):
		httpresponse.WriteError(w, http.StatusConflict, "not_confirmed", "ticket is only available once registration is confirmed")
	case err != nil:
		httpresponse.WriteError(w, http.StatusInternalServerError, "internal_error", "failed to issue ticket")
	default:
		httpresponse.WriteData(w, http.StatusOK, map[string]any{
			"ticket_token": token, // legacy response key
			"ticket_code":  token,
		})
	}
}

// Cancel handles POST /api/v1/registrations/:id/cancel.
func (h *Handler) Cancel(w http.ResponseWriter, r *http.Request) {
	caller, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpresponse.WriteError(w, http.StatusUnauthorized, "unauthorized", "missing or invalid access token")
		return
	}

	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_id", "id must be a UUID")
		return
	}

	err = h.svc.Cancel(r.Context(), caller.ID, caller.Role, id)
	switch {
	case errors.Is(err, ErrNotFound):
		httpresponse.WriteError(w, http.StatusNotFound, "not_found", "registration not found")
	case errors.Is(err, ErrForbidden):
		httpresponse.WriteError(w, http.StatusForbidden, "forbidden", "you don't have access to this registration")
	case errors.Is(err, ErrAlreadyCancelled):
		httpresponse.WriteError(w, http.StatusConflict, "already_cancelled", "this registration is already cancelled")
	case errors.Is(err, ErrCannotCancelCheckedIn):
		httpresponse.WriteError(w, http.StatusConflict, "already_checked_in", "a checked-in registration cannot be cancelled")
	case err != nil:
		httpresponse.WriteError(w, http.StatusInternalServerError, "internal_error", "failed to cancel registration")
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}
