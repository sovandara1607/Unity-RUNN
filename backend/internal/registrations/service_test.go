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
	regs             map[uuid.UUID]*Registration
	payments         []Payment
	createPaymentErr error
	ticketHashes     map[string]uuid.UUID
	checkedIn        map[uuid.UUID]bool
}

func newFakeRegRepo() *fakeRegRepo {
	return &fakeRegRepo{regs: map[uuid.UUID]*Registration{}, ticketHashes: map[string]uuid.UUID{}, checkedIn: map[uuid.UUID]bool{}}
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
		f.ticketHashes[p.TicketTokenHash] = reg.ID
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
	f.ticketHashes[ticketTokenHash] = reg.ID
	return &CreateResult{Registration: *reg, Ticket: &Ticket{ID: uuid.New(), RegistrationID: reg.ID, TokenHash: ticketTokenHash}}, nil
}

func (f *fakeRegRepo) GetRegistrationIDByTicketTokenHash(ctx context.Context, tokenHash string) (uuid.UUID, error) {
	id, ok := f.ticketHashes[tokenHash]
	if !ok {
		return uuid.Nil, ErrNotFound
	}
	return id, nil
}

func (f *fakeRegRepo) GetByRegistrationNumber(ctx context.Context, number string) (*Registration, error) {
	for _, r := range f.regs {
		if r.RegistrationNumber == number {
			return r, nil
		}
	}
	return nil, ErrNotFound
}

func (f *fakeRegRepo) RotateTicketToken(ctx context.Context, registrationID uuid.UUID, tokenHash string) error {
	if _, ok := f.regs[registrationID]; !ok {
		return ErrNotFound
	}
	f.ticketHashes[tokenHash] = registrationID
	return nil
}

func (f *fakeRegRepo) HasCheckIn(ctx context.Context, registrationID uuid.UUID) (bool, error) {
	return f.checkedIn[registrationID], nil
}

func (f *fakeRegRepo) ListAll(ctx context.Context, filter AdminListFilter) ([]Registration, int, error) {
	var out []Registration
	for _, r := range f.regs {
		if filter.EventID != nil && r.EventID != *filter.EventID {
			continue
		}
		if filter.Status != nil && r.Status != *filter.Status {
			continue
		}
		out = append(out, *r)
	}
	return out, len(out), nil
}

func (f *fakeRegRepo) CreatePayment(ctx context.Context, p *Payment) error {
	if f.createPaymentErr != nil {
		return f.createPaymentErr
	}
	if p.ID == uuid.Nil {
		p.ID = uuid.New()
	}
	p.CreatedAt, p.UpdatedAt = time.Now(), time.Now()
	f.payments = append(f.payments, *p)
	return nil
}

func (f *fakeRegRepo) GetPaymentForRegistration(ctx context.Context, registrationID uuid.UUID) (*Payment, error) {
	for i := range f.payments {
		if f.payments[i].RegistrationID == registrationID {
			return &f.payments[i], nil
		}
	}
	return nil, ErrNotFound
}

func (f *fakeRegRepo) ConfirmStoredPayment(ctx context.Context, registrationID, paymentID uuid.UUID, ticketTokenHash string) (*Registration, bool, error) {
	reg, ok := f.regs[registrationID]
	if !ok {
		return nil, false, ErrNotFound
	}
	newlyConfirmed := reg.Status == StatusPending
	reg.Status = StatusConfirmed
	for i := range f.payments {
		if f.payments[i].ID == paymentID {
			f.payments[i].Status = string(payments.StatusSucceeded)
		}
	}
	f.ticketHashes[ticketTokenHash] = registrationID
	return reg, newlyConfirmed, nil
}

func (f *fakeRegRepo) ClaimPendingPayments(ctx context.Context, workerID string, now time.Time, lease time.Duration, limit int) ([]Payment, error) {
	var claimed []Payment
	for i := range f.payments {
		p := &f.payments[i]
		if p.Status != string(payments.StatusPending) || len(claimed) >= limit {
			continue
		}
		p.ReconcileWorkerID = workerID
		until := now.Add(lease)
		p.ReconcileLeaseUntil = &until
		claimed = append(claimed, *p)
	}
	return claimed, nil
}

