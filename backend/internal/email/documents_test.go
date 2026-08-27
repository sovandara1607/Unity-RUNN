package email

import (
	"bytes"
	"testing"
)

func TestAttachmentsFor_RegistrationIncludesScannableTicket(t *testing.T) {
	data := documentTestData()
	attachments, err := AttachmentsFor(TypeRegistrationConfirmation, data)
	if err != nil {
		t.Fatalf("AttachmentsFor() error = %v", err)
	}
	if len(attachments) != 1 {
		t.Fatalf("attachments = %d, want 1", len(attachments))
	}
	if attachments[0].ContentType != "application/pdf" {
		t.Errorf("content type = %q, want application/pdf", attachments[0].ContentType)
	}
	if !bytes.HasPrefix(attachments[0].Data, []byte("%PDF-")) {
		t.Error("ticket attachment is not a PDF")
	}
}

func TestAttachmentsFor_PaymentIncludesReceipt(t *testing.T) {
	attachments, err := AttachmentsFor(TypePaymentConfirmation, documentTestData())
	if err != nil {
		t.Fatalf("AttachmentsFor() error = %v", err)
	}
	if len(attachments) != 1 || !bytes.HasPrefix(attachments[0].Data, []byte("%PDF-")) {
		t.Fatal("payment confirmation should contain one PDF receipt")
	}
}

func TestAttachmentsFor_OperationalEmailHasNoDocument(t *testing.T) {
	attachments, err := AttachmentsFor(TypeEventReminder, documentTestData())
	if err != nil {
		t.Fatalf("AttachmentsFor() error = %v", err)
	}
	if len(attachments) != 0 {
		t.Fatalf("attachments = %d, want 0", len(attachments))
	}
}

func documentTestData() TemplateData {
	return TemplateData{
		FullName: "Demo Runner", EventName: "New Event Fun Run", CategoryName: "10K",
		RegistrationNumber: "URC-2026-000009", EventDate: "Thursday, August 27, 2026",
		StartTime: "6:00 AM", Location: "Koh Pich, Phnom Penh", TshirtSize: "L",
		AmountFormatted: "$25.00 USD", PaymentProvider: "Bakong",
		PaymentReference: "KHQR-2026-08-24-000009", PaymentVerifiedAt: "24 Aug 2026, 15:42 ICT",
		DashboardURL: "http://localhost:3000/dashboard",
	}
}
