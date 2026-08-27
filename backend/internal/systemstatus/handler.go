package systemstatus

import (
	"net/http"

	"github.com/unity-run-club/api/internal/httpresponse"
)

type Handler struct{ service *Service }

func NewHandler(service *Service) *Handler { return &Handler{service: service} }

func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	snapshot := h.service.Snapshot(r.Context())
	httpresponse.WriteData(w, http.StatusOK, snapshot)
}
