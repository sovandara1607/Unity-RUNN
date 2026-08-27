package events

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/unity-run-club/api/internal/auth"
	"github.com/unity-run-club/api/internal/httpresponse"
	"github.com/unity-run-club/api/internal/objectstore"
)

// Handler wires HTTP requests to the event Service. Handlers stay thin: decode -> validate -> service -> respond
type Handler struct {
	svc   *Service
	store objectstore.Store
}

// NewHandler builds a Handler backed by svc
func NewHandler(svc *Service, uploadRoot ...string) *Handler {
	root := "uploads"
	if len(uploadRoot) > 0 && strings.TrimSpace(uploadRoot[0]) != "" {
		root = uploadRoot[0]
	}
	return NewHandlerWithStore(svc, objectstore.NewLocal(root, "/uploads"))
}

// NewHandlerWithStore builds a Handler backed by svc and store
func NewHandlerWithStore(svc *Service, store objectstore.Store) *Handler {
	return &Handler{svc: svc, store: store}
}

// maxPosterBytes is the maximum size of a poster image
const maxPosterBytes = 8 << 20

func requestedPosterDimensions(r *http.Request) (int, int, error) {
	width, height := DefaultPosterWidth, DefaultPosterHeight
	var err error
	if raw := strings.TrimSpace(r.FormValue("width")); raw != "" {
		width, err = strconv.Atoi(raw)
		if err != nil {
			return 0, 0, err
		}
	}
	if raw := strings.TrimSpace(r.FormValue("height")); raw != "" {
		height, err = strconv.Atoi(raw)
		if err != nil {
			return 0, 0, err
		}
	}
	if width < minPosterDimension || width > maxPosterDimension || height < minPosterDimension || height > maxPosterDimension || int64(width)*int64(height) > maxOutputPixels {
		return 0, 0, errInvalidPosterImage
	}
	return width, height, nil
}

// UploadPoster stores an event poster and returns the public URL to save in the event's existing cover_image field
func (h *Handler) UploadPoster(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxPosterBytes+(1<<20))
	if err := r.ParseMultipartForm(maxPosterBytes); err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_upload", "poster must be an image no larger than 8 MB")
		return
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}
	posterWidth, posterHeight, err := requestedPosterDimensions(r)
	if err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_artboard", "poster dimensions must be between 400 and 2400 pixels and no larger than 4.5 megapixels")
		return
	}

	file, _, err := r.FormFile("poster")
	if err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "missing_poster", "choose an image to upload")
		return
	}
	defer file.Close()

	header := make([]byte, 512)
	n, err := io.ReadFull(file, header)
	if err != nil && !errors.Is(err, io.ErrUnexpectedEOF) {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_upload", "could not read poster image")
		return
	}
	header = header[:n]

	contentType := http.DetectContentType(header)
	if contentType != "image/jpeg" && contentType != "image/png" && contentType != "image/webp" {
		httpresponse.WriteError(w, http.StatusUnsupportedMediaType, "unsupported_image", "use a JPG, PNG, or WebP image")
		return
	}

	data, err := io.ReadAll(io.LimitReader(io.MultiReader(bytes.NewReader(header), file), maxPosterBytes+1))
	if err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_upload", "could not read poster image")
		return
	}
	if len(data) > maxPosterBytes {
		httpresponse.WriteError(w, http.StatusRequestEntityTooLarge, "image_too_large", "poster must be no larger than 8 MB")
		return
	}
	normalized, err := normalizePoster(data, posterWidth, posterHeight)
	if err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_upload", "poster image could not be processed")
		return
	}
	card, err := posterVariant(normalized, 720, 720, 82)
	if err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_upload", "poster card preview could not be created")
		return
	}
	hero, err := posterVariant(normalized, 1440, 1440, 84)
	if err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_upload", "poster hero preview could not be created")
		return
	}
	baseName := uuid.NewString()
	url, err := h.store.Put(r.Context(), "events/"+baseName+".jpg", "image/jpeg", bytes.NewReader(normalized), int64(len(normalized)))
	if err != nil {
		httpresponse.WriteError(w, http.StatusInternalServerError, "storage_unavailable", "poster storage is unavailable")
		return
	}
	cardURL, err := h.store.Put(r.Context(), "events/"+baseName+"@card.jpg", "image/jpeg", bytes.NewReader(card), int64(len(card)))
	if err != nil {
		httpresponse.WriteError(w, http.StatusInternalServerError, "storage_unavailable", "poster card storage is unavailable")
		return
	}
	heroURL, err := h.store.Put(r.Context(), "events/"+baseName+"@hero.jpg", "image/jpeg", bytes.NewReader(hero), int64(len(hero)))
	if err != nil {
		httpresponse.WriteError(w, http.StatusInternalServerError, "storage_unavailable", "poster hero storage is unavailable")
		return
	}
	httpresponse.WriteData(w, http.StatusCreated, map[string]any{
		"url": url, "card_url": cardURL, "hero_url": heroURL,
		"width": posterWidth, "height": posterHeight, "format": "jpeg",
	})
}

