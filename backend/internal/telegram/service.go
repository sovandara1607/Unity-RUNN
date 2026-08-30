package telegram

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	qrcode "github.com/skip2/go-qrcode"

	"github.com/unity-run-club/api/internal/email"
)

type connectionRepository interface {
	GetConnection(context.Context, uuid.UUID) (*Connection, error)
	SaveLinkToken(context.Context, uuid.UUID, []byte, time.Time) error
	ConsumeLinkToken(context.Context, []byte, int64, int64, string, string) (uuid.UUID, error)
	DeleteConnection(context.Context, uuid.UUID) error
	UpdatePreferences(context.Context, uuid.UUID, Preferences) error
	ReserveTestMessage(context.Context, uuid.UUID, time.Time) (*Connection, error)
}

type messageClient interface {
	SendMessage(context.Context, int64, string) error
	SendPhoto(context.Context, int64, []byte, string, string) error
}

type Service struct {
	repo      connectionRepository
	client    messageClient
	botName   string
	available bool
	now       func() time.Time
}

func NewService(repo connectionRepository, client messageClient, botName string, available bool) *Service {
	return &Service{repo: repo, client: client, botName: strings.TrimPrefix(strings.TrimSpace(botName), "@"), available: available, now: time.Now}
}

func (s *Service) Status(ctx context.Context, userID uuid.UUID) (Status, error) {
	status := Status{Available: s.available, BotName: s.botName, Preferences: defaultPreferences()}
	if !s.available {
		return status, nil
	}
	connection, err := s.repo.GetConnection(ctx, userID)
	if errors.Is(err, ErrNotFound) {
		return status, nil
	}
	if err != nil {
		return Status{}, err
	}
	status.Connected, status.Account = true, connection
	status.Preferences = connection.Preferences
	return status, nil
}

func defaultPreferences() Preferences {
	return Preferences{Tickets: true, Reminders: true, EventUpdates: true}
}

func (s *Service) UpdatePreferences(ctx context.Context, userID uuid.UUID, preferences Preferences) (Status, error) {
	if err := s.repo.UpdatePreferences(ctx, userID, preferences); err != nil {
		return Status{}, err
	}
	return s.Status(ctx, userID)
}

func (s *Service) SendTest(ctx context.Context, userID uuid.UUID) error {
	if !s.available {
		return errors.New("telegram delivery is not configured")
	}
	connection, err := s.repo.ReserveTestMessage(ctx, userID, s.now())
	if err != nil {
		return err
	}
	return s.client.SendMessage(ctx, connection.ChatID, "Signal check ✓\n\nTelegram delivery is working. Future tickets and race updates will arrive according to your preferences.")
}

