package admin

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/unity-run-club/api/internal/auditlog"
	"github.com/unity-run-club/api/internal/auth"
	"github.com/unity-run-club/api/internal/httpresponse"
	"github.com/unity-run-club/api/internal/registrations"
)

type registrationsReader interface {
	ListAll(ctx context.Context, filter registrations.AdminListFilter) ([]registrations.Registration, int, error)
	GetByID(ctx context.Context, callerID uuid.UUID, callerRole auth.Role, id uuid.UUID) (*registrations.Registration, error)
}

// auditListReader is the slice of auditlog.Repository this handler needs
// needs for the audit trail view.
type auditListReader interface {
	List(ctx context.Context, filter auditlog.ListFilter) ([]auditlog.Entry, error)
}

type userManager interface {
	ListUsers(ctx context.Context, role *auth.Role, limit, offset int) ([]auth.User, int, error)
	UpdateUserRole(ctx context.Context, actorID, targetID uuid.UUID, role auth.Role) (*auth.User, error)
}

type auditRecorder interface {
	Record(ctx context.Context, actorID *uuid.UUID, action, entityType string, entityID *uuid.UUID, metadata map[string]any)
}

type Handler struct {
	regs     registrationsReader
	audit    auditListReader
	users    userManager
	recorder auditRecorder
}

func NewHandler(regs registrationsReader, audit auditListReader, users userManager, recorder auditRecorder) *Handler {
	return &Handler{regs: regs, audit: audit, users: users, recorder: recorder}
}

type userResponse struct {
	ID        uuid.UUID `json:"id"`
	Email     string    `json:"email"`
	Role      auth.Role `json:"role"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func publicUser(user auth.User) userResponse {
	return userResponse{ID: user.ID, Email: user.Email, Role: user.Role, CreatedAt: user.CreatedAt, UpdatedAt: user.UpdatedAt}
}

func (h *Handler) ListUsers(w http.ResponseWriter, r *http.Request) {
	actor, ok := auth.UserFromContext(r.Context())
	if !ok || actor.Role != auth.RoleSuperAdmin {
		httpresponse.WriteError(w, http.StatusForbidden, "forbidden", "super admin access required")
		return
	}
	var role *auth.Role
	if raw := r.URL.Query().Get("role"); raw != "" {
		parsed := auth.Role(raw)
		if !parsed.IsValid() {
			httpresponse.WriteError(w, http.StatusBadRequest, "invalid_role", "unknown role")
			return
		}
		role = &parsed
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	users, total, err := h.users.ListUsers(r.Context(), role, limit, offset)
	if err != nil {
		httpresponse.WriteError(w, http.StatusInternalServerError, "internal_error", "failed to list users")
		return
	}
	response := make([]userResponse, len(users))
	for i, user := range users {
		response[i] = publicUser(user)
	}
	httpresponse.WriteData(w, http.StatusOK, map[string]any{"users": response, "total": total})
}

func (h *Handler) UpdateUserRole(w http.ResponseWriter, r *http.Request) {
	actor, ok := auth.UserFromContext(r.Context())
	if !ok || actor.Role != auth.RoleSuperAdmin {
		httpresponse.WriteError(w, http.StatusForbidden, "forbidden", "super admin access required")
		return
	}
	targetID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_id", "id must be a UUID")
		return
	}
	var body struct {
		Role auth.Role `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || !body.Role.IsValid() {
		httpresponse.WriteError(w, http.StatusUnprocessableEntity, "invalid_role", "a valid role is required")
		return
	}
	updated, err := h.users.UpdateUserRole(r.Context(), actor.ID, targetID, body.Role)
	switch {
	case errors.Is(err, auth.ErrNotFound):
		httpresponse.WriteError(w, http.StatusNotFound, "not_found", "user not found")
	case errors.Is(err, auth.ErrCannotDemoteSelf):
		httpresponse.WriteError(w, http.StatusConflict, "cannot_demote_self", "you cannot demote your own super-admin account")
	case err != nil:
		httpresponse.WriteError(w, http.StatusBadRequest, "update_failed", err.Error())
	default:
		if h.recorder != nil {
			h.recorder.Record(r.Context(), &actor.ID, "user_role_changed", "user", &targetID, map[string]any{"new_role": body.Role})
		}
		httpresponse.WriteData(w, http.StatusOK, publicUser(*updated))
	}
}

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

func (h *Handler) ListAuditLogs(w http.ResponseWriter, r *http.Request) {
	if h.audit == nil {
		httpresponse.WriteError(w, http.StatusInternalServerError, "internal_error", "audit log unavailable")
		return
	}

	q := r.URL.Query()
	filter := auditlog.ListFilter{EntityType: q.Get("entity_type")}

	if v := q.Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			filter.Limit = n
		}
	}
	if v := q.Get("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			filter.Offset = n
		}
	}

	entries, err := h.audit.List(r.Context(), filter)
	switch {
	case err != nil:
		httpresponse.WriteError(w, http.StatusInternalServerError, "internal_error", "failed to load audit logs")
	default:
		httpresponse.WriteData(w, http.StatusOK, map[string]any{"logs": entries})
	}
}