func (f *fakeRegRepo) SchedulePaymentReconciliation(ctx context.Context, paymentID uuid.UUID, workerID string, next time.Time, message string) error {
	for i := range f.payments {
		if f.payments[i].ID == paymentID {
			f.payments[i].ReconcileAfter = next
			f.payments[i].ReconcileAttempts++
			f.payments[i].ReconcileError = message
			f.payments[i].ReconcileWorkerID = ""
			f.payments[i].ReconcileLeaseUntil = nil
		}
	}
	return nil
}

func (f *fakeRegRepo) ExpireClaimedPayment(ctx context.Context, registrationID, paymentID uuid.UUID, workerID string) (uuid.UUID, bool, error) {
	reg, ok := f.regs[registrationID]
	if !ok {
		return uuid.Nil, false, ErrNotFound
	}
	wasPending := reg.Status == StatusPending
	if wasPending {
		reg.Status = StatusCancelled
	}
	for i := range f.payments {
		if f.payments[i].ID == paymentID {
			f.payments[i].Status = string(payments.StatusFailed)
		}
	}
	return reg.EventCategoryID, wasPending, nil
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
	status       payments.Status
	err          error
	currency     string
	verification *payments.Verification
}

func (f *fakePaymentProvider) Name() string { return "fake" }
func (f *fakePaymentProvider) CreatePayment(ctx context.Context, registrationID, currency string, amountCents int) (payments.Payment, error) {
	f.currency = currency
	if f.err != nil {
		return payments.Payment{}, f.err
	}
	return payments.Payment{ProviderReference: "fake_ref", Status: f.status}, nil
}
func (f *fakePaymentProvider) GetPaymentStatus(ctx context.Context, ref string) (payments.Payment, error) {
	if f.err != nil {
		return payments.Payment{}, f.err
	}
	return payments.Payment{ProviderReference: ref, Status: f.status, Verification: f.verification}, nil
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
	svc := NewService(repo, er, provider, nil, nil, nil, nil) // no Redis/notifier in unit tests
	return svc, repo, er
}

type fakeRegistrationNotifier struct {
	confirmed []Registration
	paid      []Registration
	cancelled []Registration
}

func (f *fakeRegistrationNotifier) NotifyRegistrationConfirmed(ctx context.Context, reg Registration) {
	f.confirmed = append(f.confirmed, reg)
}

func (f *fakeRegistrationNotifier) NotifyPaymentConfirmed(ctx context.Context, reg Registration, amountCents int) {
	f.paid = append(f.paid, reg)
}

func (f *fakeRegistrationNotifier) NotifyRegistrationCancelled(ctx context.Context, reg Registration) {
	f.cancelled = append(f.cancelled, reg)
}

func newTestSetupWithNotifier(provider *fakePaymentProvider) (*Service, *fakeEventsReader, *fakeRegistrationNotifier) {
	repo := newFakeRegRepo()
	er := newFakeEventsReader()
	notifier := &fakeRegistrationNotifier{}
	svc := NewService(repo, er, provider, nil, nil, nil, notifier)
	return svc, er, notifier
}

