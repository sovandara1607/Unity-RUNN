// Package admin holds thin HTTP handlers for STAFF+ admin views that
// don't own their own domain — they read through existing domain
// services (registrations, events) rather than querying tables
// directly, keeping one source of truth per entity.
package admin

import (
	"context"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/unity-run-club/api/internal/auth"
	"github.com/unity-run-club/api/internal/httpresponse"
	"github.com/unity-run-club/api/internal/registrations"
)

// registrationsReader is the slice of registrations.Service this
// handler needs.
type registrationsReader interface {
	ListAll(ctx context.Context, filter registrations.AdminListFilter) ([]registrations.Registration, int, error)
	GetByID(ctx context.Context, callerID uuid.UUID, callerRole auth.Role, id uuid.UUID) (*registrations.Registration, error)
}

// Handler serves admin registration views.
type Handler struct {
	regs registrationsReader
}

// NewHandler builds a Handler backed by regs.
func NewHandler(regs registrationsReader) *Handler {
	return &Handler{regs: regs}
}

// ListRegistrations handles GET /api/v1/admin/registrations
// (STAFF+ only, guarded at the route level).
func (h *Handler) ListRegistrations(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	filter := registrations.AdminListFilter{}

	if v := q.Get("event_id"); v != "" {
		id, err := uuid.Parse(v)
		if err != nil {
			httpresponse.WriteError(w, http.StatusBadRequest, "invalid_event_id", "event_id must be a UUID")
			return
		}
		filter.EventID = &id
	}
	if v := q.Get("status"); v != "" {
		status := registrations.Status(v)
		filter.Status = &status
	}
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

	regs, total, err := h.regs.ListAll(r.Context(), filter)
	if err != nil {
		httpresponse.WriteError(w, http.StatusInternalServerError, "internal_error", "failed to list registrations")
		return
	}

	httpresponse.WriteData(w, http.StatusOK, map[string]any{
		"registrations": regs,
		"total":         total,
		"limit":         filter.Limit,
		"offset":        filter.Offset,
	})
}

// GetRegistration handles GET /api/v1/admin/registrations/:id
// (STAFF+ only, guarded at the route level).
func (h *Handler) GetRegistration(w http.ResponseWriter, r *http.Request) {
	staff, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpresponse.WriteError(w, http.StatusUnauthorized, "unauthorized", "missing or invalid access token")
		return
	}

	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_id", "id must be a UUID")
		return
	}

	// staff.Role is always STAFF+ here (route-level RequireAuth), so
	// registrations.Service.GetByID's owner-or-STAFF+ check always
	// takes the STAFF+ branch — reusing it rather than adding a
	// separate ownership-free lookup keeps one access-check path.
	reg, err := h.regs.GetByID(r.Context(), staff.ID, staff.Role, id)
	switch {
	case errors.Is(err, registrations.ErrNotFound):
		httpresponse.WriteError(w, http.StatusNotFound, "not_found", "registration not found")
	case err != nil:
		httpresponse.WriteError(w, http.StatusInternalServerError, "internal_error", "failed to load registration")
	default:
		httpresponse.WriteData(w, http.StatusOK, reg)
	}
}
