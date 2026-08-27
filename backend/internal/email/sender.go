// Package email renders and sends transactional emails. Sending goes
// through the Sender interface so internal/notifications' worker
// never depends on a specific transport — SMTPSender talks to Google
// SMTP; NoopSender (used when SMTP isn't configured) just logs, for
// local development without real Gmail credentials.
package email

import (
	"bytes"
	"context"
	"crypto/tls"
	"fmt"
	"log/slog"

	gomail "github.com/wneessen/go-mail"
)

// Message is a rendered email ready to send.
type Message struct {
	To          string
	Subject     string
	HTML        string
	Text        string
	Attachments []Attachment
}

// Attachment is an in-memory file delivered with an email. Notification
// documents are generated just-in-time, so no runner data has to be written to
// a shared filesystem before SMTP delivery.
type Attachment struct {
	Filename    string
	ContentType string
	Data        []byte
}

// Sender delivers a Message.
type Sender interface {
	Send(ctx context.Context, msg Message) error
}

// SMTPSender sends via Google SMTP (smtp.gmail.com:587, STARTTLS).
// Construct with an App Password, never a real account password.
type SMTPSender struct {
	client *gomail.Client
	from   string
}

// NewSMTPSender builds an SMTPSender. host/port/user/password/from
// come from config (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD,
// SMTP_FROM) — never hard-code credentials.
func NewSMTPSender(host string, port int, user, password, from string) (*SMTPSender, error) {
	client, err := gomail.NewClient(host,
		gomail.WithPort(port),
		gomail.WithSMTPAuth(gomail.SMTPAuthPlain),
		gomail.WithUsername(user),
		gomail.WithPassword(password),
		gomail.WithTLSPolicy(gomail.TLSMandatory),
		gomail.WithTLSConfig(&tls.Config{ServerName: host}),
	)
	if err != nil {
		return nil, fmt.Errorf("email: build smtp client: %w", err)
	}
	return &SMTPSender{client: client, from: from}, nil
}

// Send delivers msg over SMTP.
func (s *SMTPSender) Send(ctx context.Context, msg Message) error {
	m := gomail.NewMsg()
	if err := m.From(s.from); err != nil {
		return fmt.Errorf("email: set from: %w", err)
	}
	if err := m.To(msg.To); err != nil {
		return fmt.Errorf("email: set to: %w", err)
	}
	m.Subject(msg.Subject)
	m.SetBodyString(gomail.TypeTextPlain, msg.Text)
	m.AddAlternativeString(gomail.TypeTextHTML, msg.HTML)
	for _, attachment := range msg.Attachments {
		options := []gomail.FileOption{}
		if attachment.ContentType != "" {
			options = append(options, gomail.WithFileContentType(gomail.ContentType(attachment.ContentType)))
		}
		if err := m.AttachReader(attachment.Filename, bytes.NewReader(attachment.Data), options...); err != nil {
			return fmt.Errorf("email: attach %s: %w", attachment.Filename, err)
		}
	}

	if err := s.client.DialAndSendWithContext(ctx, m); err != nil {
		return fmt.Errorf("email: send: %w", err)
	}
	return nil
}

// NoopSender logs the rendered email instead of sending it. Used
// when SMTP_HOST/USER/PASSWORD aren't configured — same "safe local
// default, real implementation required in production" precedent as
// payments.MockProvider.
type NoopSender struct {
	log *slog.Logger
}

// NewNoopSender builds a NoopSender.
func NewNoopSender(log *slog.Logger) *NoopSender {
	return &NoopSender{log: log}
}

func (s *NoopSender) Send(ctx context.Context, msg Message) error {
	s.log.Info("email_not_sent_smtp_unconfigured",
		"to", msg.To, "subject", msg.Subject, "attachments", len(msg.Attachments),
		"text_preview", truncate(msg.Text, 200))
	return nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
