package payments

import (
	"context"
	"testing"
)

func TestMockProvider_CreatePaymentSucceeds(t *testing.T) {
	p := NewMockProvider()

	payment, err := p.CreatePayment(context.Background(), "reg-123", "USD", 5000)
	if err != nil {
		t.Fatalf("CreatePayment() error = %v", err)
	}
	if payment.Status != StatusSucceeded {
		t.Errorf("Status = %q, want %q", payment.Status, StatusSucceeded)
	}
	if payment.ProviderReference == "" {
		t.Error("expected a non-empty ProviderReference")
	}
}

func TestMockProvider_Name(t *testing.T) {
	if got := NewMockProvider().Name(); got != "mock" {
		t.Errorf("Name() = %q, want %q", got, "mock")
	}
}
