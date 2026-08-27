package siteconfig

import (
	"bytes"
	"context"
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

type auditRecorder interface {
	Record(ctx context.Context, actorID *uuid.UUID, action, entityType string, entityID *uuid.UUID, metadata map[string]any)
}

type Handler struct {
	svc   *Service
	store objectstore.Store
	audit auditRecorder
}

func NewHandler(svc *Service, uploadRoot string, audit auditRecorder) *Handler {
	if strings.TrimSpace(uploadRoot) == "" {
		uploadRoot = "uploads"
	}
	return NewHandlerWithStore(svc, objectstore.NewLocal(uploadRoot, "/uploads"), audit)
}

func NewHandlerWithStore(svc *Service, store objectstore.Store, audit auditRecorder) *Handler {
	return &Handler{svc: svc, store: store, audit: audit}
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	settings, err := h.svc.Get(r.Context())
	if err != nil {
		httpresponse.WriteError(w, http.StatusInternalServerError, "internal_error", "failed to load public site settings")
		return
	}
	httpresponse.WriteData(w, http.StatusOK, settings)
}

func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	actor, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpresponse.WriteError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	var req UpdateRequest
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_body", "malformed site settings")
		return
	}
	settings, err := h.svc.Update(r.Context(), actor.ID, req)
	if errors.Is(err, ErrInvalidSettings) {
		httpresponse.WriteError(w, http.StatusUnprocessableEntity, "invalid_settings", "check required text, colors, links, and carousel slides")
		return
	}
	if err != nil {
		httpresponse.WriteError(w, http.StatusInternalServerError, "internal_error", "failed to save public site settings")
		return
	}
	if h.audit != nil {
		h.audit.Record(r.Context(), &actor.ID, "public_site_updated", "site_settings", nil, map[string]any{"club_name": settings.ClubName})
	}
	httpresponse.WriteData(w, http.StatusOK, settings)
}

func (h *Handler) ListVersions(w http.ResponseWriter, r *http.Request) {
	limit := 25
	if raw := r.URL.Query().Get("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > 100 {
			httpresponse.WriteError(w, http.StatusBadRequest, "invalid_limit", "limit must be between 1 and 100")
			return
		}
		limit = parsed
	}
	versions, err := h.svc.ListVersions(r.Context(), limit)
	if err != nil {
		httpresponse.WriteError(w, http.StatusInternalServerError, "internal_error", "failed to load public site history")
		return
	}
	httpresponse.WriteData(w, http.StatusOK, map[string]any{"versions": versions})
}

func (h *Handler) RestoreVersion(w http.ResponseWriter, r *http.Request) {
	actor, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpresponse.WriteError(w, http.StatusUnauthorized, "unauthorized", "authentication required")
		return
	}
	versionID, err := strconv.ParseInt(chi.URLParam(r, "versionID"), 10, 64)
	if err != nil || versionID < 1 {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_version", "choose a valid public site version")
		return
	}
	settings, err := h.svc.Restore(r.Context(), actor.ID, versionID)
	if errors.Is(err, ErrVersionNotFound) {
		httpresponse.WriteError(w, http.StatusNotFound, "version_not_found", "public site version not found")
		return
	}
	if errors.Is(err, ErrInvalidSettings) {
		httpresponse.WriteError(w, http.StatusConflict, "version_invalid", "this version is no longer compatible with the public site")
		return
	}
	if err != nil {
		httpresponse.WriteError(w, http.StatusInternalServerError, "internal_error", "failed to restore public site version")
		return
	}
	if h.audit != nil {
		h.audit.Record(r.Context(), &actor.ID, "public_site_version_restored", "site_settings", nil, map[string]any{"version_id": versionID})
	}
	httpresponse.WriteData(w, http.StatusOK, settings)
}

const maxAssetBytes = 8 << 20

func (h *Handler) UploadAsset(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxAssetBytes+(1<<20))
	if err := r.ParseMultipartForm(maxAssetBytes); err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_upload", "asset must be an image no larger than 8 MB")
		return
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}
	file, _, err := r.FormFile("asset")
	if err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "missing_asset", "choose an image to upload")
		return
	}
	defer file.Close()
	header := make([]byte, 512)
	n, readErr := io.ReadFull(file, header)
	if readErr != nil && !errors.Is(readErr, io.ErrUnexpectedEOF) {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_upload", "could not read image")
		return
	}
	header = header[:n]
	extensions := map[string]string{"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
	ext, ok := extensions[http.DetectContentType(header)]
	if !ok {
		httpresponse.WriteError(w, http.StatusUnsupportedMediaType, "unsupported_image", "use a JPG, PNG, or WebP image")
		return
	}
	name := uuid.NewString() + ext
	data, err := io.ReadAll(io.LimitReader(io.MultiReader(bytes.NewReader(header), file), maxAssetBytes+1))
	if err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_upload", "could not read image")
		return
	}
	if len(data) > maxAssetBytes {
		httpresponse.WriteError(w, http.StatusRequestEntityTooLarge, "upload_failed", "image must be no larger than 8 MB")
		return
	}
	url, err := h.store.Put(r.Context(), "site/"+name, http.DetectContentType(header), bytes.NewReader(data), int64(len(data)))
	if err != nil {
		httpresponse.WriteError(w, http.StatusInternalServerError, "storage_unavailable", "asset storage is unavailable")
		return
	}
	httpresponse.WriteData(w, http.StatusCreated, map[string]string{"url": url})
}
