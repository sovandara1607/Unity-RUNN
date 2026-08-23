package checkin

import (
	"context"
	"errors"

	"github.com/google/uuid"

	"github.com/unity-run-club/api/internal/auditlog"
	"github.com/unity-run-club/api/internal/registrations"
	"github.com/unity-run-club/api/internal/tokenhash"
)

// ErrInvalidToken is returned when the scanned token doesn't resolve
// to any ticket.
var ErrInvalidToken = errors.New("checkin: invalid or unknown ticket token")

// ErrNotConfirmed is returned when the registration exists but isn't
// CONFIRMED (e.g. still PENDING payment, or cancelled).
var ErrNotConfirmed = errors.New("checkin: registration is not confirmed")

// checkinRepository is the subset of Repository this service depends on.
type checkinRepository interface {
	Create(ctx context.Context, registrationID, staffUserID uuid.UUID) (*CheckIn, error)
}

// registrationsReader is the read-only slice of the registrations
// domain this service needs. checkin depends on registrations, never
// the other way — same one-directional pattern registrations uses
// for events.
type registrationsReader interface {
	GetRegistrationIDByTicketTokenHash(ctx context.Context, tokenHash string) (uuid.UUID, error)
	GetByID(ctx context.Context, id uuid.UUID) (*registrations.Registration, error)
}

// Service implements check-in business rules.
type Service struct {
	repo     checkinRepository
	regsRepo registrationsReader
	audit    *auditlog.Service
}

// NewService builds a Service.
func NewService(repo checkinRepository, regsRepo registrationsReader, audit *auditlog.Service) *Service {
	return &Service{repo: repo, regsRepo: regsRepo, audit: audit}
}

// Result bundles a successful check-in with the registration it belongs to.
type Result struct {
	Registration registrations.Registration
	CheckIn      CheckIn
}

// CheckIn validates a scanned raw QR token and records a check-in,
// attributed to staffUserID. Every outcome (success or the reason for
// failure) is written to the audit log.
func (s *Service) CheckIn(ctx context.Context, staffUserID uuid.UUID, rawToken string) (*Result, error) {
	registrationID, err := s.regsRepo.GetRegistrationIDByTicketTokenHash(ctx, tokenhash.Hash(rawToken))
	if errors.Is(err, registrations.ErrNotFound) {
		s.logAttempt(ctx, staffUserID, nil, "check_in_failed", map[string]any{"reason": "invalid_token"})
		return nil, ErrInvalidToken
	}
	if err != nil {
		return nil, err
	}

	reg, err := s.regsRepo.GetByID(ctx, registrationID)
	if err != nil {
		return nil, err
	}

	if reg.Status != registrations.StatusConfirmed {
		s.logAttempt(ctx, staffUserID, &registrationID, "check_in_failed",
			map[string]any{"reason": "not_confirmed", "status": reg.Status})
		return nil, ErrNotConfirmed
	}

	checkIn, err := s.repo.Create(ctx, registrationID, staffUserID)
	if errors.Is(err, ErrAlreadyCheckedIn) {
		s.logAttempt(ctx, staffUserID, &registrationID, "check_in_failed",
			map[string]any{"reason": "already_checked_in"})
		return nil, ErrAlreadyCheckedIn
	}
	if err != nil {
		return nil, err
	}

	s.logAttempt(ctx, staffUserID, &registrationID, "check_in_succeeded", nil)

	return &Result{Registration: *reg, CheckIn: *checkIn}, nil
}

func (s *Service) logAttempt(ctx context.Context, staffUserID uuid.UUID, registrationID *uuid.UUID, action string, metadata map[string]any) {
	if s.audit == nil {
		return
	}
	s.audit.Record(ctx, &staffUserID, action, "registration", registrationID, metadata)
}
