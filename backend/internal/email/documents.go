package email

import (
	"bytes"
	"embed"
	"fmt"
	"strings"
	"time"

	"github.com/signintech/gopdf"
	qrcode "github.com/skip2/go-qrcode"
)

// Noto Sans keeps the race documents portable and makes the generated PDF
// independent from fonts installed on the API host.
//
//go:embed assets/NotoSans-Regular.ttf assets/NotoSans-Bold.ttf
var documentFonts embed.FS

const (
	docRegular = "NotoSans"
	docBold    = "NotoSansBold"
)

// AttachmentsFor returns the official document appropriate for a notification.
// Registration confirmations carry the scannable ticket; payment confirmations
// carry the receipt. Other operational emails intentionally stay lightweight.
func AttachmentsFor(typ Type, data TemplateData) ([]Attachment, error) {
	var (
		contents []byte
		name     string
		err      error
	)

	switch typ {
	case TypeRegistrationConfirmation:
		contents, err = RenderTicketPDF(data)
		name = "ticket-" + safeFilename(data.RegistrationNumber) + ".pdf"
	case TypePaymentConfirmation:
		contents, err = RenderPaymentReceiptPDF(data)
		name = "payment-receipt-" + safeFilename(data.RegistrationNumber) + ".pdf"
	default:
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return []Attachment{{Filename: name, ContentType: "application/pdf", Data: contents}}, nil
}

// RenderTicketPDF creates the same practical ticket users see in their race
// wallet: runner details plus a high-contrast QR that encodes the stable
// registration number accepted by the check-in station.
func RenderTicketPDF(data TemplateData) ([]byte, error) {
	pdf, err := newDocument()
	if err != nil {
		return nil, err
	}
	pdf.AddPage()

	pageWidth := 595.28
	fill(pdf, 0, 0, pageWidth, 841.89, 17, 17, 17)
	fill(pdf, 28, 28, pageWidth-56, 785, 248, 248, 246)
	fill(pdf, 28, 28, pageWidth-56, 66, 17, 17, 17)
	text(pdf, docBold, 11, 54, 54, 217, 255, 0, "UNITY RUNN CLUB  /  OFFICIAL ENTRY")
	textRight(pdf, docBold, 10, 520, 54, 248, 248, 246, "CONFIRMED")

	textFit(pdf, docBold, 31, 20, 487, 54, 132, 17, 17, 17, strings.ToUpper(data.EventName))
	line(pdf, 54, 165, 541, 165, 210, 210, 205)
	labelValue(pdf, 54, 193, "BIB NO.", data.RegistrationNumber)
	labelValue(pdf, 300, 193, "RUNNER", data.FullName)
	labelValue(pdf, 54, 256, "RACE", data.CategoryName)
	labelValue(pdf, 300, 256, "TEE", fallback(data.TshirtSize, "—"))
	labelValue(pdf, 54, 319, "DATE / START", strings.TrimSpace(data.EventDate+"  "+data.StartTime))
	labelValue(pdf, 300, 319, "VENUE", data.Location)

	fill(pdf, 28, 392, pageWidth-56, 421, 217, 255, 0)
	text(pdf, docBold, 18, 54, 438, 17, 17, 17, "SCAN AT THE CHECK-IN DESK")
	text(pdf, docRegular, 10, 54, 462, 49, 61, 0, "Keep this ticket on your phone. The QR stays valid for race day.")

	qrPNG, err := qrcode.Encode(data.RegistrationNumber, qrcode.High, 512)
	if err != nil {
		return nil, fmt.Errorf("email: create ticket QR: %w", err)
	}
	qr, err := gopdf.ImageHolderByReader(bytes.NewReader(qrPNG))
	if err != nil {
		return nil, fmt.Errorf("email: read ticket QR: %w", err)
	}
	fill(pdf, 54, 500, 238, 238, 255, 255, 255)
	if err := pdf.ImageByHolder(qr, 69, 515, &gopdf.Rect{W: 208, H: 208}); err != nil {
		return nil, fmt.Errorf("email: draw ticket QR: %w", err)
	}
	text(pdf, docBold, 12, 322, 552, 17, 17, 17, "YOUR RACE PASS")
	text(pdf, docRegular, 10, 322, 579, 49, 61, 0, "Present this code to the crew when you arrive.")
	text(pdf, docBold, 15, 322, 628, 17, 17, 17, data.RegistrationNumber)
	text(pdf, docRegular, 9, 322, 657, 49, 61, 0, "One entry  /  One runner  /  Keep it private")

	return pdf.GetBytesPdfReturnErr()
}

// RenderPaymentReceiptPDF creates a durable receipt from the verified payment
// record. It intentionally excludes sensitive checkout payloads and credentials.
func RenderPaymentReceiptPDF(data TemplateData) ([]byte, error) {
	pdf, err := newDocument()
	if err != nil {
		return nil, err
	}
	pdf.AddPage()
	pageWidth := 595.28
	fill(pdf, 0, 0, pageWidth, 841.89, 17, 17, 17)
	fill(pdf, 28, 28, pageWidth-56, 785, 248, 248, 246)
	fill(pdf, 28, 28, 10, 785, 217, 255, 0)

	text(pdf, docBold, 11, 58, 62, 49, 85, 255, "UNITY RUNN CLUB  /  PAYMENT DESK")
	text(pdf, docBold, 34, 58, 112, 17, 17, 17, "PAYMENT RECEIPT")
	text(pdf, docRegular, 11, 58, 163, 92, 92, 88, "Verified entry payment for "+data.EventName)
	fill(pdf, 58, 205, 479, 105, 217, 255, 0)
	text(pdf, docBold, 10, 78, 230, 49, 61, 0, "AMOUNT PAID")
	text(pdf, docBold, 28, 78, 263, 17, 17, 17, fallback(data.AmountFormatted, "PAID"))
	textRight(pdf, docBold, 11, 513, 249, 17, 17, 17, "PAYMENT VERIFIED")

	receiptRow(pdf, 58, 344, "RUNNER", data.FullName)
	receiptRow(pdf, 58, 395, "REGISTRATION", data.RegistrationNumber)
	receiptRow(pdf, 58, 446, "EVENT / CATEGORY", data.EventName+"  /  "+data.CategoryName)
	receiptRow(pdf, 58, 497, "PAYMENT METHOD", strings.ToUpper(fallback(data.PaymentProvider, "BAKONG")))
	receiptRow(pdf, 58, 548, "REFERENCE", fallback(data.PaymentReference, "—"))
	receiptRow(pdf, 58, 599, "VERIFIED AT", fallback(data.PaymentVerifiedAt, time.Now().Format("02 Jan 2006, 15:04 MST")))

	line(pdf, 58, 668, 537, 668, 210, 210, 205)
	text(pdf, docBold, 10, 58, 704, 17, 17, 17, "KEEP THIS RECEIPT FOR YOUR RECORDS")
	text(pdf, docRegular, 9, 58, 730, 92, 92, 88, "No banking credentials or checkout payloads are stored in this document.")
	text(pdf, docRegular, 9, 58, 772, 92, 92, 88, "Generated by Unity Runn Club Race Control")

	return pdf.GetBytesPdfReturnErr()
}

func newDocument() (*gopdf.GoPdf, error) {
	regular, err := documentFonts.ReadFile("assets/NotoSans-Regular.ttf")
	if err != nil {
		return nil, fmt.Errorf("email: read document font: %w", err)
	}
	bold, err := documentFonts.ReadFile("assets/NotoSans-Bold.ttf")
	if err != nil {
		return nil, fmt.Errorf("email: read document font: %w", err)
	}
	pdf := &gopdf.GoPdf{}
	pdf.Start(gopdf.Config{PageSize: *gopdf.PageSizeA4})
	if err := pdf.AddTTFFontData(docRegular, regular); err != nil {
		return nil, fmt.Errorf("email: register document font: %w", err)
	}
	if err := pdf.AddTTFFontData(docBold, bold); err != nil {
		return nil, fmt.Errorf("email: register bold document font: %w", err)
	}
	return pdf, nil
}

func fill(pdf *gopdf.GoPdf, x, y, width, height float64, r, g, b uint8) {
	pdf.SetFillColor(r, g, b)
	pdf.RectFromUpperLeftWithStyle(x, y, width, height, "F")
}

func line(pdf *gopdf.GoPdf, x1, y1, x2, y2 float64, r, g, b uint8) {
	pdf.SetStrokeColor(r, g, b)
	pdf.Line(x1, y1, x2, y2)
}

func text(pdf *gopdf.GoPdf, font string, size, x, y float64, r, g, b uint8, value string) {
	_ = pdf.SetFont(font, "", size)
	pdf.SetTextColor(r, g, b)
	pdf.SetXY(x, y)
	_ = pdf.Cell(nil, value)
}

func textRight(pdf *gopdf.GoPdf, font string, size, right, y float64, r, g, b uint8, value string) {
	_ = pdf.SetFont(font, "", size)
	width, _ := pdf.MeasureTextWidth(value)
	text(pdf, font, size, right-width, y, r, g, b, value)
}

func labelValue(pdf *gopdf.GoPdf, x, y float64, label, value string) {
	text(pdf, docBold, 9, x, y, 145, 145, 140, label)
	textFit(pdf, docBold, 12, 8, 220, x, y+25, 17, 17, 17, fallback(value, "—"))
}

func receiptRow(pdf *gopdf.GoPdf, x, y float64, label, value string) {
	text(pdf, docBold, 9, x, y, 145, 145, 140, label)
	textFit(pdf, docBold, 11, 8, 319, x+160, y, 17, 17, 17, fallback(value, "—"))
	line(pdf, x, y+26, 537, y+26, 224, 224, 218)
}

func textFit(pdf *gopdf.GoPdf, font string, size, minSize, maxWidth, x, y float64, r, g, b uint8, value string) {
	fontSize := size
	for fontSize > minSize {
		_ = pdf.SetFont(font, "", fontSize)
		width, err := pdf.MeasureTextWidth(value)
		if err == nil && width <= maxWidth {
			break
		}
		fontSize--
	}
	text(pdf, font, fontSize, x, y, r, g, b, value)
}

func fallback(value, fallbackValue string) string {
	if strings.TrimSpace(value) == "" {
		return fallbackValue
	}
	return value
}

func safeFilename(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = strings.NewReplacer("/", "-", "\\", "-", " ", "-").Replace(value)
	if value == "" {
		return "entry"
	}
	return value
}
