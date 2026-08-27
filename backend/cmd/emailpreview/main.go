// Command emailpreview renders representative transactional emails and their
// attachments for local visual QA. It never sends mail.
package main

import (
	"fmt"
	"os"
	"path/filepath"

	clubemail "github.com/unity-run-club/api/internal/email"
)

func main() {
	outputDir := "../../tmp/pdfs"
	if len(os.Args) > 1 {
		outputDir = os.Args[1]
	}
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		fail(err)
	}

	data := clubemail.TemplateData{
		FullName: "Demo Runner", EventName: "New Event Fun Run", CategoryName: "10K Open",
		RegistrationNumber: "URC-2026-000009", EventDate: "Thursday, August 27, 2026",
		StartTime: "6:00 AM", Location: "Koh Pich, Phnom Penh, Cambodia", TshirtSize: "L",
		AmountFormatted: "$25.00 USD", PaymentProvider: "Bakong",
		PaymentReference: "KHQR-2026-08-24-000009", PaymentVerifiedAt: "24 Aug 2026, 15:42 ICT",
		DashboardURL: "http://localhost:3000/dashboard",
	}

	ticket, err := clubemail.RenderTicketPDF(data)
	if err != nil {
		fail(err)
	}
	receipt, err := clubemail.RenderPaymentReceiptPDF(data)
	if err != nil {
		fail(err)
	}
	write(filepath.Join(outputDir, "ticket-sample.pdf"), ticket)
	write(filepath.Join(outputDir, "payment-receipt-sample.pdf"), receipt)

	for _, typ := range []clubemail.Type{clubemail.TypeRegistrationConfirmation, clubemail.TypePaymentConfirmation} {
		_, html, _, err := clubemail.Render(typ, data)
		if err != nil {
			fail(err)
		}
		write(filepath.Join(outputDir, string(typ)+".html"), []byte(html))
	}
	fmt.Printf("email previews written to %s\n", outputDir)
}

func write(path string, contents []byte) {
	if err := os.WriteFile(path, contents, 0o644); err != nil {
		fail(err)
	}
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}
