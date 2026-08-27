package registrations

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/unity-run-club/api/internal/auth"
	"github.com/unity-run-club/api/internal/events"
	"github.com/unity-run-club/api/internal/payments"
	"github.com/unity-run-club/api/internal/tokenhash"
)

const (
	defaultListLimit = 20
	maxListLimit     = 1000
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

// ErrCannotCancelCheckedIn preserves completed participation and prevents a
// race-day check-in from freeing a category slot after attendance.
var ErrCannotCancelCheckedIn = errors.New("registrations: checked-in registration cannot be cancelled")

var (
	ErrPaymentUnavailable = errors.New("registrations: payment is unavailable")
	ErrPaymentMismatch    = errors.New("registrations: settled payment does not match the registration")
	ErrPaymentExpired     = errors.New("registrations: payment has expired")
)

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
	GetByRegistrationNumber(ctx context.Context, number string) (*Registration, error)
	HasCheckIn(ctx context.Context, registrationID uuid.UUID) (bool, error)
}

// eventsReader is the read-only slice of the events domain this
// service needs, to validate an event/category before registering.
// registrations depends on events, never the other way around.
type eventsReader interface {
	GetByID(ctx context.Context, id uuid.UUID) (*events.Event, error)
	GetCategoryByID(ctx context.Context, id uuid.UUID) (*events.EventCategory, error)
}

// RegistrationNotifier is implemented by internal/notifications
// (wired in from main.go) to send registration-related emails. The
// interface lives here, in the consumer package, so registrations
// never imports notifications — same pattern as auditlog in
// checkin/service.go. Nil-safe: a Service built without a notifier
// (e.g. in unit tests) simply doesn't send anything.
type RegistrationNotifier interface {
	NotifyRegistrationConfirmed(ctx context.Context, reg Registration)
	NotifyPaymentConfirmed(ctx context.Context, reg Registration, amountCents int)
	NotifyRegistrationCancelled(ctx context.Context, reg Registration)
}

// Service implements registration business rules.
type Service struct {
	repo       regRepository
	eventsRepo eventsReader
	provider   payments.Provider
	notifier   RegistrationNotifier

	// locker, availCache, and rateLimiter are optional (nil-safe) —
	// unit tests can omit them to exercise the service without Redis;
	// production wiring always supplies them.
	locker      *Locker
	availCache  *AvailabilityCache
	rateLimiter *RateLimiter

	now func() time.Time
}

