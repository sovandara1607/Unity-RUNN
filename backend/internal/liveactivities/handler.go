package liveactivities

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-playground/validator/v10"
	"github.com/google/uuid"

	"github.com/unity-run-club/api/internal/auth"
	"github.com/unity-run-club/api/internal/httpresponse"
)

var validate = validator.New(validator.WithRequiredStructEnabled())

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// Create handles POST /api/v1/live-activities -- item 11's contract exactly:
// { eventId, activityId, pushToken, platform, registrationId? }.
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	caller, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpresponse.WriteError(w, http.StatusUnauthorized, "unauthorized", "missing or invalid access token")
		return
	}
	body, err := io.ReadAll(r.Body)
	if err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_body", "could not read request body")
		return
	}
	var in CreateInput
	if err := json.Unmarshal(body, &in); err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_body", "malformed JSON body")
		return
	}
	if err := validate.Struct(in); err != nil {
		httpresponse.WriteError(w, http.StatusUnprocessableEntity, "validation_failed", err.Error())
		return
	}
	activity, err := h.svc.Start(r.Context(), caller.ID, in)
	if errors.Is(err, ErrDuplicateActive) {
		httpresponse.WriteError(w, http.StatusConflict, "already_following",
			"you already have an active Live Activity for this event")
		return
	}
	if err != nil {
		httpresponse.WriteError(w, http.StatusInternalServerError, "internal_error", "failed to start live activity")
		return
	}
	httpresponse.WriteData(w, http.StatusCreated, activity)
}

// ListMine handles GET /api/v1/live-activities -- what the caller is
// currently following, backing the Race Wallet's per-event button state.
func (h *Handler) ListMine(w http.ResponseWriter, r *http.Request) {
	caller, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpresponse.WriteError(w, http.StatusUnauthorized, "unauthorized", "missing or invalid access token")
		return
	}
	activities, err := h.svc.GetActiveForUser(r.Context(), caller.ID)
	if err != nil {
		httpresponse.WriteError(w, http.StatusInternalServerError, "internal_error", "failed to list live activities")
		return
	}
	httpresponse.WriteData(w, http.StatusOK, map[string]any{"live_activities": activities})
}

// Update handles PATCH /api/v1/live-activities/:id.
func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
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
	existing, err := h.svc.GetByID(r.Context(), id)
	if errors.Is(err, ErrNotFound) {
		httpresponse.WriteError(w, http.StatusNotFound, "not_found", "live activity not found")
		return
	}
	if err != nil {
		httpresponse.WriteError(w, http.StatusInternalServerError, "internal_error", "failed to load live activity")
		return
	}
	if existing.UserID != caller.ID {
		// Same shape as not_found, deliberately: confirming an activity id
		// exists but belongs to someone else is its own small leak.
		httpresponse.WriteError(w, http.StatusNotFound, "not_found", "live activity not found")
		return
	}
	body, err := io.ReadAll(r.Body)
	if err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_body", "could not read request body")
		return
	}
	var in UpdateInput
	if err := json.Unmarshal(body, &in); err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_body", "malformed JSON body")
		return
	}
	if in.RaceStatus != nil && !in.RaceStatus.Valid() {
		httpresponse.WriteError(w, http.StatusUnprocessableEntity, "validation_failed", "race_status is not a recognized value")
		return
	}
	activity, err := h.svc.Update(r.Context(), id, in)
	if errors.Is(err, ErrNotFound) {
		httpresponse.WriteError(w, http.StatusNotFound, "not_found", "live activity not found")
		return
	}
	if err != nil {
		httpresponse.WriteError(w, http.StatusInternalServerError, "internal_error", "failed to update live activity")
		return
	}
	httpresponse.WriteData(w, http.StatusOK, activity)
}

// End handles DELETE /api/v1/live-activities/:id.
func (h *Handler) End(w http.ResponseWriter, r *http.Request) {
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
	existing, err := h.svc.GetByID(r.Context(), id)
	if errors.Is(err, ErrNotFound) {
		// Ending a nonexistent/already-gone activity is a success: matches
		// the mobile service's `end()` being safe to call unconditionally.
		httpresponse.WriteData(w, http.StatusOK, map[string]any{"ended": true})
		return
	}
	if err != nil {
		httpresponse.WriteError(w, http.StatusInternalServerError, "internal_error", "failed to load live activity")
		return
	}
	if existing.UserID != caller.ID {
		httpresponse.WriteError(w, http.StatusNotFound, "not_found", "live activity not found")
		return
	}
	if err := h.svc.End(r.Context(), id); err != nil {
		httpresponse.WriteError(w, http.StatusInternalServerError, "internal_error", "failed to end live activity")
		return
	}
	httpresponse.WriteData(w, http.StatusOK, map[string]any{"ended": true})
}
