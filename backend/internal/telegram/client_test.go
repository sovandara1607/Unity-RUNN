package telegram

import (
	"context"
	"strings"
	"testing"
)

func TestClientNetworkErrorDoesNotExposeBotToken(t *testing.T) {
	const token = "123456:super-secret-token"
	client := NewClient(token, "http://127.0.0.1:1")
	err := client.SendMessage(context.Background(), 42, "test")
	if err == nil {
		t.Fatal("SendMessage() expected a network error")
	}
	if strings.Contains(err.Error(), token) || strings.Contains(err.Error(), "super-secret") {
		t.Fatalf("network error exposed bot token: %v", err)
	}
}