// isStaffOrAbove reports whether the authenticated caller (see internal/auth) holds STAFF role or higher, which relaxes list/detail visibility to include non-public events (DRAFT, CANCELLED, etc)
func isStaffOrAbove(r *http.Request) bool {
	u, ok := auth.UserFromContext(r.Context())
	return ok && u.Role.AtLeast(auth.RoleStaff)
}

// List handles GET /api/v1/events
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

	admin := isStaffOrAbove(r)
	// Public callers may narrow the public status set; the service is the security boundary that strips non-public statuses
	raw := q.Get("statuses")
	if raw == "" {
		raw = q.Get("status")
	}
	if raw != "" {
		parts := strings.Split(raw, ",")
		statuses := make([]Status, 0, len(parts))
		for _, p := range parts {
			if p = strings.TrimSpace(p); p != "" {
				statuses = append(statuses, Status(p))
			}
		}
		filter.Statuses = statuses
	}

	events, total, err := h.svc.List(r.Context(), &filter, admin)
	if err != nil {
		httpresponse.WriteError(w, http.StatusInternalServerError, "internal_error", "failed to list events")
		return
	}

	// Note: list items don't embed categories, so no capacity is exposed here; detail responses are masked separately

	httpresponse.WriteData(w, http.StatusOK, map[string]any{
		"events": events,
		"total":  total,
		"limit":  filter.Limit,
		"offset": filter.Offset,
	})
}

// GetBySlug handles GET /api/v1/events/:slug
func (h *Handler) GetBySlug(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "id")

	detail, err := h.svc.GetDetailBySlug(r.Context(), slug, isStaffOrAbove(r))
	if errors.Is(err, ErrNotFound) {
		httpresponse.WriteError(w, http.StatusNotFound, "not_found", "event not found")
		return
	}
	if err != nil {
		httpresponse.WriteError(w, http.StatusInternalServerError, "internal_error", "failed to load event")
		return
	}

	// Hide capacity from non-staff callers (see List)
	if !isStaffOrAbove(r) {
		detail.Categories = maskCategoryCapacity(detail.Categories)
	}

	httpresponse.WriteData(w, http.StatusOK, detail)
}

// GetByID handles GET /api/v1/events/by-id/:id (admin only)
func (h *Handler) GetByID(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_id", "id must be a UUID")
		return
	}

	e, err := h.svc.GetByID(r.Context(), id)
	if errors.Is(err, ErrNotFound) {
		httpresponse.WriteError(w, http.StatusNotFound, "not_found", "event not found")
		return
	}
	if err != nil {
		httpresponse.WriteError(w, http.StatusInternalServerError, "internal_error", "failed to load event")
		return
	}

	httpresponse.WriteData(w, http.StatusOK, e)
}

