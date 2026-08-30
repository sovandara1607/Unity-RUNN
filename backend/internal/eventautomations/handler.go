package eventautomations

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/unity-run-club/api/internal/auth"
	"github.com/unity-run-club/api/internal/httpresponse"
)

type auditRecorder interface {
	Record(context.Context, *uuid.UUID, string, string, *uuid.UUID, map[string]any)
}

type Handler struct {
	svc   *Service
	audit auditRecorder
}

func NewHandler(svc *Service, recorders ...auditRecorder) *Handler {
	h := &Handler{svc: svc}
	if len(recorders) > 0 {
		h.audit = recorders[0]
	}
	return h
}
func eventID(r *http.Request) (uuid.UUID, error) { return uuid.Parse(chi.URLParam(r, "id")) }
func automationID(r *http.Request) (uuid.UUID, error) {
	return uuid.Parse(chi.URLParam(r, "automationId"))
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	id, err := eventID(r)
	if err != nil {
		httpresponse.WriteError(w, 400, "invalid_id", "id must be a UUID")
		return
	}
	items, err := h.svc.List(r.Context(), id)
	if err != nil {
		httpresponse.WriteError(w, 500, "list_failed", "failed to list automations")
		return
	}
	httpresponse.WriteData(w, 200, items)
}
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	eid, err := eventID(r)
	if err != nil {
		httpresponse.WriteError(w, 400, "invalid_id", "id must be a UUID")
		return
	}
	actor, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpresponse.WriteError(w, 401, "unauthorized", "authentication required")
		return
	}
	var req UpsertRequest
	if err = json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpresponse.WriteError(w, 400, "invalid_body", "malformed JSON body")
		return
	}
	a, err := h.svc.Create(r.Context(), eid, actor.ID, req)
	if errors.Is(err, ErrValidation) {
		httpresponse.WriteError(w, 422, "validation_failed", err.Error())
		return
	} else if err != nil {
		httpresponse.WriteError(w, 500, "create_failed", "failed to create automation")
		return
	}
	if h.audit != nil {
		h.audit.Record(r.Context(), &actor.ID, "EVENT_AUTOMATION_CREATED", "event_automation", &a.ID, map[string]any{"event_id": eid, "status": a.Status})
	}
	httpresponse.WriteData(w, 201, a)
}
func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	eid, e1 := eventID(r)
	id, e2 := automationID(r)
	if e1 != nil || e2 != nil {
		httpresponse.WriteError(w, 400, "invalid_id", "ids must be UUIDs")
		return
	}
	var req UpsertRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpresponse.WriteError(w, 400, "invalid_body", "malformed JSON body")
		return
	}
	a, err := h.svc.Update(r.Context(), eid, id, req)
	if errors.Is(err, ErrNotFound) {
		httpresponse.WriteError(w, 404, "not_found", "automation not found")
		return
	}
	if errors.Is(err, ErrImmutable) {
		httpresponse.WriteError(w, 409, "automation_locked", "this transmission is already processing or complete")
		return
	}
	if errors.Is(err, ErrValidation) {
		httpresponse.WriteError(w, 422, "update_failed", err.Error())
		return
	} else if err != nil {
		httpresponse.WriteError(w, 500, "update_failed", "failed to update automation")
		return
	}
	if actor, ok := auth.UserFromContext(r.Context()); ok && h.audit != nil {
		h.audit.Record(r.Context(), &actor.ID, "EVENT_AUTOMATION_UPDATED", "event_automation", &a.ID, map[string]any{"event_id": eid, "status": a.Status})
	}
	httpresponse.WriteData(w, 200, a)
}
func (h *Handler) Cancel(w http.ResponseWriter, r *http.Request) {
	eid, e1 := eventID(r)
	id, e2 := automationID(r)
	if e1 != nil || e2 != nil {
		httpresponse.WriteError(w, 400, "invalid_id", "ids must be UUIDs")
		return
	}
	if err := h.svc.Cancel(r.Context(), eid, id); errors.Is(err, ErrNotFound) {
		httpresponse.WriteError(w, 404, "not_found", "automation not found")
		return
	} else if errors.Is(err, ErrImmutable) {
		httpresponse.WriteError(w, 409, "automation_locked", "this transmission is already processing or complete")
		return
	} else if err != nil {
		httpresponse.WriteError(w, 409, "cancel_failed", err.Error())
		return
	}
	if actor, ok := auth.UserFromContext(r.Context()); ok && h.audit != nil {
		h.audit.Record(r.Context(), &actor.ID, "EVENT_AUTOMATION_CANCELLED", "event_automation", &id, map[string]any{"event_id": eid})
	}
	w.WriteHeader(http.StatusNoContent)
}
