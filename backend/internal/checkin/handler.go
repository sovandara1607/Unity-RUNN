package checkin

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/unity-run-club/api/internal/auth"
	"github.com/unity-run-club/api/internal/httpresponse"
)

// Handler wires HTTP requests to the checkin Service.
type Handler struct {
	svc *Service
}

// NewHandler builds a Handler backed by svc.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// CheckIn handles POST /api/v1/check-in (STAFF+ only, guarded at the
// route level).
func (h *Handler) CheckIn(w http.ResponseWriter, r *http.Request) {
	staff, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpresponse.WriteError(w, http.StatusUnauthorized, "unauthorized", "missing or invalid access token")
		return
	}

	var req CheckInRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_body", "malformed JSON body")
		return
	}
	if err := validate.Struct(req); err != nil {
		httpresponse.WriteError(w, http.StatusUnprocessableEntity, "validation_failed", err.Error())
		return
	}

	result, err := h.svc.CheckIn(r.Context(), staff.ID, req.Token)
	switch {
	case errors.Is(err, ErrInvalidToken):
		httpresponse.WriteError(w, http.StatusNotFound, "invalid_token", "ticket token not recognized")
	case errors.Is(err, ErrNotConfirmed):
		httpresponse.WriteError(w, http.StatusConflict, "not_confirmed", "registration is not confirmed")
	case errors.Is(err, ErrAlreadyCheckedIn):
		httpresponse.WriteError(w, http.StatusConflict, "already_checked_in", "this registration has already been checked in")
	case err != nil:
		httpresponse.WriteError(w, http.StatusInternalServerError, "internal_error", "failed to check in")
	default:
		httpresponse.WriteData(w, http.StatusCreated, map[string]any{
			"registration": result.Registration,
			"check_in":     result.CheckIn,
		})
	}
}