// Create handles POST /api/v1/events (ADMIN role required — guarded by auth.RequireAuth at the route level)
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	var req CreateEventRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_body", "malformed JSON body")
		return
	}
	if err := validate.Struct(req); err != nil {
		httpresponse.WriteError(w, http.StatusUnprocessableEntity, "validation_failed", err.Error())
		return
	}

	e, err := h.svc.Create(r.Context(), req)
	switch {
	case errors.Is(err, ErrSlugTaken):
		httpresponse.WriteError(w, http.StatusConflict, "slug_taken", "an event with this slug already exists")
	case err != nil:
		httpresponse.WriteError(w, http.StatusBadRequest, "create_failed", err.Error())
	default:
		httpresponse.WriteData(w, http.StatusCreated, e)
	}
}

// Update handles PATCH /api/v1/events/:id (admin only)
func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_id", "id must be a UUID")
		return
	}

	var req UpdateEventRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_body", "malformed JSON body")
		return
	}
	if err := validate.Struct(req); err != nil {
		httpresponse.WriteError(w, http.StatusUnprocessableEntity, "validation_failed", err.Error())
		return
	}

	e, err := h.svc.Update(r.Context(), id, req)
	switch {
	case errors.Is(err, ErrNotFound):
		httpresponse.WriteError(w, http.StatusNotFound, "not_found", "event not found")
	case errors.Is(err, ErrSlugTaken):
		httpresponse.WriteError(w, http.StatusConflict, "slug_taken", "an event with this slug already exists")
	case errors.Is(err, ErrInvalidTransition):
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_transition", "that status transition isn't allowed")
	case err != nil:
		httpresponse.WriteError(w, http.StatusBadRequest, "update_failed", err.Error())
	default:
		httpresponse.WriteData(w, http.StatusOK, e)
	}
}

// Delete handles DELETE /api/v1/events/:id (admin only)
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_id", "id must be a UUID")
		return
	}

	err = h.svc.Delete(r.Context(), id)
	switch {
	case errors.Is(err, ErrNotFound):
		httpresponse.WriteError(w, http.StatusNotFound, "not_found", "event not found")
	case errors.Is(err, ErrDeleteNotAllowed):
		httpresponse.WriteError(w, http.StatusConflict, "delete_not_allowed", "only draft events can be deleted; cancel or archive instead")
	case err != nil:
		httpresponse.WriteError(w, http.StatusInternalServerError, "internal_error", "failed to delete event")
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}

// maskCategoryCapacity zeroes capacity so it isn't exposed to regular users
func maskCategoryCapacity(in []EventCategory) []EventCategory {
	out := make([]EventCategory, len(in))
	copy(out, in)
	for i := range out {
		out[i].Capacity = 0
	}
	return out
}

// CreateCategory handles POST /api/v1/events/:id/categories (admin only).
func (h *Handler) CreateCategory(w http.ResponseWriter, r *http.Request) {
	eventID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_id", "id must be a UUID")
		return
	}

	var req CreateCategoryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_body", "malformed JSON body")
		return
	}
	if err := validate.Struct(req); err != nil {
		httpresponse.WriteError(w, http.StatusUnprocessableEntity, "validation_failed", err.Error())
		return
	}

	c, err := h.svc.CreateCategory(r.Context(), eventID, req)
	switch {
	case errors.Is(err, ErrNotFound):
		httpresponse.WriteError(w, http.StatusNotFound, "not_found", "event not found")
	case err != nil:
		httpresponse.WriteError(w, http.StatusBadRequest, "create_failed", err.Error())
	default:
		httpresponse.WriteData(w, http.StatusCreated, c)
	}
}

// UpdateCategory handles PATCH /api/v1/events/:id/categories/:categoryId (admin only).
func (h *Handler) UpdateCategory(w http.ResponseWriter, r *http.Request) {
	eventID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_id", "id must be a UUID")
		return
	}
	categoryID, err := uuid.Parse(chi.URLParam(r, "categoryId"))
	if err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_id", "categoryId must be a UUID")
		return
	}

	var req UpdateCategoryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_body", "malformed JSON body")
		return
	}
	if err := validate.Struct(req); err != nil {
		httpresponse.WriteError(w, http.StatusUnprocessableEntity, "validation_failed", err.Error())
		return
	}

	c, err := h.svc.UpdateCategory(r.Context(), eventID, categoryID, req)
	switch {
	case errors.Is(err, ErrNotFound):
		httpresponse.WriteError(w, http.StatusNotFound, "not_found", "category not found")
	case err != nil:
		httpresponse.WriteError(w, http.StatusBadRequest, "update_failed", err.Error())
	default:
		httpresponse.WriteData(w, http.StatusOK, c)
	}
}