// NewService builds a Service. notifier may be nil (no emails sent —
// used by unit tests).
func NewService(repo regRepository, eventsRepo eventsReader, provider payments.Provider,
	locker *Locker, availCache *AvailabilityCache, rateLimiter *RateLimiter, notifier RegistrationNotifier) *Service {
	return &Service{
		repo:        repo,
		eventsRepo:  eventsRepo,
		provider:    provider,
		notifier:    notifier,
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
	TicketToken  string           // raw token, empty if not yet confirmed
	Payment      *PaymentCheckout `json:"payment,omitempty"`
}

type PaymentCheckout struct {
	RegistrationID string     `json:"registration_id"`
	Provider       string     `json:"provider"`
	Status         string     `json:"status"`
	AmountCents    int        `json:"amount_cents"`
	Currency       string     `json:"currency"`
	QRString       string     `json:"qr_string,omitempty"`
	DeepLink       string     `json:"deep_link,omitempty"`
	ExpiresAt      *time.Time `json:"expires_at,omitempty"`
}

type paymentRepository interface {
	GetPaymentForRegistration(context.Context, uuid.UUID) (*Payment, error)
	ConfirmStoredPayment(context.Context, uuid.UUID, uuid.UUID, string) (*Registration, bool, error)
}

type expiringPaymentRepository interface {
	ExpirePendingPayments(context.Context, time.Time) ([]uuid.UUID, error)
}

func (s *Service) expirePendingPayments(ctx context.Context) error {
	repo, ok := s.repo.(expiringPaymentRepository)
	if !ok {
		return nil
	}
	categories, err := repo.ExpirePendingPayments(ctx, s.now())
	if err != nil {
		return err
	}
	if s.availCache != nil {
		for _, categoryID := range categories {
			_ = s.availCache.Invalidate(ctx, categoryID)
		}
	}
	return nil
}

// Register validates the event/category, enforces the
// one-active-registration-per-event rule and category capacity, and
// creates the registration — confirming immediately for free
// categories, or reserving a PENDING slot and running it through the
// payment provider for paid ones.
func (s *Service) Register(ctx context.Context, userID, eventID uuid.UUID, req RegisterRequest) (*RegisterResult, error) {
	if err := s.expirePendingPayments(ctx); err != nil {
		return nil, err
	}
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
		if errors.Is(err, ErrLockNotAcquired) {
			return nil, err
		}
		if err == nil {
			defer lock.Release(ctx)
		}
		// Any Redis outage fails open. PostgreSQL's category row lock is
		// still the authoritative capacity and duplicate-registration guard.
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

	if s.notifier != nil {
		s.notifier.NotifyRegistrationConfirmed(ctx, res.Registration)
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
		var checkoutJSON string
		var checkout *PaymentCheckout
		if payment.Checkout != nil {
			raw, marshalErr := json.Marshal(payment.Checkout)
			if marshalErr != nil {
				return nil, fmt.Errorf("registrations: encode payment checkout: %w", marshalErr)
			}
			checkoutJSON = string(raw)
			checkout = &PaymentCheckout{RegistrationID: reg.ID.String(), Provider: s.provider.Name(), Status: string(payment.Status), AmountCents: priceCents, Currency: "USD", QRString: payment.Checkout.QRString, DeepLink: payment.Checkout.DeepLink, ExpiresAt: &payment.Checkout.ExpiresAt}
		}
		dbPayment := &Payment{
			RegistrationID: reg.ID, Provider: s.provider.Name(), ProviderReference: payment.ProviderReference,
			AmountCents: priceCents, Currency: "USD", Status: string(payment.Status), CheckoutPayload: checkoutJSON,
		}
		if payment.Checkout != nil {
			dbPayment.ExpiresAt = &payment.Checkout.ExpiresAt
		}
		if err := s.repo.CreatePayment(ctx, dbPayment); err != nil {
			return nil, err
		}
		return &RegisterResult{Registration: reg, Payment: checkout}, nil
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

	if s.notifier != nil {
		s.notifier.NotifyRegistrationConfirmed(ctx, confirmed.Registration)
		s.notifier.NotifyPaymentConfirmed(ctx, confirmed.Registration, priceCents)
	}

	return &RegisterResult{Registration: confirmed.Registration, TicketToken: rawToken}, nil
}

// GetPayment returns persisted provider instructions so a runner can resume a
// pending checkout after navigating away or refreshing the page.
func (s *Service) GetPayment(ctx context.Context, callerID uuid.UUID, callerRole auth.Role, registrationID uuid.UUID) (*PaymentCheckout, error) {
	reg, err := s.GetByID(ctx, callerID, callerRole, registrationID)
	if err != nil {
		return nil, err
	}
	pr, ok := s.repo.(paymentRepository)
	if !ok {
		return nil, ErrPaymentUnavailable
	}
	p, err := pr.GetPaymentForRegistration(ctx, registrationID)
	if err != nil {
		return nil, err
	}
	checkout := &payments.Checkout{}
	if p.CheckoutPayload != "" {
		if err := json.Unmarshal([]byte(p.CheckoutPayload), checkout); err != nil {
			return nil, fmt.Errorf("registrations: decode payment checkout: %w", err)
		}
	}
	view := &PaymentCheckout{RegistrationID: reg.ID.String(), Provider: p.Provider, Status: p.Status, AmountCents: p.AmountCents, Currency: p.Currency, QRString: checkout.QRString, DeepLink: checkout.DeepLink, ExpiresAt: p.ExpiresAt}
	return view, nil
}

// VerifyPayment polls Bakong from the server. Browser-supplied status is never
// accepted; the settled receiver, amount, and currency must match our record.
func (s *Service) VerifyPayment(ctx context.Context, callerID uuid.UUID, callerRole auth.Role, registrationID uuid.UUID) (*RegisterResult, error) {
	reg, err := s.GetByID(ctx, callerID, callerRole, registrationID)
	if err != nil {
		return nil, err
	}
	checkout, err := s.GetPayment(ctx, callerID, callerRole, registrationID)
	if err != nil {
		return nil, err
	}
	if reg.Status == StatusConfirmed {
		return &RegisterResult{Registration: *reg, Payment: checkout}, nil
	}
	if reg.Status != StatusPending {
		return nil, ErrPaymentUnavailable
	}
	pr := s.repo.(paymentRepository)
	stored, err := pr.GetPaymentForRegistration(ctx, registrationID)
	if err != nil {
		return nil, err
	}
	if stored.ExpiresAt != nil && s.now().After(*stored.ExpiresAt) {
		_ = s.expirePendingPayments(ctx)
		return nil, ErrPaymentExpired
	}
	if stored.Provider != s.provider.Name() {
		return nil, ErrPaymentUnavailable
	}
	providerPayment, err := s.provider.GetPaymentStatus(ctx, stored.ProviderReference)
	if err != nil {
		return nil, err
	}
	checkout.Status = string(providerPayment.Status)
	if providerPayment.Status == payments.StatusPending {
		return &RegisterResult{Registration: *reg, Payment: checkout}, nil
	}
	if providerPayment.Status != payments.StatusSucceeded || providerPayment.Verification == nil {
		return nil, ErrPaymentUnavailable
	}
	verified := providerPayment.Verification
	if verified.AmountCents != stored.AmountCents || !strings.EqualFold(verified.Currency, stored.Currency) {
		return nil, ErrPaymentMismatch
	}
	_, tokenHash, err := generateTicketToken()
	if err != nil {
		return nil, err
	}
	confirmed, newlyConfirmed, err := pr.ConfirmStoredPayment(ctx, registrationID, stored.ID, tokenHash)
	if err != nil {
		return nil, err
	}
	checkout.Status = string(payments.StatusSucceeded)
	if s.availCache != nil {
		_ = s.availCache.Invalidate(ctx, confirmed.EventCategoryID)
	}
	if newlyConfirmed && s.notifier != nil {
		s.notifier.NotifyRegistrationConfirmed(ctx, *confirmed)
		s.notifier.NotifyPaymentConfirmed(ctx, *confirmed, stored.AmountCents)
	}
	return &RegisterResult{Registration: *confirmed, Payment: checkout}, nil
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
	if err := s.expirePendingPayments(ctx); err != nil {
		return nil, err
	}
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

// ErrNotConfirmed is returned when a ticket is requested for a
// registration that isn't CONFIRMED yet (no ticket exists).
var ErrNotConfirmed = errors.New("registrations: registration is not confirmed")

// IssueTicketToken returns the stable, human-readable check-in code for a
// confirmed registration owned by the caller (or any registration for
// STAFF+). The legacy endpoint name is retained for client compatibility.
// A stable code means screenshots and multiple devices do not invalidate one
// another; STAFF+ authorization and the unique check-in row enforce safety.
func (s *Service) IssueTicketToken(ctx context.Context, callerID uuid.UUID, callerRole auth.Role, id uuid.UUID) (string, error) {
	reg, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return "", err
	}
	if reg.UserID != callerID && !callerRole.AtLeast(auth.RoleStaff) {
		return "", ErrForbidden
	}
	if reg.Status != StatusConfirmed {
		return "", ErrNotConfirmed
	}

	return reg.RegistrationNumber, nil
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
	checkedIn, err := s.repo.HasCheckIn(ctx, id)
	if err != nil {
		return err
	}
	if checkedIn {
		return ErrCannotCancelCheckedIn
	}

	if err := s.repo.Cancel(ctx, id); err != nil {
		return err
	}

	if s.availCache != nil {
		_ = s.availCache.Invalidate(ctx, reg.EventCategoryID)
	}
	if s.notifier != nil {
		s.notifier.NotifyRegistrationCancelled(ctx, *reg)
	}
	return nil
}

// GetAvailability returns the capacity snapshot for a category,
// serving from cache when possible.
func (s *Service) GetAvailability(ctx context.Context, eventID, categoryID uuid.UUID) (*Availability, error) {
	if err := s.expirePendingPayments(ctx); err != nil {
		return nil, err
	}
	category, err := s.eventsRepo.GetCategoryByID(ctx, categoryID)
	if err != nil {
		return nil, err
	}
	if category.EventID != eventID {
		return nil, events.ErrNotFound
	}

	if s.availCache != nil {
		if cached, err := s.availCache.Get(ctx, categoryID); err == nil && cached != nil {
			return cached, nil
		}
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
