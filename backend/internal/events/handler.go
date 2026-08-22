package events

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/unity-run-club/api/internal/adminauth"
)

// Handler wires HTTP requests to the event Service. Handlers stay
// thin: decode -> validate -> service -> respond.
type Handler struct {
	svc *Service
}

// NewHandler builds a Handler backed by svc.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// isAdmin reports whether this request context carries a validated
// admin key (see internal/adminauth), which relaxes visibility rules
// and unlocks write endpoints.
func isAdmin(r *http.Request) bool {
	return adminauth.IsAdmin(r.Context())
}

// List handles GET /api/v1/events.
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	filter := ListFilter{}
	if v := q.Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			filter.Limit = n
		}
	}
	if v := q.Get("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			filter.Offset = n
		}
	}

	admin := isAdmin(r)
	if admin {
		if v := q.Get("status"); v != "" {
			filter.Statuses = []Status{Status(v)}
		}
	}

	events, total, err := h.svc.List(r.Context(), &filter, admin)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to list events")
		return
	}

	writeData(w, http.StatusOK, map[string]any{
		"events": events,
		"total":  total,
		"limit":  filter.Limit,
		"offset": filter.Offset,
	})
}

// GetBySlug handles GET /api/v1/events/:slug.
func (h *Handler) GetBySlug(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")

	detail, err := h.svc.GetDetailBySlug(r.Context(), slug, isAdmin(r))
	if errors.Is(err, ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "event not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to load event")
		return
	}

	writeData(w, http.StatusOK, detail)
}

// Create handles POST /api/v1/events (admin only — guarded by
// adminauth middleware at the route level).
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	var req CreateEventRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", "malformed JSON body")
		return
	}
	if err := validate.Struct(req); err != nil {
		writeError(w, http.StatusUnprocessableEntity, "validation_failed", err.Error())
		return
	}

	e, err := h.svc.Create(r.Context(), req)
	switch {
	case errors.Is(err, ErrSlugTaken):
		writeError(w, http.StatusConflict, "slug_taken", "an event with this slug already exists")
	case err != nil:
		writeError(w, http.StatusBadRequest, "create_failed", err.Error())
	default:
		writeData(w, http.StatusCreated, e)
	}
}

// Update handles PATCH /api/v1/events/:id (admin only).
func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_id", "id must be a UUID")
		return
	}

	var req UpdateEventRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", "malformed JSON body")
		return
	}
	if err := validate.Struct(req); err != nil {
		writeError(w, http.StatusUnprocessableEntity, "validation_failed", err.Error())
		return
	}

	e, err := h.svc.Update(r.Context(), id, req)
	switch {
	case errors.Is(err, ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found", "event not found")
	case errors.Is(err, ErrSlugTaken):
		writeError(w, http.StatusConflict, "slug_taken", "an event with this slug already exists")
	case errors.Is(err, ErrInvalidTransition):
		writeError(w, http.StatusBadRequest, "invalid_transition", "that status transition isn't allowed")
	case err != nil:
		writeError(w, http.StatusBadRequest, "update_failed", err.Error())
	default:
		writeData(w, http.StatusOK, e)
	}
}

// Delete handles DELETE /api/v1/events/:id (admin only).
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_id", "id must be a UUID")
		return
	}

	err = h.svc.Delete(r.Context(), id)
	switch {
	case errors.Is(err, ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found", "event not found")
	case errors.Is(err, ErrDeleteNotAllowed):
		writeError(w, http.StatusConflict, "delete_not_allowed", "only draft events can be deleted; cancel or archive instead")
	case err != nil:
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to delete event")
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}
