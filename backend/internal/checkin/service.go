package checkin

import (
	"context"
	"errors"
	"net/url"
	"strings"

	"github.com/google/uuid"

	"github.com/unity-run-club/api/internal/auditlog"
	"github.com/unity-run-club/api/internal/registrations"
	"github.com/unity-run-club/api/internal/tokenhash"
)

var ErrInvalidToken = errors.New("checkin: invalid or unknown ticket token")

var ErrNotConfirmed = errors.New("checkin: registration is not confirmed")

var ErrWrongEvent = errors.New("checkin: registration belongs to another event")

// checkinRepository is the subset of Repository this service depends on
type checkinRepository interface {
	Create(ctx context.Context, registrationID, staffUserID uuid.UUID) (*CheckIn, error)
}

// registrationsReader is the read-only slice of the registrations
// domain this service needs. checkin depends on registrations, never the other way — same one-directional pattern registrations uses for events
type registrationsReader interface {
	GetRegistrationIDByTicketTokenHash(ctx context.Context, tokenHash string) (uuid.UUID, error)
	GetByRegistrationNumber(ctx context.Context, number string) (*registrations.Registration, error)
	GetByID(ctx context.Context, id uuid.UUID) (*registrations.Registration, error)
}

// Service implements check-in business rules
type Service struct {
	repo     checkinRepository
	regsRepo registrationsReader
	audit    *auditlog.Service
}

// NewService builds a Service
func NewService(repo checkinRepository, regsRepo registrationsReader, audit *auditlog.Service) *Service {
	return &Service{repo: repo, regsRepo: regsRepo, audit: audit}
}

// Result bundles a successful check-in with the registration it belongs to
type Result struct {
	Registration registrations.Registration
	CheckIn      CheckIn
}

// CheckIn validates a scanned raw QR token (or a typed registration number like URC-2026-000042) and records a check-in, attributed to staffUserID. Every outcome (success or the reason for failure) is written to the audit log
func (s *Service) CheckIn(ctx context.Context, staffUserID uuid.UUID, eventID *uuid.UUID, rawToken string) (*Result, error) {
	code := normalizeTicketCode(rawToken)
	registrationID, err := s.regsRepo.GetRegistrationIDByTicketTokenHash(ctx, tokenhash.Hash(code))
	if errors.Is(err, registrations.ErrNotFound) {
		// Fallback: treat the input as a URC-YYYY-NNNNNN registration number so manual entry works when no scanner is available
		reg, regErr := s.regsRepo.GetByRegistrationNumber(ctx, strings.ToUpper(code))
		if regErr != nil {
			s.logAttempt(ctx, staffUserID, nil, "check_in_failed", map[string]any{"reason": "invalid_token"})
			return nil, ErrInvalidToken
		}
		registrationID = reg.ID
		err = nil
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
	if eventID != nil && reg.EventID != *eventID {
		s.logAttempt(ctx, staffUserID, &registrationID, "check_in_failed",
			map[string]any{"reason": "wrong_event", "expected_event_id": eventID.String(), "actual_event_id": reg.EventID.String()})
		return nil, ErrWrongEvent
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

// normalizeTicketCode accepts the plain registration number used by the web wallet, legacy opaque ticket tokens, and URL/URC wrappers produced by other wallet apps. Keeping this tolerant makes camera and USB scanners easier to use without weakening authorization: the check-in endpoint remains STAFF+
func normalizeTicketCode(raw string) string {
	code := strings.TrimSpace(raw)
	if parsed, err := url.Parse(code); err == nil {
		if queryCode := parsed.Query().Get("code"); queryCode != "" {
			code = queryCode
		} else if parsed.Scheme != "" && parsed.Path != "" {
			parts := strings.Split(strings.Trim(parsed.Path, "/"), "/")
			code = parts[len(parts)-1]
		} else if strings.EqualFold(parsed.Scheme, "urc") && parsed.Host != "" {
			code = parsed.Host
		}
	}
	code = strings.TrimSpace(code)
	if strings.HasPrefix(strings.ToUpper(code), "URC:") {
		code = strings.TrimSpace(code[4:])
	}
	return code
}

func (s *Service) logAttempt(ctx context.Context, staffUserID uuid.UUID, registrationID *uuid.UUID, action string, metadata map[string]any) {
	if s.audit == nil {
		return
	}
	s.audit.Record(ctx, &staffUserID, action, "registration", registrationID, metadata)
}
