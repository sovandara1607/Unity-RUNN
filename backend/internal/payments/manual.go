package payments

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

type ManualConfig struct {
	QRString string
	TTL      time.Duration
}

// ManualProvider presents one configured bank QR. Settlement is reviewed by
// an administrator against the bank transaction reference supplied by the
// runner; it is never inferred from scanning the code.
type ManualProvider struct {
	qrString string
	ttl      time.Duration
	now      func() time.Time
}

func NewManualProvider(cfg ManualConfig) (*ManualProvider, error) {
	if strings.TrimSpace(cfg.QRString) == "" {
		return nil, fmt.Errorf("payments: MANUAL_PAYMENT_QR_STRING is required")
	}
	if cfg.TTL <= 0 {
		cfg.TTL = 24 * time.Hour
	}
	return &ManualProvider{qrString: strings.TrimSpace(cfg.QRString), ttl: cfg.TTL, now: time.Now}, nil
}

func (p *ManualProvider) Name() string { return "manual" }

func (p *ManualProvider) CreatePayment(_ context.Context, _ string, _ string, _ int) (Payment, error) {
	return Payment{
		ProviderReference: "manual_" + uuid.NewString(),
		Status:            StatusPending,
		Checkout: &Checkout{
			QRString:  p.qrString,
			ExpiresAt: p.now().Add(p.ttl),
		},
	}, nil
}

func (p *ManualProvider) GetPaymentStatus(_ context.Context, providerReference string) (Payment, error) {
	return Payment{ProviderReference: providerReference, Status: StatusPending}, ErrUnsupported
}

func (p *ManualProvider) HandleWebhook(context.Context, []byte, string) (WebhookEvent, error) {
	return WebhookEvent{}, ErrUnsupported
}

func (p *ManualProvider) RefundPayment(context.Context, string, int) error { return ErrUnsupported }
