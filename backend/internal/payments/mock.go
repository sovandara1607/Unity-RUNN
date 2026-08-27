package payments

import (
	"context"
	"fmt"

	"github.com/google/uuid"
)

// MockProvider is a synchronous, always-succeeding payment provider.
// It exists to exercise the full registration -> payment ->
// confirmation code path in development and tests before a real
// Cambodian payment gateway is integrated. It must never be used in
// production.
type MockProvider struct{}

// NewMockProvider builds a MockProvider.
func NewMockProvider() *MockProvider {
	return &MockProvider{}
}

func (m *MockProvider) Name() string { return "mock" }

func (m *MockProvider) CreatePayment(ctx context.Context, registrationID, currency string, amountCents int) (Payment, error) {
	return Payment{
		ProviderReference: fmt.Sprintf("mock_%s", uuid.NewString()),
		Status:            StatusSucceeded,
		Verification: &Verification{
			AmountCents: amountCents, Currency: currency, ReceiverAccount: "mock",
		},
	}, nil
}

func (m *MockProvider) GetPaymentStatus(ctx context.Context, providerReference string) (Payment, error) {
	return Payment{ProviderReference: providerReference, Status: StatusSucceeded}, nil
}

func (m *MockProvider) HandleWebhook(ctx context.Context, payload []byte, signature string) (WebhookEvent, error) {
	return WebhookEvent{}, fmt.Errorf("payments: mock provider does not send webhooks")
}

func (m *MockProvider) RefundPayment(ctx context.Context, providerReference string, amountCents int) error {
	return nil
}
