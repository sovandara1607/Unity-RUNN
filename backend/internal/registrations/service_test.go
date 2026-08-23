package registrations

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/unity-run-club/api/internal/auth"
	"github.com/unity-run-club/api/internal/events"
	"github.com/unity-run-club/api/internal/payments"
)

// fakeRegRepo is an in-memory regRepository for service unit tests.
type fakeRegRepo struct {
	regs     map[uuid.UUID]*Registration
	payments []Payment
}

func newFakeRegRepo() *fakeRegRepo {
	return &fakeRegRepo{regs: map[uuid.UUID]*Registration{}}
}

func (f *fakeRegRepo) HasActiveRegistration(ctx context.Context, userID, eventID uuid.UUID) (bool, error) {
	for _, r := range f.regs {
		if r.UserID == userID && r.EventID == eventID && r.Status.IsActive() {
			return true, nil
		}
	}
	return false, nil
}

func (f *fakeRegRepo) Create(ctx context.Context, p CreateParams) (*CreateResult, error) {
	active := 0
	for _, r := range f.regs {
		if r.EventCategoryID == p.EventCategoryID && r.Status.IsActive() {
			active++
		}
	}
	if active >= p.Capacity {
		return nil, ErrCapacityFull
	}
	for _, r := range f.regs {
		if r.UserID == p.UserID && r.EventID == p.EventID && r.Status.IsActive() {
			return nil, ErrDuplicateRegistration
		}
	}

	status := StatusPending
	if p.Confirm {
		status = StatusConfirmed
	}
	reg := &Registration{
		ID: uuid.New(), RegistrationNumber: "URC-TEST-" + uuid.NewString()[:6],
		UserID: p.UserID, EventID: p.EventID, EventCategoryID: p.EventCategoryID, Status: status,
		FullName: p.Participant.FullName, Email: p.Participant.Email, Phone: p.Participant.Phone,
		DateOfBirth: p.Participant.DateOfBirth, Gender: p.Participant.Gender,
		EmergencyContactName: p.Participant.EmergencyContactName, EmergencyContactPhone: p.Participant.EmergencyContactPhone,
		TshirtSize: p.Participant.TshirtSize, CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}
	f.regs[reg.ID] = reg

	result := &CreateResult{Registration: *reg}
	if p.Confirm {
		result.Ticket = &Ticket{ID: uuid.New(), RegistrationID: reg.ID, TokenHash: p.TicketTokenHash}
	}
	return result, nil
}

func (f *fakeRegRepo) ConfirmWithPayment(ctx context.Context, registrationID uuid.UUID, payment *Payment, ticketTokenHash string) (*CreateResult, error) {
	reg, ok := f.regs[registrationID]
	if !ok {
		return nil, ErrNotFound
	}
	reg.Status = StatusConfirmed
	f.payments = append(f.payments, *payment)
	return &CreateResult{Registration: *reg, Ticket: &Ticket{ID: uuid.New(), RegistrationID: reg.ID, TokenHash: ticketTokenHash}}, nil
}

func (f *fakeRegRepo) CreatePayment(ctx context.Context, p *Payment) error {
	f.payments = append(f.payments, *p)
	return nil
}

func (f *fakeRegRepo) GetByID(ctx context.Context, id uuid.UUID) (*Registration, error) {
	r, ok := f.regs[id]
	if !ok {
		return nil, ErrNotFound
	}
	cp := *r
	return &cp, nil
}

func (f *fakeRegRepo) ListForUser(ctx context.Context, userID uuid.UUID) ([]Registration, error) {
	var out []Registration
	for _, r := range f.regs {
		if r.UserID == userID {
			out = append(out, *r)
		}
	}
	return out, nil
}

func (f *fakeRegRepo) Cancel(ctx context.Context, id uuid.UUID) error {
	r, ok := f.regs[id]
	if !ok {
		return ErrNotFound
	}
	r.Status = StatusCancelled
	return nil
}

