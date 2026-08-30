package telegram

import (
	"time"

	"github.com/google/uuid"
)

type Connection struct {
	UserID         uuid.UUID   `json:"-"`
	ChatID         int64       `json:"-"`
	TelegramUserID int64       `json:"-"`
	Username       string      `json:"username"`
	FirstName      string      `json:"first_name"`
	LinkedAt       time.Time   `json:"linked_at"`
	Preferences    Preferences `json:"-"`
}

type Preferences struct {
	Tickets      bool `json:"tickets"`
	Reminders    bool `json:"reminders"`
	EventUpdates bool `json:"event_updates"`
}

type Status struct {
	Available   bool        `json:"available"`
	Connected   bool        `json:"connected"`
	Account     *Connection `json:"account,omitempty"`
	BotName     string      `json:"bot_name,omitempty"`
	Preferences Preferences `json:"preferences"`
}

type Link struct {
	URL       string    `json:"url"`
	ExpiresAt time.Time `json:"expires_at"`
}

type Update struct {
	Message *Message `json:"message"`
}

type Message struct {
	Text string `json:"text"`
	Chat Chat   `json:"chat"`
	From User   `json:"from"`
}

type Chat struct {
	ID   int64  `json:"id"`
	Type string `json:"type"`
}

type User struct {
	ID        int64  `json:"id"`
	Username  string `json:"username"`
	FirstName string `json:"first_name"`
}
