package notifications

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func testPool(t *testing.T) *pgxpool.Pool {
	t.Helper()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set; skipping integration test")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect to database: %v", err)
	}
	t.Cleanup(pool.Close)

	if _, err := pool.Exec(ctx, `TRUNCATE TABLE notification_deliveries, notifications`); err != nil {
		t.Fatalf("truncate notifications: %v", err)
	}

	return pool
}

func TestRepository_TelegramDeliveryLifecycle(t *testing.T) {
	pool := testPool(t)
	repo := NewRepository(pool)
	ctx := context.Background()

	userID := uuid.New()
	if _, err := pool.Exec(ctx, `INSERT INTO users (id,email,password_hash) VALUES ($1,$2,'test')`, userID, userID.String()+"@example.com"); err != nil {
		t.Fatalf("insert user: %v", err)
	}
	t.Cleanup(func() { _, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE id=$1`, userID) })

	n := &Notification{UserID: &userID, RecipientEmail: "runner@example.com", Type: TypeEventReminder,
		EntityType: "registration", EntityID: uuid.New()}
	if err := repo.Create(ctx, n); err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	claimed, err := repo.ClaimTelegramDeliveries(ctx, 10)
	if err != nil || len(claimed) != 1 {
		t.Fatalf("ClaimTelegramDeliveries() = %#v, %v", claimed, err)
	}
	if claimed[0].NotificationID != n.ID || claimed[0].Status != DeliveryProcessing {
		t.Fatalf("claimed delivery = %#v", claimed[0])
	}

	if err := repo.RecordDeliveryFailure(ctx, claimed[0].ID, "temporary", 3); err != nil {
		t.Fatalf("RecordDeliveryFailure() error = %v", err)
	}
	claimedAgain, err := repo.ClaimTelegramDeliveries(ctx, 10)
	if err != nil || len(claimedAgain) != 0 {
		t.Fatalf("backoff claim = %#v, %v", claimedAgain, err)
	}
	if _, err := pool.Exec(ctx, `UPDATE notification_deliveries SET next_attempt_at=now()-interval '1 second' WHERE id=$1`, claimed[0].ID); err != nil {
		t.Fatal(err)
	}

	claimedAgain, err = repo.ClaimTelegramDeliveries(ctx, 10)
	if err != nil || len(claimedAgain) != 1 {
		t.Fatalf("retry claim = %#v, %v", claimedAgain, err)
	}
	if err := repo.MarkDeliverySent(ctx, claimed[0].ID, time.Now()); err != nil {
		t.Fatalf("MarkDeliverySent() error = %v", err)
	}

	history, err := repo.ListUserTelegramDeliveries(ctx, userID, 8)
	if err != nil || len(history) != 1 {
		t.Fatalf("ListUserTelegramDeliveries() = %#v, %v", history, err)
	}
	if history[0].Status != DeliverySent || history[0].Type != TypeEventReminder || history[0].LastError != "" {
		t.Fatalf("history delivery = %#v", history[0])
	}
}

func TestRepository_Create_DedupUniqueConstraint(t *testing.T) {
	pool := testPool(t)
	repo := NewRepository(pool)
	ctx := context.Background()

	entityID := uuid.New()
	n1 := &Notification{RecipientEmail: "runner@unityrunclub.com", Type: TypeRegistrationConfirmation,
		EntityType: "registration", EntityID: entityID}
	if err := repo.Create(ctx, n1); err != nil {
		t.Fatalf("first Create() error = %v", err)
	}

	n2 := &Notification{RecipientEmail: "runner@unityrunclub.com", Type: TypeRegistrationConfirmation,
		EntityType: "registration", EntityID: entityID}
	err := repo.Create(ctx, n2)
	if !errors.Is(err, ErrAlreadyExists) {
		t.Fatalf("second Create() error = %v, want ErrAlreadyExists", err)
	}
}

func TestRepository_Create_DifferentTypeSameEntityAllowed(t *testing.T) {
	pool := testPool(t)
	repo := NewRepository(pool)
	ctx := context.Background()

	entityID := uuid.New()
	n1 := &Notification{RecipientEmail: "runner@unityrunclub.com", Type: TypeRegistrationConfirmation,
		EntityType: "registration", EntityID: entityID}
	if err := repo.Create(ctx, n1); err != nil {
		t.Fatalf("Create() (confirmation) error = %v", err)
	}

	n2 := &Notification{RecipientEmail: "runner@unityrunclub.com", Type: TypePaymentConfirmation,
		EntityType: "registration", EntityID: entityID}
	if err := repo.Create(ctx, n2); err != nil {
		t.Fatalf("Create() (payment) error = %v, want nil (different type, same entity)", err)
	}
}

func TestRepository_MarkSentAndRecordFailure(t *testing.T) {
	pool := testPool(t)
	repo := NewRepository(pool)
	ctx := context.Background()

	n := &Notification{RecipientEmail: "runner@unityrunclub.com", Type: TypeCancellation,
		EntityType: "registration", EntityID: uuid.New()}
	if err := repo.Create(ctx, n); err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	if err := repo.RecordFailure(ctx, n.ID, "smtp timeout", 3); err != nil {
		t.Fatalf("RecordFailure() error = %v", err)
	}
	got, err := repo.GetByID(ctx, n.ID)
	if err != nil {
		t.Fatalf("GetByID() error = %v", err)
	}
	if got.Status != StatusPending || got.Attempts != 1 {
		t.Errorf("after 1 failure: status=%q attempts=%d, want PENDING/1", got.Status, got.Attempts)
	}

	if err := repo.RecordFailure(ctx, n.ID, "smtp timeout", 3); err != nil {
		t.Fatalf("RecordFailure() error = %v", err)
	}
	if err := repo.RecordFailure(ctx, n.ID, "smtp timeout", 3); err != nil {
		t.Fatalf("RecordFailure() error = %v", err)
	}
	got, err = repo.GetByID(ctx, n.ID)
	if err != nil {
		t.Fatalf("GetByID() error = %v", err)
	}
	if got.Status != StatusFailed {
		t.Errorf("after 3 failures: status=%q, want FAILED", got.Status)
	}

	if err := repo.MarkSent(ctx, n.ID, time.Now()); err != nil {
		t.Fatalf("MarkSent() error = %v", err)
	}
	got, err = repo.GetByID(ctx, n.ID)
	if err != nil {
		t.Fatalf("GetByID() error = %v", err)
	}
	if got.Status != StatusSent || got.SentAt == nil {
		t.Errorf("after MarkSent: status=%q sentAt=%v, want SENT with a timestamp", got.Status, got.SentAt)
	}
}

func TestRepository_ListPendingOlderThan(t *testing.T) {
	pool := testPool(t)
	repo := NewRepository(pool)
	ctx := context.Background()

	n := &Notification{RecipientEmail: "runner@unityrunclub.com", Type: TypeEventReminder,
		EntityType: "registration", EntityID: uuid.New()}
	if err := repo.Create(ctx, n); err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	// Not stale yet (cutoff in the past).
	pending, err := repo.ListPendingOlderThan(ctx, time.Now().Add(-time.Hour), 10)
	if err != nil {
		t.Fatalf("ListPendingOlderThan() error = %v", err)
	}
	if len(pending) != 0 {
		t.Errorf("pending = %d, want 0 (row isn't stale yet)", len(pending))
	}

	// Stale relative to a future cutoff.
	pending, err = repo.ListPendingOlderThan(ctx, time.Now().Add(time.Hour), 10)
	if err != nil {
		t.Fatalf("ListPendingOlderThan() error = %v", err)
	}
	if len(pending) != 1 {
		t.Fatalf("pending = %d, want 1", len(pending))
	}
	if pending[0].ID != n.ID {
		t.Errorf("pending[0].ID = %v, want %v", pending[0].ID, n.ID)
	}
}
