package checkin

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/unity-run-club/api/internal/auditlog"
	"github.com/unity-run-club/api/internal/registrations"
	"github.com/unity-run-club/api/internal/tokenhash"
)

// fakeCheckinRepo is an in-memory checkinRepository for service unit tests
type fakeCheckinRepo struct {
	byRegistration map[uuid.UUID]*CheckIn
}

// newFakeCheckinRepo creates a new fakeCheckinRepo
func newFakeCheckinRepo() *fakeCheckinRepo {
	return &fakeCheckinRepo{byRegistration: map[uuid.UUID]*CheckIn{}}
}

func (f *fakeCheckinRepo) Create(ctx context.Context, registrationID, staffUserID uuid.UUID) (*CheckIn, error) {
	if _, exists := f.byRegistration[registrationID]; exists {
		return nil, ErrAlreadyCheckedIn
	}
	c := &CheckIn{ID: uuid.New(), RegistrationID: registrationID, StaffUserID: staffUserID, CheckedInAt: time.Now(), CreatedAt: time.Now()}
	f.byRegistration[registrationID] = c
	return c, nil
}

// fakeRegistrationsReader is an in-memory registrationsReader for service unit tests
type fakeRegistrationsReader struct {
	byTokenHash map[string]uuid.UUID
	byID        map[uuid.UUID]*registrations.Registration
	byNumber    map[string]uuid.UUID
}

// newFakeRegistrationsReader creates a new fakeRegistrationsReader
func newFakeRegistrationsReader() *fakeRegistrationsReader {
	return &fakeRegistrationsReader{byTokenHash: map[string]uuid.UUID{}, byID: map[uuid.UUID]*registrations.Registration{}, byNumber: map[string]uuid.UUID{}}
}

// GetRegistrationIDByTicketTokenHash gets the registration ID by ticket token hash
func (f *fakeRegistrationsReader) GetRegistrationIDByTicketTokenHash(ctx context.Context, hash string) (uuid.UUID, error) {
	id, ok := f.byTokenHash[hash]
	if !ok {
		return uuid.Nil, registrations.ErrNotFound
	}
	return id, nil
}

// GetByRegistrationNumber gets the registration by registration number
func (f *fakeRegistrationsReader) GetByRegistrationNumber(ctx context.Context, number string) (*registrations.Registration, error) {
	id, ok := f.byNumber[number]
	if !ok {
		return nil, registrations.ErrNotFound
	}
	return f.GetByID(ctx, id)
}

// GetByID gets the registration by ID
func (f *fakeRegistrationsReader) GetByID(ctx context.Context, id uuid.UUID) (*registrations.Registration, error) {
	r, ok := f.byID[id]
	if !ok {
		return nil, registrations.ErrNotFound
	}
	return r, nil
}

// seedConfirmed seeds a confirmed registration
func (f *fakeRegistrationsReader) seedConfirmed(rawToken string) uuid.UUID {
	id := uuid.New()
	f.byTokenHash[tokenhash.Hash(rawToken)] = id
	f.byID[id] = &registrations.Registration{ID: id, Status: registrations.StatusConfirmed}
	return id
}

// discardLogger creates a new discard logger
func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// newTestService creates a new test service
func newTestService() (*Service, *fakeCheckinRepo, *fakeRegistrationsReader) {
	checkinRepo := newFakeCheckinRepo()
	regsReader := newFakeRegistrationsReader()
	auditSvc := auditlog.NewService(&noopAuditWriter{}, discardLogger())
	svc := NewService(checkinRepo, regsReader, auditSvc)
	return svc, checkinRepo, regsReader
}

// noopAuditWriter is a noop audit writer
type noopAuditWriter struct{}

// Insert inserts an audit entry

func (noopAuditWriter) Insert(ctx context.Context, e *auditlog.Entry) error { return nil }

// TestService_CheckIn_Success tests the CheckIn method that succeeds
func TestService_CheckIn_Success(t *testing.T) {
	svc, _, regs := newTestService()
	regID := regs.seedConfirmed("raw-token-1")

	result, err := svc.CheckIn(context.Background(), uuid.New(), nil, "raw-token-1")
	if err != nil {
		t.Fatalf("CheckIn() error = %v", err)
	}
	if result.Registration.ID != regID {
		t.Errorf("Registration.ID = %v, want %v", result.Registration.ID, regID)
	}
}

