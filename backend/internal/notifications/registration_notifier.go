package notifications

import (
	"context"

	"github.com/unity-run-club/api/internal/registrations"
)

// RegistrationNotifier adapts Service to registrations
type RegistrationNotifier struct {
	svc *Service
}

// NewRegistrationNotifier builds a RegistrationNotifier backed by svc.
func NewRegistrationNotifier(svc *Service) *RegistrationNotifier {
	return &RegistrationNotifier{svc: svc}
}

// NotifyRegistrationConfirmed enqueues a registration confirmation email.
func (n *RegistrationNotifier) NotifyRegistrationConfirmed(ctx context.Context, reg registrations.Registration) {
	_ = n.svc.enqueue(ctx, enqueueParams{
		UserID: &reg.UserID, RecipientEmail: reg.Email, Type: TypeRegistrationConfirmation,
		EntityType: "registration", EntityID: reg.ID,
		Payload: registrationPayload(reg),
	})
}

// NotifyPaymentConfirmed enqueues a payment confirmation email.
func (n *RegistrationNotifier) NotifyPaymentConfirmed(ctx context.Context, reg registrations.Registration, amountCents int) {
	payload := registrationPayload(reg)
	payload["amount_cents"] = amountCents
	_ = n.svc.enqueue(ctx, enqueueParams{
		UserID: &reg.UserID, RecipientEmail: reg.Email, Type: TypePaymentConfirmation,
		EntityType: "registration", EntityID: reg.ID,
		Payload: payload,
	})
}

// NotifyRegistrationCancelled enqueues a cancellation email.
func (n *RegistrationNotifier) NotifyRegistrationCancelled(ctx context.Context, reg registrations.Registration) {
	_ = n.svc.enqueue(ctx, enqueueParams{
		UserID: &reg.UserID, RecipientEmail: reg.Email, Type: TypeCancellation,
		EntityType: "registration", EntityID: reg.ID,
		Payload: registrationPayload(reg),
	})
}

func registrationPayload(reg registrations.Registration) map[string]any {
	return map[string]any{
		"full_name":           reg.FullName,
		"registration_number": reg.RegistrationNumber,
		"event_id":            reg.EventID.String(),
		"event_category_id":   reg.EventCategoryID.String(),
	}
}
