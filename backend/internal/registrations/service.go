package registrations

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/unity-run-club/api/internal/auth"
	"github.com/unity-run-club/api/internal/events"
	"github.com/unity-run-club/api/internal/payments"
	"github.com/unity-run-club/api/internal/tokenhash"
)

const (
	defaultListLimit = 20
	maxListLimit     = 100
)

// ErrInvalidCategory is returned when the given category doesn't
// exist or doesn't belong to the given event.
var ErrInvalidCategory = errors.New("registrations: invalid category for this event")

// ErrRegistrationClosed is returned when the event/category isn't
// currently accepting registrations.
var ErrRegistrationClosed = errors.New("registrations: registration is not open")

// ErrForbidden is returned when a caller tries to view/cancel a
// registration they don't own and isn't STAFF+.
var ErrForbidden = errors.New("registrations: forbidden")

// ErrAlreadyCancelled is returned when cancelling a registration
// that's already cancelled or refunded.
var ErrAlreadyCancelled = errors.New("registrations: already cancelled")

// regRepository is the subset of Repository the service depends on.
// Defined here (consumer side) so tests can supply a fake.
type regRepository interface {
	HasActiveRegistration(ctx context.Context, userID, eventID uuid.UUID) (bool, error)
	Create(ctx context.Context, p CreateParams) (*CreateResult, error)
	ConfirmWithPayment(ctx context.Context, registrationID uuid.UUID, payment *Payment, ticketTokenHash string) (*CreateResult, error)
	CreatePayment(ctx context.Context, p *Payment) error
	GetByID(ctx context.Context, id uuid.UUID) (*Registration, error)
	ListForUser(ctx context.Context, userID uuid.UUID) ([]Registration, error)
	ListAll(ctx context.Context, filter AdminListFilter) ([]Registration, int, error)
	Cancel(ctx context.Context, id uuid.UUID) error
	CountActive(ctx context.Context, categoryID uuid.UUID) (int, error)
	GetRegistrationIDByTicketTokenHash(ctx context.Context, tokenHash string) (uuid.UUID, error)
}

// eventsReader is the read-only slice of the events domain this
// service needs, to validate an event/category before registering.
// registrations depends on events, never the other way around.
type eventsReader interface {
	GetByID(ctx context.Context, id uuid.UUID) (*events.Event, error)
	GetCategoryByID(ctx context.Context, id uuid.UUID) (*events.EventCategory, error)
}

// Service implements registration business rules.
type Service struct {
	repo       regRepository
	eventsRepo eventsReader
	provider   payments.Provider

	// locker, availCache, and rateLimiter are optional (nil-safe) —
	// unit tests can omit them to exercise the service without Redis;
	// production wiring always supplies them.
	locker      *Locker
	availCache  *AvailabilityCache
	rateLimiter *RateLimiter

	now func() time.Time
}

// NewService builds a Service.
func NewService(repo regRepository, eventsRepo eventsReader, provider payments.Provider,
	locker *Locker, availCache *AvailabilityCache, rateLimiter *RateLimiter) *Service {
	return &Service{
		repo:        repo,
		eventsRepo:  eventsRepo,
		provider:    provider,
		locker:      locker,
		availCache:  availCache,
		rateLimiter: rateLimiter,
		now:         time.Now,
	}
}

// RegisterResult bundles a registration with its (one-time) raw QR
// ticket token, when confirmed immediately.
type RegisterResult struct {
	Registration Registration
	TicketToken  string // raw token, empty if not yet confirmed
}

