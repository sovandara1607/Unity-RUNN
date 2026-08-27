package objectstore

import (
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
)
type MediaHandler struct{ store Reader }

func NewMediaHandler(store Reader) *MediaHandler { return &MediaHandler{store: store} }

func (h *MediaHandler) Get(w http.ResponseWriter, r *http.Request) {
	key := strings.TrimPrefix(chi.URLParam(r, "*"), "/")
	object, err := h.store.Get(r.Context(), key)
	if errors.Is(err, ErrNotFound) {
		http.Error(w, "asset not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "asset storage unavailable", http.StatusBadGateway)
		return
	}
	defer object.Body.Close()
	if object.ContentType != "" {
		w.Header().Set("Content-Type", object.ContentType)
	}
	cacheControl := object.CacheControl
	if cacheControl == "" {
		cacheControl = "public, max-age=31536000, immutable"
	}
	w.Header().Set("Cache-Control", cacheControl)
	if object.ETag != "" {
		w.Header().Set("ETag", object.ETag)
	}
	if object.ContentLength != nil {
		w.Header().Set("Content-Length", strconv.FormatInt(*object.ContentLength, 10))
	}
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)
	_, _ = io.Copy(w, object.Body)
}
