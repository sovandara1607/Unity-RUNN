package email

import (
	"context"
	"io"
	"log/slog"
	"testing"
)

// TestNoopSender_SendNeverErrors tests the NoopSender that never errors
func TestNoopSender_SendNeverErrors(t *testing.T) {
	sender := NewNoopSender(slog.New(slog.NewTextHandler(io.Discard, nil)))

	err := sender.Send(context.Background(), Message{
		To: "runner@unityrunclub.com", Subject: "Test", HTML: "<p>hi</p>", Text: "hi",
	})
	if err != nil {
		t.Fatalf("Send() error = %v", err)
	}
}
