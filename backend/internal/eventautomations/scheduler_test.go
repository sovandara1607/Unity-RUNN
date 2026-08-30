package eventautomations

import (
	"context"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/unity-run-club/api/internal/registrations"
)

type fakeDueRepo struct {
	due    []Automation
	sent   int
	failed string
}

func (f *fakeDueRepo) ClaimDue(context.Context, int) ([]Automation, error) {
	items := f.due
	f.due = nil
	return items, nil
}
func (f *fakeDueRepo) MarkSent(_ context.Context, _ uuid.UUID, count int) error {
	f.sent = count
	return nil
}
func (f *fakeDueRepo) RecordFailure(_ context.Context, _ uuid.UUID, cause string, _ int) error {
	f.failed = cause
	return nil
}

type fakeRegs struct {
	eventID uuid.UUID
	status  registrations.Status
	items   []registrations.Registration
}

func (f *fakeRegs) ListAll(_ context.Context, filter registrations.AdminListFilter) ([]registrations.Registration, int, error) {
	f.eventID = *filter.EventID
	f.status = *filter.Status
	return f.items, len(f.items), nil
}

type fakeAnnouncements struct {
	calls          int
	title, message string
}

func (f *fakeAnnouncements) EnqueueAnnouncement(_ context.Context, _ string, _ registrations.Registration, title, message string) error {
	f.calls++
	f.title = title
	f.message = message
	return nil
}

func TestSchedulerFansOutOnlyToConfirmedAudience(t *testing.T) {
	eventID, automationID := uuid.New(), uuid.New()
	repo := &fakeDueRepo{due: []Automation{{ID: automationID, EventID: eventID, Name: "Gate change", Message: "Use the south gate."}}}
	regs := &fakeRegs{items: []registrations.Registration{{ID: uuid.New()}, {ID: uuid.New()}}}
	notifier := &fakeAnnouncements{}
	s := NewScheduler(repo, regs, notifier, slog.New(slog.NewTextHandler(io.Discard, nil)), time.Second, 3)
	s.poll(context.Background())
	if regs.eventID != eventID || regs.status != registrations.StatusConfirmed {
		t.Fatalf("filter = %s/%s, want event and CONFIRMED", regs.eventID, regs.status)
	}
	if notifier.calls != 2 || repo.sent != 2 {
		t.Fatalf("calls/sent = %d/%d, want 2/2", notifier.calls, repo.sent)
	}
	if notifier.title != "Gate change" || notifier.message != "Use the south gate." {
		t.Fatalf("unexpected content: %q / %q", notifier.title, notifier.message)
	}
}