func (f *fakeRegRepo) CountActive(ctx context.Context, categoryID uuid.UUID) (int, error) {
	count := 0
	for _, r := range f.regs {
		if r.EventCategoryID == categoryID && r.Status.IsActive() {
			count++
		}
	}
	return count, nil
}

// fakeEventsReader is an in-memory eventsReader for service unit tests.
type fakeEventsReader struct {
	eventsByID     map[uuid.UUID]*events.Event
	categoriesByID map[uuid.UUID]*events.EventCategory
}

func newFakeEventsReader() *fakeEventsReader {
	return &fakeEventsReader{eventsByID: map[uuid.UUID]*events.Event{}, categoriesByID: map[uuid.UUID]*events.EventCategory{}}
}

func (f *fakeEventsReader) GetByID(ctx context.Context, id uuid.UUID) (*events.Event, error) {
	e, ok := f.eventsByID[id]
	if !ok {
		return nil, events.ErrNotFound
	}
	return e, nil
}

func (f *fakeEventsReader) GetCategoryByID(ctx context.Context, id uuid.UUID) (*events.EventCategory, error) {
	c, ok := f.categoriesByID[id]
	if !ok {
		return nil, events.ErrNotFound
	}
	return c, nil
}

// fakePaymentProvider lets tests control payment outcomes.
type fakePaymentProvider struct {
	status payments.Status
	err    error
}

func (f *fakePaymentProvider) Name() string { return "fake" }
func (f *fakePaymentProvider) CreatePayment(ctx context.Context, registrationID, currency string, amountCents int) (payments.Payment, error) {
	if f.err != nil {
		return payments.Payment{}, f.err
	}
	return payments.Payment{ProviderReference: "fake_ref", Status: f.status}, nil
}
func (f *fakePaymentProvider) GetPaymentStatus(ctx context.Context, ref string) (payments.Status, error) {
	return f.status, nil
}
func (f *fakePaymentProvider) HandleWebhook(ctx context.Context, payload []byte, sig string) (payments.WebhookEvent, error) {
	return payments.WebhookEvent{}, nil
}
func (f *fakePaymentProvider) RefundPayment(ctx context.Context, ref string, amountCents int) error {
	return nil
}

func newTestSetup(provider *fakePaymentProvider) (*Service, *fakeRegRepo, *fakeEventsReader) {
	repo := newFakeRegRepo()
	er := newFakeEventsReader()
	svc := NewService(repo, er, provider, nil, nil, nil) // no Redis in unit tests
	return svc, repo, er
}

func seedEventAndCategory(er *fakeEventsReader, priceCents, capacity int) (uuid.UUID, uuid.UUID) {
	eventID := uuid.New()
	categoryID := uuid.New()
	er.eventsByID[eventID] = &events.Event{ID: eventID, Status: events.StatusRegistrationOpen}
	er.categoriesByID[categoryID] = &events.EventCategory{
		ID: categoryID, EventID: eventID, PriceCents: priceCents, Capacity: capacity, Status: "OPEN",
	}
	return eventID, categoryID
}

func validRegisterReq(categoryID uuid.UUID) RegisterRequest {
	return RegisterRequest{
		EventCategoryID: categoryID.String(), FullName: "Test Runner", Email: "runner@unityrunclub.com",
		Phone: "012345678", DateOfBirth: "1995-01-01", Gender: "female",
		EmergencyContactName: "Emergency Contact", EmergencyContactPhone: "098765432", TshirtSize: "M",
	}
}

func TestService_Register_FreeCategoryConfirmsImmediately(t *testing.T) {
	svc, _, er := newTestSetup(&fakePaymentProvider{status: payments.StatusSucceeded})
	eventID, categoryID := seedEventAndCategory(er, 0, 10)

	result, err := svc.Register(context.Background(), uuid.New(), eventID, validRegisterReq(categoryID))
	if err != nil {
		t.Fatalf("Register() error = %v", err)
	}
	if result.Registration.Status != StatusConfirmed {
		t.Errorf("Status = %q, want %q", result.Registration.Status, StatusConfirmed)
	}
	if result.TicketToken == "" {
		t.Error("expected a non-empty ticket token")
	}
}

