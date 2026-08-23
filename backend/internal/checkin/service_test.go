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

// fakeCheckinRepo is an in-memory checkinRepository for service unit tests.
type fakeCheckinRepo struct {
	byRegistration map[uuid.UUID]*CheckIn
}

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

// fakeRegistrationsReader is an in-memory registrationsReader for service unit tests.
type fakeRegistrationsReader struct {
	byTokenHash map[string]uuid.UUID
	byID        map[uuid.UUID]*registrations.Registration
}

func newFakeRegistrationsReader() *fakeRegistrationsReader {
	return &fakeRegistrationsReader{byTokenHash: map[string]uuid.UUID{}, byID: map[uuid.UUID]*registrations.Registration{}}
}

func (f *fakeRegistrationsReader) GetRegistrationIDByTicketTokenHash(ctx context.Context, hash string) (uuid.UUID, error) {
	id, ok := f.byTokenHash[hash]
	if !ok {
		return uuid.Nil, registrations.ErrNotFound
	}
	return id, nil
}

func (f *fakeRegistrationsReader) GetByID(ctx context.Context, id uuid.UUID) (*registrations.Registration, error) {
	r, ok := f.byID[id]
	if !ok {
		return nil, registrations.ErrNotFound
	}
	return r, nil
}

func (f *fakeRegistrationsReader) seedConfirmed(rawToken string) uuid.UUID {
	id := uuid.New()
	f.byTokenHash[tokenhash.Hash(rawToken)] = id
	f.byID[id] = &registrations.Registration{ID: id, Status: registrations.StatusConfirmed}
	return id
}

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func newTestService() (*Service, *fakeCheckinRepo, *fakeRegistrationsReader) {
	checkinRepo := newFakeCheckinRepo()
	regsReader := newFakeRegistrationsReader()
	auditSvc := auditlog.NewService(&noopAuditWriter{}, discardLogger())
	svc := NewService(checkinRepo, regsReader, auditSvc)
	return svc, checkinRepo, regsReader
}

type noopAuditWriter struct{}

func (noopAuditWriter) Insert(ctx context.Context, e *auditlog.Entry) error { return nil }

func TestService_CheckIn_Success(t *testing.T) {
	svc, _, regs := newTestService()
	regID := regs.seedConfirmed("raw-token-1")

	result, err := svc.CheckIn(context.Background(), uuid.New(), "raw-token-1")
	if err != nil {
		t.Fatalf("CheckIn() error = %v", err)
	}
	if result.Registration.ID != regID {
		t.Errorf("Registration.ID = %v, want %v", result.Registration.ID, regID)
	}
}

func TestService_CheckIn_InvalidToken(t *testing.T) {
	svc, _, _ := newTestService()

	_, err := svc.CheckIn(context.Background(), uuid.New(), "no-such-token")
	if !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("CheckIn() error = %v, want ErrInvalidToken", err)
	}
}

func TestService_CheckIn_NotConfirmedRejected(t *testing.T) {
	svc, _, regs := newTestService()
	id := uuid.New()
	regs.byTokenHash[tokenhash.Hash("pending-token")] = id
	regs.byID[id] = &registrations.Registration{ID: id, Status: registrations.StatusPending}

	_, err := svc.CheckIn(context.Background(), uuid.New(), "pending-token")
	if !errors.Is(err, ErrNotConfirmed) {
		t.Fatalf("CheckIn() error = %v, want ErrNotConfirmed", err)
	}
}

func TestService_CheckIn_DuplicateRejected(t *testing.T) {
	svc, _, regs := newTestService()
	regs.seedConfirmed("raw-token-1")

	staffID := uuid.New()
	if _, err := svc.CheckIn(context.Background(), staffID, "raw-token-1"); err != nil {
		t.Fatalf("first CheckIn() error = %v", err)
	}

	_, err := svc.CheckIn(context.Background(), staffID, "raw-token-1")
	if !errors.Is(err, ErrAlreadyCheckedIn) {
		t.Fatalf("second CheckIn() error = %v, want ErrAlreadyCheckedIn", err)
	}
}

func TestService_CheckIn_RecordsStaffAttribution(t *testing.T) {
	svc, checkinRepo, regs := newTestService()
	regID := regs.seedConfirmed("raw-token-1")
	staffID := uuid.New()

	if _, err := svc.CheckIn(context.Background(), staffID, "raw-token-1"); err != nil {
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
