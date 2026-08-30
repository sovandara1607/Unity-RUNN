package telegram

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/unity-run-club/api/internal/email"
)

type fakeRepository struct {
	connections map[uuid.UUID]*Connection
	tokenHash   []byte
	tokenUser   uuid.UUID
	expiresAt   time.Time
	lastTestAt  map[uuid.UUID]time.Time
}

func (f *fakeRepository) GetConnection(_ context.Context, userID uuid.UUID) (*Connection, error) {
	connection, ok := f.connections[userID]
	if !ok {
		return nil, ErrNotFound
	}
	copy := *connection
	return &copy, nil
}
func (f *fakeRepository) SaveLinkToken(_ context.Context, userID uuid.UUID, hash []byte, expiresAt time.Time) error {
	f.tokenHash, f.tokenUser, f.expiresAt = append([]byte(nil), hash...), userID, expiresAt
	return nil
}
func (f *fakeRepository) ConsumeLinkToken(_ context.Context, hash []byte, chatID, telegramUserID int64, username, firstName string) (uuid.UUID, error) {
	if string(hash) != string(f.tokenHash) {
		return uuid.Nil, ErrNotFound
	}
	f.connections[f.tokenUser] = &Connection{UserID: f.tokenUser, ChatID: chatID, TelegramUserID: telegramUserID, Username: username, FirstName: firstName, LinkedAt: time.Now(), Preferences: defaultPreferences()}
	return f.tokenUser, nil
}
func (f *fakeRepository) DeleteConnection(_ context.Context, userID uuid.UUID) error {
	delete(f.connections, userID)
	return nil
}
func (f *fakeRepository) UpdatePreferences(_ context.Context, userID uuid.UUID, preferences Preferences) error {
	connection, ok := f.connections[userID]
	if !ok {
		return ErrNotFound
	}
	connection.Preferences = preferences
	return nil
}
func (f *fakeRepository) ReserveTestMessage(_ context.Context, userID uuid.UUID, now time.Time) (*Connection, error) {
	connection, ok := f.connections[userID]
	if !ok {
		return nil, ErrNotFound
	}
	if f.lastTestAt == nil {
		f.lastTestAt = map[uuid.UUID]time.Time{}
	}
	if last := f.lastTestAt[userID]; !last.IsZero() && now.Sub(last) < 30*time.Second {
		return nil, ErrTestRateLimited
	}
	f.lastTestAt[userID] = now
	copy := *connection
	return &copy, nil
}

type fakeClient struct {
	messages []string
	photos   [][]byte
	err      error
}

func (f *fakeClient) SendMessage(_ context.Context, _ int64, message string) error {
	f.messages = append(f.messages, message)
	return f.err
}
func (f *fakeClient) SendPhoto(_ context.Context, _ int64, photo []byte, _ string, caption string) error {
	f.photos = append(f.photos, photo)
	f.messages = append(f.messages, caption)
	return f.err
}

func TestCreateLinkAndConnect(t *testing.T) {
	repo := &fakeRepository{connections: map[uuid.UUID]*Connection{}}
	client := &fakeClient{}
	service := NewService(repo, client, "@unity_runn_bot", true)
	service.now = func() time.Time { return time.Date(2026, 8, 29, 8, 0, 0, 0, time.UTC) }
	userID := uuid.New()

	link, err := service.CreateLink(context.Background(), userID)
	if err != nil {
		t.Fatalf("CreateLink() error = %v", err)
	}
	if !strings.HasPrefix(link.URL, "https://t.me/unity_runn_bot?start=link_") {
		t.Fatalf("link URL = %q", link.URL)
	}
	token := strings.TrimPrefix(link.URL, "https://t.me/unity_runn_bot?start=")
	if err := service.Connect(context.Background(), token, Message{Chat: Chat{ID: 42, Type: "private"}, From: User{ID: 84, Username: "runner"}}); err != nil {
		t.Fatalf("Connect() error = %v", err)
	}
	status, err := service.Status(context.Background(), userID)
	if err != nil || !status.Connected || status.Account.Username != "runner" {
		t.Fatalf("Status() = %#v, %v", status, err)
	}
	if len(client.messages) != 1 || !strings.Contains(client.messages[0], "Connected") {
		t.Fatalf("welcome messages = %v", client.messages)
	}
}

func TestSendNotificationDeliversTicketQR(t *testing.T) {
	userID := uuid.New()
	repo := &fakeRepository{connections: map[uuid.UUID]*Connection{userID: {UserID: userID, ChatID: 42, Preferences: defaultPreferences()}}}
	client := &fakeClient{}
	service := NewService(repo, client, "unity_runn_bot", true)

	delivered, err := service.SendNotification(context.Background(), userID, "REGISTRATION_CONFIRMATION", email.TemplateData{
		EventName: "Founders Run", CategoryName: "5K", RegistrationNumber: "URC-2026-0001",
		EventDate: "Sunday, September 6, 2026", StartTime: "5:30 AM", Location: "Koh Pich",
	})
	if err != nil {
		t.Fatalf("SendNotification() error = %v", err)
	}
	if !delivered {
		t.Fatal("SendNotification() did not report a delivered message")
	}
	if len(client.photos) != 1 || len(client.photos[0]) < 100 {
		t.Fatal("expected a generated QR photo")
	}
	if !strings.Contains(client.messages[0], "URC-2026-0001") {
		t.Fatalf("caption = %q", client.messages[0])
	}
}

func TestPreferencesControlDeliveryAndTestIsRateLimited(t *testing.T) {
	userID := uuid.New()
	repo := &fakeRepository{connections: map[uuid.UUID]*Connection{userID: {UserID: userID, ChatID: 42, Preferences: defaultPreferences()}}}
	client := &fakeClient{}
	service := NewService(repo, client, "unity_runn_bot", true)
	service.now = func() time.Time { return time.Date(2026, 8, 29, 8, 0, 0, 0, time.UTC) }

	status, err := service.UpdatePreferences(context.Background(), userID, Preferences{Tickets: false, Reminders: true, EventUpdates: false})
	if err != nil || status.Preferences.Tickets || !status.Preferences.Reminders {
		t.Fatalf("UpdatePreferences() = %#v, %v", status, err)
	}
	delivered, err := service.SendNotification(context.Background(), userID, "REGISTRATION_CONFIRMATION", email.TemplateData{RegistrationNumber: "URC-1"})
	if err != nil {
		t.Fatal(err)
	}
	if delivered {
		t.Fatal("disabled ticket preference reported a delivered message")
	}
	if len(client.photos) != 0 {
		t.Fatal("disabled ticket preference still delivered a QR")
	}
	if err := service.SendTest(context.Background(), userID); err != nil {
		t.Fatalf("SendTest() error = %v", err)
	}
	if err := service.SendTest(context.Background(), userID); !errors.Is(err, ErrTestRateLimited) {
		t.Fatalf("second SendTest() error = %v", err)
	}
}

func TestConnectRejectsNonPrivateChat(t *testing.T) {
	service := NewService(&fakeRepository{connections: map[uuid.UUID]*Connection{}}, &fakeClient{}, "bot", true)
	err := service.Connect(context.Background(), "link_token", Message{Chat: Chat{ID: -1, Type: "group"}, From: User{ID: 1}})
	if err == nil || errors.Is(err, ErrNotFound) {
		t.Fatalf("Connect() error = %v", err)
	}
}
