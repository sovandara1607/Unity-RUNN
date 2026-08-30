package telegram

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/google/uuid"

	"github.com/unity-run-club/api/internal/auth"
	"github.com/unity-run-club/api/internal/httpresponse"
	"github.com/unity-run-club/api/internal/notifications"
)

type deliveryLister interface {
	ListUserTelegramDeliveries(context.Context, uuid.UUID, int) ([]notifications.Delivery, error)
}

type Handler struct {
	svc           *Service
	webhookSecret string
	deliveries    deliveryLister
}

func (h *Handler) SetDeliveryLister(lister deliveryLister) { h.deliveries = lister }

func NewHandler(svc *Service, webhookSecret string) *Handler {
	return &Handler{svc: svc, webhookSecret: webhookSecret}
}

func (h *Handler) Status(w http.ResponseWriter, r *http.Request) {
	user, _ := auth.UserFromContext(r.Context())
	status, err := h.svc.Status(r.Context(), user.ID)
	if err != nil {
		httpresponse.WriteError(w, 500, "internal_error", "failed to load Telegram delivery")
		return
	}
	httpresponse.WriteData(w, 200, status)
}

func (h *Handler) CreateLink(w http.ResponseWriter, r *http.Request) {
	user, _ := auth.UserFromContext(r.Context())
	link, err := h.svc.CreateLink(r.Context(), user.ID)
	if err != nil {
		httpresponse.WriteError(w, 503, "telegram_unavailable", "Telegram delivery is not configured")
		return
	}
	httpresponse.WriteData(w, 201, link)
}

func (h *Handler) Disconnect(w http.ResponseWriter, r *http.Request) {
	user, _ := auth.UserFromContext(r.Context())
	if err := h.svc.Disconnect(r.Context(), user.ID); err != nil {
		httpresponse.WriteError(w, 500, "internal_error", "failed to disconnect Telegram")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) UpdatePreferences(w http.ResponseWriter, r *http.Request) {
	user, _ := auth.UserFromContext(r.Context())
	var request struct {
		Tickets      *bool `json:"tickets"`
		Reminders    *bool `json:"reminders"`
		EventUpdates *bool `json:"event_updates"`
	}
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil || request.Tickets == nil || request.Reminders == nil || request.EventUpdates == nil {
		httpresponse.WriteError(w, 400, "invalid_json", "tickets, reminders, and event_updates must be booleans")
		return
	}
	preferences := Preferences{Tickets: *request.Tickets, Reminders: *request.Reminders, EventUpdates: *request.EventUpdates}
	status, err := h.svc.UpdatePreferences(r.Context(), user.ID, preferences)
	if errors.Is(err, ErrNotFound) {
		httpresponse.WriteError(w, 409, "telegram_not_connected", "connect Telegram before changing delivery preferences")
		return
	}
	if err != nil {
		httpresponse.WriteError(w, 500, "internal_error", "failed to update Telegram preferences")
		return
	}
	httpresponse.WriteData(w, 200, status)
}

func (h *Handler) SendTest(w http.ResponseWriter, r *http.Request) {
	user, _ := auth.UserFromContext(r.Context())
	err := h.svc.SendTest(r.Context(), user.ID)
	if errors.Is(err, ErrNotFound) {
		httpresponse.WriteError(w, 409, "telegram_not_connected", "connect Telegram before sending a test")
		return
	}
	if errors.Is(err, ErrTestRateLimited) {
		httpresponse.WriteError(w, 429, "rate_limited", "wait 30 seconds before sending another test")
		return
	}
	if err != nil {
		httpresponse.WriteError(w, 502, "telegram_delivery_failed", "Telegram did not accept the test message")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) Deliveries(w http.ResponseWriter, r *http.Request) {
	user, _ := auth.UserFromContext(r.Context())
	if h.deliveries == nil {
		httpresponse.WriteData(w, 200, []notifications.Delivery{})
		return
	}
	deliveries, err := h.deliveries.ListUserTelegramDeliveries(r.Context(), user.ID, 8)
	if err != nil {
		httpresponse.WriteError(w, 500, "internal_error", "failed to load Telegram delivery history")
		return
	}
	if deliveries == nil {
		deliveries = []notifications.Delivery{}
	}
	httpresponse.WriteData(w, 200, deliveries)
}

func (h *Handler) Webhook(w http.ResponseWriter, r *http.Request) {
	if h.webhookSecret == "" || r.Header.Get("X-Telegram-Bot-Api-Secret-Token") != h.webhookSecret {
		httpresponse.WriteError(w, 401, "unauthorized", "invalid Telegram webhook secret")
		return
	}
	var update Update
	if err := json.NewDecoder(r.Body).Decode(&update); err != nil {
		httpresponse.WriteError(w, 400, "invalid_json", "invalid Telegram update")
		return
	}
	if update.Message == nil || !strings.HasPrefix(update.Message.Text, "/start link_") {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	token := strings.TrimSpace(strings.TrimPrefix(update.Message.Text, "/start"))
	if err := h.svc.Connect(r.Context(), token, *update.Message); err != nil {
		if errors.Is(err, ErrNotFound) || errors.Is(err, ErrAlreadyLinked) {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		httpresponse.WriteError(w, 500, "internal_error", "failed to connect Telegram")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