// DeleteCategory handles DELETE /api/v1/events/:id/categories/:categoryId (admin only).
func (h *Handler) DeleteCategory(w http.ResponseWriter, r *http.Request) {
	eventID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_id", "id must be a UUID")
		return
	}
	categoryID, err := uuid.Parse(chi.URLParam(r, "categoryId"))
	if err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_id", "categoryId must be a UUID")
		return
	}

	err = h.svc.DeleteCategory(r.Context(), eventID, categoryID)
	switch {
	case errors.Is(err, ErrNotFound):
		httpresponse.WriteError(w, http.StatusNotFound, "not_found", "category not found")
	case errors.Is(err, ErrCategoryInUse):
		httpresponse.WriteError(w, http.StatusConflict, "category_in_use", "category has registrations and cannot be deleted")
	case err != nil:
		httpresponse.WriteError(w, http.StatusInternalServerError, "delete_failed", "failed to delete category")
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}

// CreateSchedule handles POST /api/v1/events/:id/schedules (admin only).
func (h *Handler) CreateSchedule(w http.ResponseWriter, r *http.Request) {
	eventID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_id", "id must be a UUID")
		return
	}

	var req CreateScheduleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_body", "malformed JSON body")
		return
	}
	if err := validate.Struct(req); err != nil {
		httpresponse.WriteError(w, http.StatusUnprocessableEntity, "validation_failed", err.Error())
		return
	}

	item, err := h.svc.CreateScheduleItem(r.Context(), eventID, req)
	switch {
	case errors.Is(err, ErrNotFound):
		httpresponse.WriteError(w, http.StatusNotFound, "not_found", "event not found")
	case err != nil:
		httpresponse.WriteError(w, http.StatusBadRequest, "create_failed", err.Error())
	default:
		httpresponse.WriteData(w, http.StatusCreated, item)
	}
}

// UpdateSchedule handles PATCH /api/v1/events/:id/schedules/:scheduleId (admin only).
func (h *Handler) UpdateSchedule(w http.ResponseWriter, r *http.Request) {
	eventID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_id", "id must be a UUID")
		return
	}
	scheduleID, err := uuid.Parse(chi.URLParam(r, "scheduleId"))
	if err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_id", "scheduleId must be a UUID")
		return
	}

	var req UpdateScheduleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_body", "malformed JSON body")
		return
	}
	if err := validate.Struct(req); err != nil {
		httpresponse.WriteError(w, http.StatusUnprocessableEntity, "validation_failed", err.Error())
		return
	}

	item, err := h.svc.UpdateScheduleItem(r.Context(), eventID, scheduleID, req)
	switch {
	case errors.Is(err, ErrNotFound):
		httpresponse.WriteError(w, http.StatusNotFound, "not_found", "schedule item not found")
	case err != nil:
		httpresponse.WriteError(w, http.StatusBadRequest, "update_failed", err.Error())
	default:
		httpresponse.WriteData(w, http.StatusOK, item)
	}
}

// DeleteSchedule handles DELETE /api/v1/events/:id/schedules/:scheduleId (admin only).
func (h *Handler) DeleteSchedule(w http.ResponseWriter, r *http.Request) {
	eventID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_id", "id must be a UUID")
		return
	}
	scheduleID, err := uuid.Parse(chi.URLParam(r, "scheduleId"))
	if err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_id", "scheduleId must be a UUID")
		return
	}

	err = h.svc.DeleteScheduleItem(r.Context(), eventID, scheduleID)
	switch {
	case errors.Is(err, ErrNotFound):
		httpresponse.WriteError(w, http.StatusNotFound, "not_found", "schedule item not found")
	case err != nil:
		httpresponse.WriteError(w, http.StatusInternalServerError, "delete_failed", "failed to delete schedule item")
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}
