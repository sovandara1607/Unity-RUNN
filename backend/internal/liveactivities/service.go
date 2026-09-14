package liveactivities

import (
	"context"
	"log/slog"

	"github.com/google/uuid"
)

// Publisher sends a Live Activity update to Apple. Not implemented in this
// repository -- see the package doc comment in model.go. DefaultPublisher
// logs and returns nil so the rest of the system (registration, check-in,
// race lifecycle) never breaks or blocks on Live Activities being wired up.
// Swap in a real implementation once APNs credentials exist; nothing else in
// this package needs to change.
type Publisher interface {
	Publish(ctx context.Context, activity *LiveActivity, event DomainEvent) error
}

// DefaultPublisher is the honest no-op: it does not send a push, and says so
// in the log rather than silently pretending to.
type DefaultPublisher struct {
	Log *slog.Logger
}

func (p DefaultPublisher) Publish(_ context.Context, activity *LiveActivity, event DomainEvent) error {
	if p.Log != nil {
		p.Log.Info("live_activity_publish_skipped",
			"reason", "no APNs publisher configured",
			"activity_id", activity.ID,
			"domain_event", event,
		)
	}
	return nil
}

// repository is the subset of *Repository the service needs, kept as an
// interface (matching registrations.Service's own convention) so tests can
// substitute a fake instead of a live Postgres connection.
type repository interface {
	Create(ctx context.Context, userID uuid.UUID, in CreateInput) (*LiveActivity, error)
	GetByID(ctx context.Context, id uuid.UUID) (*LiveActivity, error)
	ListActiveForUser(ctx context.Context, userID uuid.UUID) ([]LiveActivity, error)
	UpdateRaceStatus(ctx context.Context, id uuid.UUID, in UpdateInput) (*LiveActivity, error)
	End(ctx context.Context, id uuid.UUID) error
}

type Service struct {
	repo      repository
	publisher Publisher
}

// NewService builds a Service. publisher may be nil, in which case updates
// are recorded in Postgres but nothing is ever pushed to the device -- the
// activity still works as a local, on-device-only Live Activity until the
// app itself opens and calls restore().
func NewService(repo repository, publisher Publisher) *Service {
	if publisher == nil {
		publisher = DefaultPublisher{}
	}
	return &Service{repo: repo, publisher: publisher}
}

// Start begins following an event's Live Activity. Mirrors the mobile
// `raceLiveActivity.start(event)` call after ActivityKit has already created
// the on-device activity and handed back its id + push token.
func (s *Service) Start(ctx context.Context, userID uuid.UUID, in CreateInput) (*LiveActivity, error) {
	return s.repo.Create(ctx, userID, in)
}

// GetByID fetches one activity by id, ownership unchecked -- callers (see
// handler.go) compare .UserID themselves before trusting the result.
func (s *Service) GetByID(ctx context.Context, id uuid.UUID) (*LiveActivity, error) {
	return s.repo.GetByID(ctx, id)
}

// GetActiveForUser lists what a runner is currently following -- backs the
// Race Wallet's "Follow Live" button states (item 9): a registered event with
// no active row here shows "Follow Live"; one with an ACTIVE row shows
// "Following" / "Live Now" / "Finished" depending on its RaceStatus.
func (s *Service) GetActiveForUser(ctx context.Context, userID uuid.UUID) ([]LiveActivity, error) {
	return s.repo.ListActiveForUser(ctx, userID)
}

// Update patches an activity's race status, publishing the corresponding
// domain event. Ownership (is id really userID's) is the caller's job -- see
// handler.go -- so this stays a pure state-transition function testable
// without an HTTP layer.
func (s *Service) Update(ctx context.Context, id uuid.UUID, in UpdateInput) (*LiveActivity, error) {
	activity, err := s.repo.UpdateRaceStatus(ctx, id, in)
	if err != nil {
		return nil, err
	}
	if in.RaceStatus != nil {
		event := domainEventFor(*in.RaceStatus)
		// Publish failures are logged by the publisher itself, not fatal to
		// the state transition: the backend record is the source of truth,
		// a missed push just means the device catches up on next foreground
		// (see mobile's restore()).
		_ = s.publisher.Publish(ctx, activity, event)
	}
	return activity, nil
}

// End stops following. Idempotent (see Repository.End).
func (s *Service) End(ctx context.Context, id uuid.UUID) error {
	return s.repo.End(ctx, id)
}

// domainEventFor is a direct status->event mapping, not a state-machine
// transition detector: it can't tell "just went live" (RaceStarted) apart
// from "another progress update while already live" (RaceProgressUpdated)
// without the previous status, which this function isn't given. Both map to
// the one LIVE event a caller can distinguish by checking whether this is
// the first update since STARTING, if that distinction ever matters once a
// real Publisher exists.
func domainEventFor(status RaceStatus) DomainEvent {
	switch status {
	case RaceCheckIn:
		return EventCheckInOpened
	case RaceStarting:
		return EventStartingSoon
	case RaceLive:
		return EventRaceProgress
	case RaceFinished:
		return EventRunnerFinished
	case RaceCancelled:
		return EventRaceCancelled
	default: // RaceUpcoming -- setting an activity back to upcoming isn't a
		// real transition; RaceStarted is the closest "activity now exists"
		// signal and is otherwise unused by this mapping.
		return EventRaceStarted
	}
}