// Register validates the event/category, enforces the
// one-active-registration-per-event rule and category capacity, and
// creates the registration — confirming immediately for free
// categories, or reserving a PENDING slot and running it through the
// payment provider for paid ones.
func (s *Service) Register(ctx context.Context, userID, eventID uuid.UUID, req RegisterRequest) (*RegisterResult, error) {
	if s.rateLimiter != nil {
		allowed, err := s.rateLimiter.Allow(ctx, userID.String())
		if err != nil {
			// Fail open: log-worthy, but don't block registration on a
			// Redis hiccup.
			_ = err
		} else if !allowed {
			return nil, ErrRateLimited
		}
	}

	categoryID, err := uuid.Parse(req.EventCategoryID)
	if err != nil {
		return nil, ErrInvalidCategory
	}

	event, err := s.eventsRepo.GetByID(ctx, eventID)
	if errors.Is(err, events.ErrNotFound) {
		return nil, ErrInvalidCategory
	}
	if err != nil {
		return nil, err
	}

	category, err := s.eventsRepo.GetCategoryByID(ctx, categoryID)
	if errors.Is(err, events.ErrNotFound) {
		return nil, ErrInvalidCategory
	}
	if err != nil {
		return nil, err
	}
	if category.EventID != eventID {
		return nil, ErrInvalidCategory
	}

	if err := s.checkRegistrationOpen(event, category); err != nil {
		return nil, err
	}

	hasActive, err := s.repo.HasActiveRegistration(ctx, userID, eventID)
	if err != nil {
		return nil, err
	}
	if hasActive {
		return nil, ErrDuplicateRegistration
	}

	if s.locker != nil {
		lock, err := s.locker.TryLock(ctx, categoryID)
		if err != nil {
			return nil, err // ErrLockNotAcquired, or a Redis error (fails closed here — see lock.go)
		}
		defer lock.Release(ctx)
	}

	dob, err := time.Parse("2006-01-02", req.DateOfBirth)
	if err != nil {
		return nil, fmt.Errorf("registrations: invalid date_of_birth: %w", err)
	}
	participant := ParticipantInfo{
		FullName:              req.FullName,
		Email:                 req.Email,
		Phone:                 req.Phone,
		DateOfBirth:           &dob,
		Gender:                req.Gender,
		EmergencyContactName:  req.EmergencyContactName,
		EmergencyContactPhone: req.EmergencyContactPhone,
		TshirtSize:            req.TshirtSize,
	}

	var result *RegisterResult
	if category.PriceCents == 0 {
		result, err = s.registerFree(ctx, userID, eventID, categoryID, category.Capacity, participant)
	} else {
		result, err = s.registerPaid(ctx, userID, eventID, categoryID, category.Capacity, category.PriceCents, participant)
	}
	if err != nil {
		return nil, err
	}

	if s.availCache != nil {
		_ = s.availCache.Invalidate(ctx, categoryID)
	}

	return result, nil
}

func (s *Service) checkRegistrationOpen(event *events.Event, category *events.EventCategory) error {
	if event.Status != events.StatusRegistrationOpen {
		return ErrRegistrationClosed
	}
	now := s.now()
	if event.RegistrationOpenAt != nil && now.Before(*event.RegistrationOpenAt) {
		return ErrRegistrationClosed
	}
	if event.RegistrationCloseAt != nil && now.After(*event.RegistrationCloseAt) {
		return ErrRegistrationClosed
	}
	if category.Status != "OPEN" {
		return ErrRegistrationClosed
	}
	if category.RegistrationDeadline != nil && now.After(*category.RegistrationDeadline) {
		return ErrRegistrationClosed
	}
	return nil
}

func (s *Service) registerFree(ctx context.Context, userID, eventID, categoryID uuid.UUID, capacity int, participant ParticipantInfo) (*RegisterResult, error) {
	rawToken, tokenHash, err := generateTicketToken()
	if err != nil {
		return nil, err
	}

	res, err := s.repo.Create(ctx, CreateParams{
		UserID: userID, EventID: eventID, EventCategoryID: categoryID, Capacity: capacity,
		Participant: participant, Confirm: true, TicketTokenHash: tokenHash,
	})
	if err != nil {
		return nil, err
	}

	return &RegisterResult{Registration: res.Registration, TicketToken: rawToken}, nil
}

func (s *Service) registerPaid(ctx context.Context, userID, eventID, categoryID uuid.UUID, capacity, priceCents int, participant ParticipantInfo) (*RegisterResult, error) {
	// Reserve the slot as PENDING first — this is what makes capacity
	// safe even while payment is in flight.
	res, err := s.repo.Create(ctx, CreateParams{
		UserID: userID, EventID: eventID, EventCategoryID: categoryID, Capacity: capacity,
		Participant: participant, Confirm: false,
	})
	if err != nil {
		return nil, err
	}
	reg := res.Registration

	payment, err := s.provider.CreatePayment(ctx, reg.ID.String(), "USD", priceCents)
	if err != nil {
		return nil, fmt.Errorf("registrations: create payment: %w", err)
	}

	if payment.Status != payments.StatusSucceeded {
		_ = s.repo.CreatePayment(ctx, &Payment{
			RegistrationID: reg.ID, Provider: s.provider.Name(), ProviderReference: payment.ProviderReference,
			AmountCents: priceCents, Currency: "USD", Status: string(payment.Status),
		})
		// Registration stays PENDING — retry/payment-recovery flows are
		// a later phase; the slot remains reserved for now.
		return &RegisterResult{Registration: reg}, nil
	}

	rawToken, tokenHash, err := generateTicketToken()
	if err != nil {
		return nil, err
	}

	confirmed, err := s.repo.ConfirmWithPayment(ctx, reg.ID, &Payment{
		Provider: s.provider.Name(), ProviderReference: payment.ProviderReference,
		AmountCents: priceCents, Currency: "USD", Status: string(payments.StatusSucceeded),
	}, tokenHash)
	if err != nil {
		return nil, err
	}

	return &RegisterResult{Registration: confirmed.Registration, TicketToken: rawToken}, nil
}

