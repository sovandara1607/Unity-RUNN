package eventautomations

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/unity-run-club/api/internal/registrations"
)

type dueRepository interface {
	ClaimDue(context.Context, int) ([]Automation, error)
	MarkSent(context.Context, uuid.UUID, int) error
	RecordFailure(context.Context, uuid.UUID, string, int) error
}

type registrationLister interface {
	ListAll(context.Context, registrations.AdminListFilter) ([]registrations.Registration, int, error)
}
type announcementEnqueuer interface {
	EnqueueAnnouncement(context.Context, string, registrations.Registration, string, string) error
}

type Scheduler struct {
	repo        dueRepository
	regs        registrationLister
	notifier    announcementEnqueuer
	log         *slog.Logger
	interval    time.Duration
	maxAttempts int
}

func NewScheduler(repo dueRepository, regs registrationLister, notifier announcementEnqueuer, log *slog.Logger, interval time.Duration, maxAttempts int) *Scheduler {
	if interval <= 0 {
		interval = 15 * time.Second
	}
	if maxAttempts <= 0 {
		maxAttempts = 5
	}
	return &Scheduler{repo: repo, regs: regs, notifier: notifier, log: log, interval: interval, maxAttempts: maxAttempts}
}
func (s *Scheduler) Run(ctx context.Context) {
	s.poll(ctx)
	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.poll(ctx)
		}
	}
}
func (s *Scheduler) poll(ctx context.Context) {
	items, err := s.repo.ClaimDue(ctx, 25)
	if err != nil {
		s.log.Error("event_automation_claim_failed", "error", err)
		return
	}
	for _, a := range items {
		s.send(ctx, a)
	}
}
func (s *Scheduler) send(ctx context.Context, a Automation) {
	status := registrations.StatusConfirmed
	regs, _, err := s.regs.ListAll(ctx, registrations.AdminListFilter{EventID: &a.EventID, Status: &status, Limit: 10000})
	if err == nil {
		for _, reg := range regs {
			if err = s.notifier.EnqueueAnnouncement(ctx, a.ID.String(), reg, a.Name, a.Message); err != nil {
				break
			}
		}
	}
	if err != nil {
		_ = s.repo.RecordFailure(ctx, a.ID, fmt.Sprintf("fan-out failed: %v", err), s.maxAttempts)
		return
	}
	if err = s.repo.MarkSent(ctx, a.ID, len(regs)); err != nil {
		s.log.Error("event_automation_mark_sent_failed", "automation_id", a.ID, "error", err)
	}
}
