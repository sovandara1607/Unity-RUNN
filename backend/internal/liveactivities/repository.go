package liveactivities

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("liveactivities: not found")

// ErrDuplicateActive is returned when the caller already has an ACTIVE
// activity for this event -- enforced by a partial unique index (see
// migrations/00034), not just this application-level check, so a race
// between two concurrent "Follow Live" taps still can't create two rows.
var ErrDuplicateActive = errors.New("liveactivities: an active live activity already exists for this event")

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

const selectColumns = `
	id, user_id, event_id, registration_id, activity_id, device_id, push_token,
	platform, status, race_status, created_at, updated_at, expires_at, ended_at`

func scan(row pgx.Row) (*LiveActivity, error) {
	var a LiveActivity
	if err := row.Scan(
		&a.ID, &a.UserID, &a.EventID, &a.RegistrationID, &a.ActivityID, &a.DeviceID,
		&a.PushToken, &a.Platform, &a.Status, &a.RaceStatus, &a.CreatedAt, &a.UpdatedAt,
		&a.ExpiresAt, &a.EndedAt,
	); err != nil {
		return nil, err
	}
	return &a, nil
}

// Create inserts a new ACTIVE live activity. Returns ErrDuplicateActive if
// userID already has one for eventID (see the partial unique index).
func (r *Repository) Create(ctx context.Context, userID uuid.UUID, in CreateInput) (*LiveActivity, error) {
	// ActivityKit ends activities after eight hours. Expire an old row before
	// inserting so a delayed worker sweep cannot prevent the user refollowing.
	if _, err := r.pool.Exec(ctx, `
		UPDATE live_activities SET status = 'EXPIRED', updated_at = now()
		WHERE user_id = $1 AND event_id = $2 AND status = 'ACTIVE'
		  AND expires_at <= now()`, userID, in.EventID); err != nil {
		return nil, fmt.Errorf("liveactivities: expire before create: %w", err)
	}
	const query = `
		INSERT INTO live_activities (user_id, event_id, registration_id, activity_id, device_id, push_token, platform, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, now() + interval '8 hours')
		RETURNING ` + selectColumns
	row := r.pool.QueryRow(ctx, query,
		userID, in.EventID, in.RegistrationID, in.ActivityID, in.DeviceID, in.PushToken, in.Platform)
	activity, err := scan(row)
	if err != nil {
		if sqlState(err) == "23505" { // unique_violation
			return nil, ErrDuplicateActive
		}
		return nil, fmt.Errorf("liveactivities: create: %w", err)
	}
	return activity, nil
}

// GetByID fetches one activity regardless of owner; callers enforce
// ownership (see service.go) so a 404-vs-403 distinction doesn't leak
// whether an activity id belonging to someone else exists.
func (r *Repository) GetByID(ctx context.Context, id uuid.UUID) (*LiveActivity, error) {
	activity, err := scan(r.pool.QueryRow(ctx, `SELECT `+selectColumns+` FROM live_activities WHERE id = $1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("liveactivities: get: %w", err)
	}
	return activity, nil
}

// ListActiveForUser returns userID's currently-followed activities, newest first.
func (r *Repository) ListActiveForUser(ctx context.Context, userID uuid.UUID) ([]LiveActivity, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT `+selectColumns+` FROM live_activities
		 WHERE user_id = $1 AND status = 'ACTIVE' AND expires_at > now()
		 ORDER BY created_at DESC`,
		userID)
	if err != nil {
		return nil, fmt.Errorf("liveactivities: list: %w", err)
	}
	defer rows.Close()

	out := []LiveActivity{}
	for rows.Next() {
		activity, err := scan(rows)
		if err != nil {
			return nil, fmt.Errorf("liveactivities: scan: %w", err)
		}
		out = append(out, *activity)
	}
	return out, rows.Err()
}

// UpdateRaceStatus patches the shown race state and/or rotates the push
// token (ActivityKit can reissue a token mid-activity). No-ops that touch
// nothing still bump updated_at so a "restore" poll can tell freshness apart
// from staleness.
func (r *Repository) UpdateRaceStatus(ctx context.Context, id uuid.UUID, in UpdateInput) (*LiveActivity, error) {
	const query = `
		UPDATE live_activities SET
			race_status = COALESCE($2, race_status),
			push_token = COALESCE($3, push_token),
			updated_at = now()
		WHERE id = $1 AND status = 'ACTIVE'
		RETURNING ` + selectColumns
	activity, err := scan(r.pool.QueryRow(ctx, query, id, in.RaceStatus, in.PushToken))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("liveactivities: update: %w", err)
	}
	return activity, nil
}

// End marks an activity ENDED. Idempotent: ending an already-ended activity
// is a no-op success, not an error -- the mobile service layer's `end()` can
// call this without first checking local state.
func (r *Repository) End(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE live_activities SET status = 'ENDED', ended_at = now(), updated_at = now()
		 WHERE id = $1 AND status = 'ACTIVE'`, id)
	if err != nil {
		return fmt.Errorf("liveactivities: end: %w", err)
	}
	return nil
}

// ExpireStale flips ACTIVE rows whose expires_at has passed to EXPIRED --
// see item 13, "expired tokens should not remain active indefinitely." A
// The worker calls this regularly so expired rows cannot block refollowing.
func (r *Repository) ExpireStale(ctx context.Context) (int64, error) {
	tag, err := r.pool.Exec(ctx,
		`UPDATE live_activities SET status = 'EXPIRED', updated_at = now()
		 WHERE status = 'ACTIVE' AND expires_at IS NOT NULL AND expires_at < now()`)
	if err != nil {
		return 0, fmt.Errorf("liveactivities: expire stale: %w", err)
	}
	return tag.RowsAffected(), nil
}

func sqlState(err error) string {
	if err == nil {
		return ""
	}
	type stateError interface{ SQLState() string }
	var pgErr stateError
	if errors.As(err, &pgErr) {
		return pgErr.SQLState()
	}
	return ""
}