// GetByID returns a registration if callerID owns it or callerRole is
// STAFF+.
func (s *Service) GetByID(ctx context.Context, callerID uuid.UUID, callerRole auth.Role, id uuid.UUID) (*Registration, error) {
	reg, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if reg.UserID != callerID && !callerRole.AtLeast(auth.RoleStaff) {
		return nil, ErrForbidden
	}
	return reg, nil
}

// ListForUser returns the caller's own registrations.
func (s *Service) ListForUser(ctx context.Context, userID uuid.UUID) ([]Registration, error) {
	return s.repo.ListForUser(ctx, userID)
}

// ListAll returns registrations across all users, for STAFF+ admin
// views. Callers (the admin handler) are responsible for the role
// check — this method trusts it's only reached by an authorized
// caller, matching the thin-handler/service pattern used elsewhere.
func (s *Service) ListAll(ctx context.Context, filter AdminListFilter) ([]Registration, int, error) {
	if filter.Limit <= 0 {
		filter.Limit = defaultListLimit
	}
	if filter.Limit > maxListLimit {
		filter.Limit = maxListLimit
	}
	if filter.Offset < 0 {
		filter.Offset = 0
	}
	return s.repo.ListAll(ctx, filter)
}

// FindRegistrationIDByTicketToken hashes rawToken and resolves it to
// a registration ID. Used by internal/checkin.
func (s *Service) FindRegistrationIDByTicketToken(ctx context.Context, rawToken string) (uuid.UUID, error) {
	return s.repo.GetRegistrationIDByTicketTokenHash(ctx, tokenhash.Hash(rawToken))
}

// Cancel cancels a registration, if callerID owns it or callerRole is
// STAFF+, freeing its capacity slot.
func (s *Service) Cancel(ctx context.Context, callerID uuid.UUID, callerRole auth.Role, id uuid.UUID) error {
	reg, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if reg.UserID != callerID && !callerRole.AtLeast(auth.RoleStaff) {
		return ErrForbidden
	}
	if !reg.Status.IsActive() {
		return ErrAlreadyCancelled
	}

	if err := s.repo.Cancel(ctx, id); err != nil {
		return err
	}

	if s.availCache != nil {
		_ = s.availCache.Invalidate(ctx, reg.EventCategoryID)
	}
	return nil
}

// GetAvailability returns the capacity snapshot for a category,
// serving from cache when possible.
func (s *Service) GetAvailability(ctx context.Context, categoryID uuid.UUID) (*Availability, error) {
	if s.availCache != nil {
		if cached, err := s.availCache.Get(ctx, categoryID); err == nil && cached != nil {
			return cached, nil
		}
	}

	category, err := s.eventsRepo.GetCategoryByID(ctx, categoryID)
	if err != nil {
		return nil, err
	}

	taken, err := s.repo.CountActive(ctx, categoryID)
	if err != nil {
		return nil, err
	}

	available := category.Capacity - taken
	if available < 0 {
		available = 0
	}
	avail := Availability{Capacity: category.Capacity, Taken: taken, Available: available}

	if s.availCache != nil {
		_ = s.availCache.Set(ctx, categoryID, avail)
	}
	return &avail, nil
}

// generateTicketToken returns a cryptographically random raw QR token
// and its hash for storage — never the raw value. Uses
// internal/tokenhash so internal/checkin verifies against the exact
// same hashing scheme.
func generateTicketToken() (raw, hash string, err error) {
	raw, err = tokenhash.GenerateRaw()
	if err != nil {
		return "", "", fmt.Errorf("registrations: generate ticket token: %w", err)
	}
	return raw, tokenhash.Hash(raw), nil
}
