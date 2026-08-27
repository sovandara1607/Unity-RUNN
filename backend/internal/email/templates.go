package email

import (
	"bytes"
	"embed"
	"fmt"
	"html/template"
	textTemplate "text/template"
)

//go:embed templates/*.tmpl
var templateFS embed.FS

// Type identifies which notification template to render. Mirrors
// internal/notifications.Type — kept as a separate string type here
// so internal/email has no dependency on internal/notifications
// (email is the lower-level, reusable package).
type Type string

const (
	TypeRegistrationConfirmation Type = "REGISTRATION_CONFIRMATION"
	TypePaymentConfirmation      Type = "PAYMENT_CONFIRMATION"
	TypeEventReminder            Type = "EVENT_REMINDER"
	TypeEventUpdate              Type = "EVENT_UPDATE"
	TypeCancellation             Type = "CANCELLATION"
)

var subjects = map[Type]string{
	TypeRegistrationConfirmation: "You're registered for {{.EventName}}!",
	TypePaymentConfirmation:      "Payment received for {{.EventName}}",
	TypeEventReminder:            "{{.EventName}} is coming up!",
	TypeEventUpdate:              "{{.EventName}} has been updated",
	TypeCancellation:             "Your registration for {{.EventName}} was cancelled",
}

var filenames = map[Type]string{
	TypeRegistrationConfirmation: "registration_confirmation",
	TypePaymentConfirmation:      "payment_confirmation",
	TypeEventReminder:            "event_reminder",
	TypeEventUpdate:              "event_update",
	TypeCancellation:             "cancellation",
}

// TemplateData is the placeholder set every template can draw from.
// Not every field is used by every template.
type TemplateData struct {
	FullName           string
	EventName          string
	CategoryName       string
	RegistrationNumber string
	EventDate          string
	StartTime          string
	Location           string
	TshirtSize         string
	AmountFormatted    string
	PaymentProvider    string
	PaymentReference   string
	PaymentVerifiedAt  string
	DashboardURL       string
	ChangedFields      string
}

// Render produces the subject, HTML body, and plain-text body for
// typ using data.
func Render(typ Type, data TemplateData) (subject, html, text string, err error) {
	subjectTmpl, ok := subjects[typ]
	if !ok {
		return "", "", "", fmt.Errorf("email: unknown template type %q", typ)
	}
	filename, ok := filenames[typ]
	if !ok {
		return "", "", "", fmt.Errorf("email: unknown template type %q", typ)
	}

	subject, err = renderText(subjectTmpl, data)
	if err != nil {
		return "", "", "", fmt.Errorf("email: render subject: %w", err)
	}

	html, err = renderHTMLFile(filename+".html.tmpl", data)
	if err != nil {
		return "", "", "", fmt.Errorf("email: render html: %w", err)
	}

	text, err = renderTextFile(filename+".txt.tmpl", data)
	if err != nil {
		return "", "", "", fmt.Errorf("email: render text: %w", err)
	}

	return subject, html, text, nil
}

func renderText(tmplSrc string, data TemplateData) (string, error) {
	tmpl, err := textTemplate.New("inline").Parse(tmplSrc)
	if err != nil {
		return "", err
	}
	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return "", err
	}
	return buf.String(), nil
}

func renderHTMLFile(name string, data TemplateData) (string, error) {
	tmpl, err := template.ParseFS(templateFS, "templates/base.html.tmpl", "templates/"+name)
	if err != nil {
		return "", err
	}
	var buf bytes.Buffer
	if err := tmpl.ExecuteTemplate(&buf, "base", data); err != nil {
		return "", err
	}
	return buf.String(), nil
}

func renderTextFile(name string, data TemplateData) (string, error) {
	tmpl, err := textTemplate.ParseFS(templateFS, "templates/"+name)
	if err != nil {
		return "", err
	}
	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return "", err
	}
	return buf.String(), nil
}