func TestService_Register_PaidCategoryConfirmsAfterPayment(t *testing.T) {
	svc, _, er := newTestSetup(&fakePaymentProvider{status: payments.StatusSucceeded})
	eventID, categoryID := seedEventAndCategory(er, 5000, 10)

	result, err := svc.Register(context.Background(), uuid.New(), eventID, validRegisterReq(categoryID))
	if err != nil {
		t.Fatalf("Register() error = %v", err)
	}
	if result.Registration.Status != StatusConfirmed {
		t.Errorf("Status = %q, want %q", result.Registration.Status, StatusConfirmed)
	}
	if result.TicketToken == "" {
		t.Error("expected a non-empty ticket token")
	}
}

func TestService_Register_PaidCategoryStaysPendingOnPaymentFailure(t *testing.T) {
	svc, _, er := newTestSetup(&fakePaymentProvider{status: payments.StatusFailed})
	eventID, categoryID := seedEventAndCategory(er, 5000, 10)

	result, err := svc.Register(context.Background(), uuid.New(), eventID, validRegisterReq(categoryID))
	if err != nil {
		t.Fatalf("Register() error = %v", err)
	}
	if result.Registration.Status != StatusPending {
		t.Errorf("Status = %q, want %q", result.Registration.Status, StatusPending)
	}
	if result.TicketToken != "" {
		t.Error("expected no ticket token when payment fails")
	}
}

func TestService_Register_DuplicateRejected(t *testing.T) {
	svc, _, er := newTestSetup(&fakePaymentProvider{status: payments.StatusSucceeded})
	eventID, categoryID := seedEventAndCategory(er, 0, 10)
	userID := uuid.New()

	if _, err := svc.Register(context.Background(), userID, eventID, validRegisterReq(categoryID)); err != nil {
		t.Fatalf("first Register() error = %v", err)
	}

	_, err := svc.Register(context.Background(), userID, eventID, validRegisterReq(categoryID))
	if !errors.Is(err, ErrDuplicateRegistration) {
		t.Fatalf("second Register() error = %v, want ErrDuplicateRegistration", err)
	}
}

func TestService_Register_CapacityFullRejected(t *testing.T) {
	svc, _, er := newTestSetup(&fakePaymentProvider{status: payments.StatusSucceeded})
	eventID, categoryID := seedEventAndCategory(er, 0, 1)

	if _, err := svc.Register(context.Background(), uuid.New(), eventID, validRegisterReq(categoryID)); err != nil {
		t.Fatalf("first Register() error = %v", err)
	}

	_, err := svc.Register(context.Background(), uuid.New(), eventID, validRegisterReq(categoryID))
	if !errors.Is(err, ErrCapacityFull) {
		t.Fatalf("second Register() error = %v, want ErrCapacityFull", err)
	}
}

func TestService_Register_InvalidCategoryForEvent(t *testing.T) {
	svc, _, er := newTestSetup(&fakePaymentProvider{status: payments.StatusSucceeded})
	eventID, _ := seedEventAndCategory(er, 0, 10)
	_, otherCategoryID := seedEventAndCategory(er, 0, 10) // belongs to a different event

	_, err := svc.Register(context.Background(), uuid.New(), eventID, validRegisterReq(otherCategoryID))
	if !errors.Is(err, ErrInvalidCategory) {
		t.Fatalf("Register() error = %v, want ErrInvalidCategory", err)
	}
}

func TestService_Register_ClosedEventRejected(t *testing.T) {
	svc, _, er := newTestSetup(&fakePaymentProvider{status: payments.StatusSucceeded})
	eventID, categoryID := seedEventAndCategory(er, 0, 10)
	er.eventsByID[eventID].Status = events.StatusPublished // not REGISTRATION_OPEN

	_, err := svc.Register(context.Background(), uuid.New(), eventID, validRegisterReq(categoryID))
	if !errors.Is(err, ErrRegistrationClosed) {
		t.Fatalf("Register() error = %v, want ErrRegistrationClosed", err)
	}
}

