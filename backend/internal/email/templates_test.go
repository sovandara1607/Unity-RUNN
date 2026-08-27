package email

import (
	"strings"
	"testing"
)

// allTypes returns all email types
func allTypes() []Type {
	return []Type{
		TypeRegistrationConfirmation, TypePaymentConfirmation,
		TypeEventReminder, TypeEventUpdate, TypeCancellation,
	}
}

// TestRender_AllTypesRenderWithoutError tests the Render method that renders all email types without error
func TestRender_AllTypesRenderWithoutError(t *testing.T) {
	data := TemplateData{
		FullName: "Test Runner", EventName: "Founders Run", CategoryName: "5K",
		RegistrationNumber: "URC-2026-000001", EventDate: "Saturday, January 10, 2026",
		StartTime: "6:00 AM", Location: "Diamond Island", AmountFormatted: "$50.00",
		PaymentProvider: "Bakong", PaymentReference: "KHQR-001",
		DashboardURL: "http://localhost:3000/dashboard", ChangedFields: "event date, location",
	}

	for _, typ := range allTypes() {
		t.Run(string(typ), func(t *testing.T) {
			subject, html, text, err := Render(typ, data)
			if err != nil {
				t.Fatalf("Render(%q) error = %v", typ, err)
			}
			if subject == "" {
				t.Error("expected non-empty subject")
			}
			if !strings.Contains(subject, "Founders Run") {
				t.Errorf("subject = %q, want it to mention the event name", subject)
			}
			if !strings.Contains(html, "Test Runner") {
				t.Error("expected html body to contain the participant's name")
			}
			if !strings.Contains(text, "Test Runner") {
				t.Error("expected text body to contain the participant's name")
			}
			if !strings.Contains(html, "URC-2026-000001") {
				t.Error("expected html body to contain the registration number")
			}
		})
	}
}

// TestRender_UnknownType tests the Render method that returns an error for an unknown email type
func TestRender_UnknownType(t *testing.T) {
	_, _, _, err := Render(Type("BOGUS"), TemplateData{})
	if err == nil {
		t.Fatal("Render() with unknown type expected an error, got nil")
	}
}
