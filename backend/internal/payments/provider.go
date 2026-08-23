// Package payments defines the payment provider abstraction.
// Registration logic depends only on this interface, never on a
// specific gateway, so a real Cambodian payment provider can be
// wired in later without touching internal/registrations.
package payments

import "context"

// Status is a payment's lifecycle state, mirroring the payments
// table's CHECK constraint.
type Status string

const (
	StatusPending   Status = "PENDING"
	StatusSucceeded Status = "SUCCEEDED"
	StatusFailed    Status = "FAILED"
	StatusRefunded  Status = "REFUNDED"
)

// Payment is the result of creating or looking up a payment with a
// provider.
type Payment struct {
	ProviderReference string
	Status            Status
}

// WebhookEvent is a provider-agnostic representation of a payment
// webhook callback, after signature verification.
type WebhookEvent struct {
	ProviderReference string
	Status            Status
}

// Provider abstracts a payment gateway. Implementations must verify
// webhook authenticity themselves (e.g. signature headers) — callers
// never trust payment status supplied by the frontend or an
// unverified webhook body.
type Provider interface {
	// Name identifies the provider (stored on the payments row).
	Name() string

	// CreatePayment starts a payment for a registration and returns
	// its initial state.
	CreatePayment(ctx context.Context, registrationID, currency string, amountCents int) (Payment, error)

	// GetPaymentStatus polls the provider for a payment's current status.
	GetPaymentStatus(ctx context.Context, providerReference string) (Status, error)

	// HandleWebhook verifies and parses an incoming webhook payload.
	HandleWebhook(ctx context.Context, payload []byte, signature string) (WebhookEvent, error)

	// RefundPayment issues a refund for a previously succeeded payment.
	RefundPayment(ctx context.Context, providerReference string, amountCents int) error
}