func TestService_Register_ClosedCategoryRejected(t *testing.T) {
	svc, _, er := newTestSetup(&fakePaymentProvider{status: payments.StatusSucceeded})
	eventID, categoryID := seedEventAndCategory(er, 0, 10)
	er.categoriesByID[categoryID].Status = "CLOSED"

	_, err := svc.Register(context.Background(), uuid.New(), eventID, validRegisterReq(categoryID))
	if !errors.Is(err, ErrRegistrationClosed) {
		t.Fatalf("Register() error = %v, want ErrRegistrationClosed", err)
	}
}

func TestService_Cancel_FreesCapacityForReRegistration(t *testing.T) {
	svc, _, er := newTestSetup(&fakePaymentProvider{status: payments.StatusSucceeded})
	eventID, categoryID := seedEventAndCategory(er, 0, 1)
	userID := uuid.New()

	result, err := svc.Register(context.Background(), userID, eventID, validRegisterReq(categoryID))
	if err != nil {
		t.Fatalf("Register() error = %v", err)
	}

	if err := svc.Cancel(context.Background(), userID, auth.RoleUser, result.Registration.ID); err != nil {
		t.Fatalf("Cancel() error = %v", err)
	}

	// Re-registering the same user should now succeed (capacity freed,
	// duplicate check passes since the prior registration is cancelled).
	if _, err := svc.Register(context.Background(), userID, eventID, validRegisterReq(categoryID)); err != nil {
		t.Fatalf("re-Register() after cancel error = %v", err)
	}
}

func TestService_Cancel_AlreadyCancelledRejected(t *testing.T) {
	svc, _, er := newTestSetup(&fakePaymentProvider{status: payments.StatusSucceeded})
	eventID, categoryID := seedEventAndCategory(er, 0, 10)
	userID := uuid.New()

	result, err := svc.Register(context.Background(), userID, eventID, validRegisterReq(categoryID))
	if err != nil {
		t.Fatalf("Register() error = %v", err)
	}
	if err := svc.Cancel(context.Background(), userID, auth.RoleUser, result.Registration.ID); err != nil {
		t.Fatalf("Cancel() error = %v", err)
	}

	err = svc.Cancel(context.Background(), userID, auth.RoleUser, result.Registration.ID)
	if !errors.Is(err, ErrAlreadyCancelled) {
		t.Fatalf("second Cancel() error = %v, want ErrAlreadyCancelled", err)
	}
}

func TestService_Cancel_ForbiddenForNonOwnerNonStaff(t *testing.T) {
	svc, _, er := newTestSetup(&fakePaymentProvider{status: payments.StatusSucceeded})
	eventID, categoryID := seedEventAndCategory(er, 0, 10)
	owner := uuid.New()

	result, err := svc.Register(context.Background(), owner, eventID, validRegisterReq(categoryID))
	if err != nil {
		t.Fatalf("Register() error = %v", err)
	}

	err = svc.Cancel(context.Background(), uuid.New(), auth.RoleUser, result.Registration.ID)
	if !errors.Is(err, ErrForbidden) {
		t.Fatalf("Cancel() by non-owner error = %v, want ErrForbidden", err)
	}
}

func TestService_GetByID_StaffCanViewAnyRegistration(t *testing.T) {
	svc, _, er := newTestSetup(&fakePaymentProvider{status: payments.StatusSucceeded})
	eventID, categoryID := seedEventAndCategory(er, 0, 10)
	owner := uuid.New()

	result, err := svc.Register(context.Background(), owner, eventID, validRegisterReq(categoryID))
	if err != nil {
		t.Fatalf("Register() error = %v", err)
	}

	if _, err := svc.GetByID(context.Background(), uuid.New(), auth.RoleStaff, result.Registration.ID); err != nil {
		t.Fatalf("GetByID() by staff error = %v", err)
	}
}
