package payments

import (
	"context"
	"testing"
	"time"
)

func TestManualProviderCreatesStaticQRCheckout(t *testing.T) {
	provider, err := NewManualProvider(ManualConfig{QRString: "bank-qr-payload", TTL: time.Hour})
	if err != nil {
		t.Fatal(err)
	}
	fixed := time.Date(2026, 9, 20, 12, 0, 0, 0, time.UTC)
	provider.now = func() time.Time { return fixed }

	payment, err := provider.CreatePayment(context.Background(), "registration-id", "USD", 2500)
	if err != nil {
		t.Fatal(err)
	}
	if payment.Status != StatusPending || payment.Checkout == nil {
		t.Fatalf("payment = %#v", payment)
	}
	if payment.Checkout.QRString != "bank-qr-payload" {
		t.Fatalf("QRString = %q", payment.Checkout.QRString)
	}
	if !payment.Checkout.ExpiresAt.Equal(fixed.Add(time.Hour)) {
		t.Fatalf("ExpiresAt = %s", payment.Checkout.ExpiresAt)
	}
}

func TestManualProviderRequiresQRPayload(t *testing.T) {
	if _, err := NewManualProvider(ManualConfig{}); err == nil {
		t.Fatal("expected missing QR payload to fail")
	}
}