func seedEventAndCategory(er *fakeEventsReader, priceCents, capacity int) (uuid.UUID, uuid.UUID) {
	eventID := uuid.New()
	categoryID := uuid.New()
	er.eventsByID[eventID] = &events.Event{ID: eventID, Status: events.StatusRegistrationOpen}
	er.categoriesByID[categoryID] = &events.EventCategory{
		ID: categoryID, EventID: eventID, PriceCents: priceCents, Currency: "USD", Capacity: capacity, Status: "OPEN",
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

func TestService_Register_PaidCategoryReleasesReservationOnPaymentFailure(t *testing.T) {
	svc, repo, er := newTestSetup(&fakePaymentProvider{status: payments.StatusFailed})
	eventID, categoryID := seedEventAndCategory(er, 5000, 10)

	_, err := svc.Register(context.Background(), uuid.New(), eventID, validRegisterReq(categoryID))
	if !errors.Is(err, ErrPaymentUnavailable) {
		t.Fatalf("Register() error = %v, want ErrPaymentUnavailable", err)
	}
	for _, registration := range repo.regs {
		if registration.Status != StatusCancelled {
			t.Errorf("Status = %q, want %q", registration.Status, StatusCancelled)
		}
	}
}

func TestService_Register_PaidReleasesReservationWhenProviderErrors(t *testing.T) {
	provider := &fakePaymentProvider{err: errors.New("provider unavailable")}
	svc, repo, er := newTestSetup(provider)
	eventID, categoryID := seedEventAndCategory(er, 5000, 10)
	if _, err := svc.Register(context.Background(), uuid.New(), eventID, validRegisterReq(categoryID)); err == nil {
		t.Fatal("Register() expected provider error")
	}
	for _, registration := range repo.regs {
		if registration.Status != StatusCancelled {
			t.Fatalf("registration status = %q, want CANCELLED", registration.Status)
		}
	}
}

func TestService_Register_PaidReleasesReservationWhenPaymentPersistenceFails(t *testing.T) {
	provider := &fakePaymentProvider{status: payments.StatusPending}
	svc, repo, er := newTestSetup(provider)
	repo.createPaymentErr = errors.New("database write failed")
	eventID, categoryID := seedEventAndCategory(er, 5000, 10)
	if _, err := svc.Register(context.Background(), uuid.New(), eventID, validRegisterReq(categoryID)); err == nil {
		t.Fatal("Register() expected persistence error")
	}
	for _, registration := range repo.regs {
		if registration.Status != StatusCancelled {
			t.Fatalf("registration status = %q, want CANCELLED", registration.Status)
		}
	}
}

func TestService_Register_PaidUsesCategoryCurrency(t *testing.T) {
	provider := &fakePaymentProvider{status: payments.StatusPending}
	svc, _, er := newTestSetup(provider)
	eventID, categoryID := seedEventAndCategory(er, 25000, 10)
	er.categoriesByID[categoryID].Currency = "KHR"
	if _, err := svc.Register(context.Background(), uuid.New(), eventID, validRegisterReq(categoryID)); err != nil {
		t.Fatalf("Register() error = %v", err)
	}
	if provider.currency != "KHR" {
		t.Fatalf("provider currency = %q, want KHR", provider.currency)
	}
}

func TestService_ReconcilePendingPaymentConfirmsWithoutBrowser(t *testing.T) {
	provider := &fakePaymentProvider{status: payments.StatusPending}
	repo := newFakeRegRepo()
	er := newFakeEventsReader()
	notifier := &fakeRegistrationNotifier{}
	svc := NewService(repo, er, provider, nil, nil, nil, notifier)
	eventID, categoryID := seedEventAndCategory(er, 2500, 10)
	result, err := svc.Register(context.Background(), uuid.New(), eventID, validRegisterReq(categoryID))
	if err != nil {
		t.Fatalf("Register() error = %v", err)
	}
	provider.status = payments.StatusSucceeded
	provider.verification = &payments.Verification{AmountCents: 2500, Currency: "USD", ReceiverAccount: "test"}
	if err := svc.ReconcilePendingPayments(context.Background(), "worker-1", 25); err != nil {
		t.Fatalf("ReconcilePendingPayments() error = %v", err)
	}
	if repo.regs[result.Registration.ID].Status != StatusConfirmed {
		t.Fatalf("registration status = %q, want CONFIRMED", repo.regs[result.Registration.ID].Status)
	}
	if len(notifier.confirmed) != 1 || len(notifier.paid) != 1 {
		t.Fatalf("notifications confirmed=%d paid=%d, want 1 each", len(notifier.confirmed), len(notifier.paid))
	}
}

func TestService_ReconcileExpiredPendingPaymentReleasesCapacity(t *testing.T) {
	provider := &fakePaymentProvider{status: payments.StatusPending}
	svc, repo, er := newTestSetup(provider)
	eventID, categoryID := seedEventAndCategory(er, 2500, 1)
	result, err := svc.Register(context.Background(), uuid.New(), eventID, validRegisterReq(categoryID))
	if err != nil {
		t.Fatalf("Register() error = %v", err)
	}
	expired := time.Now().Add(-time.Minute)
	repo.payments[0].ExpiresAt = &expired
	if err := svc.ReconcilePendingPayments(context.Background(), "worker-1", 25); err != nil {
		t.Fatalf("ReconcilePendingPayments() error = %v", err)
	}
	if repo.regs[result.Registration.ID].Status != StatusCancelled {
		t.Fatalf("registration status = %q, want CANCELLED", repo.regs[result.Registration.ID].Status)
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

func TestService_Cancel_CheckedInRegistrationRejected(t *testing.T) {
	svc, repo, er := newTestSetup(&fakePaymentProvider{status: payments.StatusSucceeded})
	eventID, categoryID := seedEventAndCategory(er, 0, 10)
	owner := uuid.New()
	result, err := svc.Register(context.Background(), owner, eventID, validRegisterReq(categoryID))
	if err != nil {
		t.Fatalf("Register() error = %v", err)
	}
	repo.checkedIn[result.Registration.ID] = true

	err = svc.Cancel(context.Background(), owner, auth.RoleUser, result.Registration.ID)
	if !errors.Is(err, ErrCannotCancelCheckedIn) {
		t.Fatalf("Cancel() error = %v, want ErrCannotCancelCheckedIn", err)
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

func TestService_Register_Free_NotifiesConfirmedOnly(t *testing.T) {
	svc, er, notifier := newTestSetupWithNotifier(&fakePaymentProvider{status: payments.StatusSucceeded})
	eventID, categoryID := seedEventAndCategory(er, 0, 10)

	if _, err := svc.Register(context.Background(), uuid.New(), eventID, validRegisterReq(categoryID)); err != nil {
		t.Fatalf("Register() error = %v", err)
	}

	if len(notifier.confirmed) != 1 {
		t.Errorf("confirmed notifications = %d, want 1", len(notifier.confirmed))
	}
	if len(notifier.paid) != 0 {
		t.Errorf("payment notifications = %d, want 0 (free category)", len(notifier.paid))
	}
}

func TestService_Register_Paid_NotifiesConfirmedAndPaid(t *testing.T) {
	svc, er, notifier := newTestSetupWithNotifier(&fakePaymentProvider{status: payments.StatusSucceeded})
	eventID, categoryID := seedEventAndCategory(er, 5000, 10)

	if _, err := svc.Register(context.Background(), uuid.New(), eventID, validRegisterReq(categoryID)); err != nil {
		t.Fatalf("Register() error = %v", err)
	}

	if len(notifier.confirmed) != 1 {
		t.Errorf("confirmed notifications = %d, want 1", len(notifier.confirmed))
	}
	if len(notifier.paid) != 1 {
		t.Errorf("payment notifications = %d, want 1", len(notifier.paid))
	}
}

func TestService_Register_PaymentFailure_NoNotification(t *testing.T) {
	svc, er, notifier := newTestSetupWithNotifier(&fakePaymentProvider{status: payments.StatusFailed})
	eventID, categoryID := seedEventAndCategory(er, 5000, 10)

	if _, err := svc.Register(context.Background(), uuid.New(), eventID, validRegisterReq(categoryID)); !errors.Is(err, ErrPaymentUnavailable) {
		t.Fatalf("Register() error = %v, want ErrPaymentUnavailable", err)
	}

	if len(notifier.confirmed) != 0 || len(notifier.paid) != 0 {
		t.Errorf("expected no notifications for a payment that stayed PENDING, got confirmed=%d paid=%d",
			len(notifier.confirmed), len(notifier.paid))
	}
}

func TestService_Cancel_NotifiesCancellation(t *testing.T) {
	svc, er, notifier := newTestSetupWithNotifier(&fakePaymentProvider{status: payments.StatusSucceeded})
	eventID, categoryID := seedEventAndCategory(er, 0, 10)
	userID := uuid.New()

	result, err := svc.Register(context.Background(), userID, eventID, validRegisterReq(categoryID))
	if err != nil {
		t.Fatalf("Register() error = %v", err)
	}

	if err := svc.Cancel(context.Background(), userID, auth.RoleUser, result.Registration.ID); err != nil {
		t.Fatalf("Cancel() error = %v", err)
	}

	if len(notifier.cancelled) != 1 {
		t.Errorf("cancelled notifications = %d, want 1", len(notifier.cancelled))
	}
}