func (s *Service) CreateLink(ctx context.Context, userID uuid.UUID) (Link, error) {
	if !s.available {
		return Link{}, errors.New("telegram delivery is not configured")
	}
	raw := make([]byte, 24)
	if _, err := rand.Read(raw); err != nil {
		return Link{}, fmt.Errorf("telegram: create link token: %w", err)
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	expiresAt := s.now().Add(10 * time.Minute)
	hash := sha256.Sum256([]byte(token))
	if err := s.repo.SaveLinkToken(ctx, userID, hash[:], expiresAt); err != nil {
		return Link{}, err
	}
	return Link{URL: "https://t.me/" + s.botName + "?start=link_" + token, ExpiresAt: expiresAt}, nil
}

func (s *Service) Connect(ctx context.Context, token string, msg Message) error {
	if msg.Chat.Type != "private" || msg.Chat.ID == 0 || msg.From.ID == 0 {
		return errors.New("telegram: links must be opened in a private chat")
	}
	token = strings.TrimPrefix(strings.TrimSpace(token), "link_")
	if token == "" {
		return ErrNotFound
	}
	hash := sha256.Sum256([]byte(token))
	_, err := s.repo.ConsumeLinkToken(ctx, hash[:], msg.Chat.ID, msg.From.ID, msg.From.Username, msg.From.FirstName)
	if err != nil {
		return err
	}
	return s.client.SendMessage(ctx, msg.Chat.ID, "Connected to Unity Runn Club. Your race tickets and important event updates will arrive here. Email remains your backup channel.")
}

func notificationEnabled(preferences Preferences, typ string) bool {
	switch typ {
	case "REGISTRATION_CONFIRMATION", "PAYMENT_CONFIRMATION":
		return preferences.Tickets
	case "EVENT_REMINDER":
		return preferences.Reminders
	case "EVENT_UPDATE", "EVENT_ANNOUNCEMENT", "CANCELLATION":
		return preferences.EventUpdates
	default:
		return true
	}
}

func (s *Service) Disconnect(ctx context.Context, userID uuid.UUID) error {
	return s.repo.DeleteConnection(ctx, userID)
}

// SendNotification is intentionally best-effort from the email worker: email remains the canonical delivery, while Telegram adds an immediate runner-friendly copy.
func (s *Service) SendNotification(ctx context.Context, userID uuid.UUID, typ string, data email.TemplateData) (bool, error) {
	if !s.available {
		return false, nil
	}
	connection, err := s.repo.GetConnection(ctx, userID)
	if errors.Is(err, ErrNotFound) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if !notificationEnabled(connection.Preferences, typ) {
		return false, nil
	}

	message := telegramMessage(typ, data)
	if typ == "REGISTRATION_CONFIRMATION" || typ == "PAYMENT_CONFIRMATION" {
		qr, err := qrcode.Encode(data.RegistrationNumber, qrcode.High, 768)
		if err != nil {
			return false, fmt.Errorf("telegram: create ticket QR: %w", err)
		}
		if err := s.client.SendPhoto(ctx, connection.ChatID, qr, "ticket-"+data.RegistrationNumber+".png", message); err != nil {
			return false, err
		}
		return true, nil
	}
	if err := s.client.SendMessage(ctx, connection.ChatID, message); err != nil {
		return false, err
	}
	return true, nil
}

func telegramMessage(typ string, d email.TemplateData) string {
	switch typ {
	case "REGISTRATION_CONFIRMATION":
		return fmt.Sprintf("Your ticket is ready 🎟️\n\n%s · %s\n%s at %s\n%s\nBib: %s\n\nShow this QR at check-in.", d.EventName, d.CategoryName, d.EventDate, d.StartTime, d.Location, d.RegistrationNumber)
	case "PAYMENT_CONFIRMATION":
		return fmt.Sprintf("Payment confirmed ✓\n\n%s · %s\n%s\nBib: %s\n\nYour check-in QR is attached.", d.EventName, d.AmountFormatted, d.CategoryName, d.RegistrationNumber)
	case "EVENT_REMINDER":
		return fmt.Sprintf("Race reminder ⏱️\n\n%s · %s\n%s at %s\n%s\n\nOpen your race wallet: %s", d.EventName, d.CategoryName, d.EventDate, d.StartTime, d.Location, d.DashboardURL)
	case "EVENT_UPDATE":
		return fmt.Sprintf("Event update ⚡\n\n%s changed: %s\n\nReview your race details: %s", d.EventName, d.ChangedFields, d.DashboardURL)
	case "EVENT_ANNOUNCEMENT":
		return fmt.Sprintf("%s 📣\n\n%s\n\n%s\nOpen your race wallet: %s", d.AnnouncementTitle, d.EventName, d.AnnouncementMessage, d.DashboardURL)
	case "CANCELLATION":
		return fmt.Sprintf("Entry cancelled\n\nYour entry for %s (%s) is cancelled and its ticket is no longer valid.", d.EventName, d.RegistrationNumber)
	default:
		return fmt.Sprintf("Unity Runn Club update for %s. Open your race wallet: %s", d.EventName, d.DashboardURL)
	}
}
