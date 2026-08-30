package admin

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode"

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
	filter, err := registrationFilter(r)
	if err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_filter", err.Error())
		return
	}
	q := r.URL.Query()
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

const maxRosterExportRows = 50000

func registrationFilter(r *http.Request) (registrations.AdminListFilter, error) {
	q := r.URL.Query()
	filter := registrations.AdminListFilter{Search: strings.TrimSpace(q.Get("search"))}
	if v := q.Get("event_id"); v != "" {
		id, err := uuid.Parse(v)
		if err != nil {
			return filter, errors.New("event_id must be a UUID")
		}
		filter.EventID = &id
	}
	if v := q.Get("status"); v != "" {
		status := registrations.Status(v)
		switch status {
		case registrations.StatusPending, registrations.StatusConfirmed, registrations.StatusCancelled, registrations.StatusRefunded:
		default:
			return filter, errors.New("status is invalid")
		}
		filter.Status = &status
	}
	return filter, nil
}

// ExportRegistrations returns the complete filtered roster, rather than only the current UI page.
func (h *Handler) ExportRegistrations(w http.ResponseWriter, r *http.Request) {
	filter, err := registrationFilter(r)
	if err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_filter", err.Error())
		return
	}
	filter.Limit = 1000
	filter.Offset = 0
	all, total, err := h.regs.ListAll(r.Context(), filter)
	if err != nil {
		httpresponse.WriteError(w, http.StatusInternalServerError, "export_failed", "failed to build roster export")
		return
	}
	if total > maxRosterExportRows {
		httpresponse.WriteError(w, http.StatusUnprocessableEntity, "export_too_large", "narrow the roster filters before exporting")
		return
	}
	for len(all) < total {
		filter.Offset = len(all)
		page, _, pageErr := h.regs.ListAll(r.Context(), filter)
		if pageErr != nil {
			httpresponse.WriteError(w, http.StatusInternalServerError, "export_failed", "failed to build roster export")
			return
		}
		if len(page) == 0 {
			break
		}
		all = append(all, page...)
	}

	var buffer bytes.Buffer
	buffer.WriteString("\xEF\xBB\xBF")
	writer := csv.NewWriter(&buffer)
	_ = writer.Write([]string{"Registration Number", "Full Name", "Email", "Phone", "Event", "Category", "Status", "Date of Birth", "Gender", "T-shirt Size", "Emergency Contact Name", "Emergency Contact Phone", "Registered At", "Checked In At"})
	for _, reg := range all {
		dob, checkedIn := "", ""
		if reg.DateOfBirth != nil {
			dob = reg.DateOfBirth.Format("2006-01-02")
		}
		if reg.CheckedInAt != nil {
			checkedIn = reg.CheckedInAt.UTC().Format(time.RFC3339)
		}
		_ = writer.Write([]string{csvSafe(reg.RegistrationNumber), csvSafe(reg.FullName), csvSafe(reg.Email), csvSafe(reg.Phone), csvSafe(reg.EventName), csvSafe(reg.CategoryName), string(reg.Status), dob, csvSafe(reg.Gender), csvSafe(reg.TshirtSize), csvSafe(reg.EmergencyContactName), csvSafe(reg.EmergencyContactPhone), reg.CreatedAt.UTC().Format(time.RFC3339), checkedIn})
	}
	writer.Flush()
	if err := writer.Error(); err != nil {
		httpresponse.WriteError(w, http.StatusInternalServerError, "export_failed", "failed to encode roster export")
		return
	}
	if actor, ok := auth.UserFromContext(r.Context()); ok && h.recorder != nil {
		h.recorder.Record(r.Context(), &actor.ID, "registration_roster_exported", "registration_export", nil, map[string]any{"event_id": r.URL.Query().Get("event_id"), "status": r.URL.Query().Get("status"), "search_applied": filter.Search != "", "rows": len(all)})
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="unity-roster-%s.csv"`, time.Now().UTC().Format("2006-01-02")))
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(buffer.Bytes())
}

func csvSafe(value string) string {
	value = strings.ReplaceAll(value, "\x00", "")
	trimmed := strings.TrimLeftFunc(value, unicode.IsSpace)
	if trimmed != "" && strings.ContainsRune("=+-@", rune(trimmed[0])) {
		return "'" + value
	}
	return value
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