// TestService_CheckIn_InvalidToken tests the CheckIn method that rejects an invalid token
func TestService_CheckIn_InvalidToken(t *testing.T) {
	svc, _, _ := newTestService()

	_, err := svc.CheckIn(context.Background(), uuid.New(), nil, "no-such-token")
	if !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("CheckIn() error = %v, want ErrInvalidToken", err)
	}
}

// TestService_CheckIn_NotConfirmedRejected tests the CheckIn method that rejects a not confirmed registration
func TestService_CheckIn_NotConfirmedRejected(t *testing.T) {
	svc, _, regs := newTestService()
	id := uuid.New()
	regs.byTokenHash[tokenhash.Hash("pending-token")] = id
	regs.byID[id] = &registrations.Registration{ID: id, Status: registrations.StatusPending}

	_, err := svc.CheckIn(context.Background(), uuid.New(), nil, "pending-token")
	if !errors.Is(err, ErrNotConfirmed) {
		t.Fatalf("CheckIn() error = %v, want ErrNotConfirmed", err)
	}
}

// TestService_CheckIn_DuplicateRejected tests the CheckIn method that rejects a duplicate registration
func TestService_CheckIn_DuplicateRejected(t *testing.T) {
	svc, _, regs := newTestService()
	regs.seedConfirmed("raw-token-1")

	staffID := uuid.New()
	if _, err := svc.CheckIn(context.Background(), staffID, nil, "raw-token-1"); err != nil {
		t.Fatalf("first CheckIn() error = %v", err)
	}

	_, err := svc.CheckIn(context.Background(), staffID, nil, "raw-token-1")
	if !errors.Is(err, ErrAlreadyCheckedIn) {
		t.Fatalf("second CheckIn() error = %v, want ErrAlreadyCheckedIn", err)
	}
}

// TestService_CheckIn_RecordsStaffAttribution tests the CheckIn method that records staff attribution
func TestService_CheckIn_RecordsStaffAttribution(t *testing.T) {
	svc, checkinRepo, regs := newTestService()
	regID := regs.seedConfirmed("raw-token-1")
	staffID := uuid.New()

	if _, err := svc.CheckIn(context.Background(), staffID, nil, "raw-token-1"); err != nil {
		t.Fatalf("CheckIn() error = %v", err)
	}

	recorded, ok := checkinRepo.byRegistration[regID]
	if !ok {
		t.Fatal("expected a check-in record to exist")
	}
	if recorded.StaffUserID != staffID {
		t.Errorf("StaffUserID = %v, want %v", recorded.StaffUserID, staffID)
	}
}

// TestService_CheckIn_RegistrationNumberAndWrapper tests the CheckIn method that records a registration number and wrapper
func TestService_CheckIn_RegistrationNumberAndWrapper(t *testing.T) {
	svc, _, regs := newTestService()
	id := uuid.New()
	number := "URC-2026-000042"
	regs.byID[id] = &registrations.Registration{ID: id, RegistrationNumber: number, Status: registrations.StatusConfirmed}
	regs.byNumber[number] = id

	result, err := svc.CheckIn(context.Background(), uuid.New(), nil, "URC:"+number)
	if err != nil {
		t.Fatalf("CheckIn() error = %v", err)
	}
	if result.Registration.ID != id {
		t.Fatalf("Registration.ID = %v, want %v", result.Registration.ID, id)
	}
}

// TestService_CheckIn_WrongEventRejected tests the CheckIn method that rejects a wrong event
func TestService_CheckIn_WrongEventRejected(t *testing.T) {
	svc, _, regs := newTestService()
	registrationEventID := uuid.New()
	selectedEventID := uuid.New()
	id := regs.seedConfirmed("raw-token-1")
	regs.byID[id].EventID = registrationEventID

	_, err := svc.CheckIn(context.Background(), uuid.New(), &selectedEventID, "raw-token-1")
	if !errors.Is(err, ErrWrongEvent) {
		t.Fatalf("CheckIn() error = %v, want ErrWrongEvent", err)
	}
}
