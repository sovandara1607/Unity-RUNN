package main

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"time"

	clubemail "github.com/unity-run-club/api/internal/email"
)

func main() {
	recipient := os.Getenv("EMAIL_TEST_TO")
	if recipient == "" {
		fail(fmt.Errorf("EMAIL_TEST_TO is required"))
	}
	port := 587
	if raw := os.Getenv("SMTP_PORT"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil {
			fail(fmt.Errorf("invalid SMTP_PORT: %w", err))
		}
		port = parsed
	}

	sender, err := clubemail.NewSMTPSender(
		os.Getenv("SMTP_HOST"), port, os.Getenv("SMTP_USER"),
		os.Getenv("SMTP_PASSWORD"), os.Getenv("SMTP_FROM"),
	)
	if err != nil {
		fail(err)
	}

	data := clubemail.TemplateData{
		FullName: "Demo Runner", EventName: "New Event Fun Run", CategoryName: "10K Open",
		RegistrationNumber: "URC-2026-EMAIL-TEST", EventDate: "Thursday, August 27, 2026",
		StartTime: "6:00 AM", Location: "Koh Pich, Phnom Penh, Cambodia", TshirtSize: "L",
		AmountFormatted: "$25.00 USD", PaymentProvider: "Bakong",
		PaymentReference: "KHQR-EMAIL-DESIGN-TEST", PaymentVerifiedAt: "24 Aug 2026, 16:15 ICT",
		DashboardURL: os.Getenv("PUBLIC_APP_URL") + "/dashboard",
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	for _, typ := range []clubemail.Type{clubemail.TypeRegistrationConfirmation, clubemail.TypePaymentConfirmation} {
		subject, html, text, err := clubemail.Render(typ, data)
		if err != nil {
			fail(err)
		}
		attachments, err := clubemail.AttachmentsFor(typ, data)
		if err != nil {
			fail(err)
		}
		if err := sender.Send(ctx, clubemail.Message{
			To: recipient, Subject: "[DESIGN TEST] " + subject, HTML: html, Text: text, Attachments: attachments,
		}); err != nil {
			fail(err)
		}
		fmt.Printf("sent %s with %d attachment\n", typ, len(attachments))
	}
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}
