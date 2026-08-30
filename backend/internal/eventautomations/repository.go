package eventautomations

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("event automation not found")
var ErrImmutable = errors.New("sent or cancelled automation cannot be changed")

type Repository struct{ pool *pgxpool.Pool }

func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

const automationColumns = `id,event_id,name,message,send_at,status,sent_count,attempts,last_error,created_by,created_at,sent_at,updated_at`

func scanAutomation(row pgx.Row) (*Automation, error) {
	var a Automation
	err := row.Scan(&a.ID, &a.EventID, &a.Name, &a.Message, &a.SendAt, &a.Status, &a.SentCount, &a.Attempts, &a.LastError, &a.CreatedBy, &a.CreatedAt, &a.SentAt, &a.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &a, err
}

func (r *Repository) List(ctx context.Context, eventID uuid.UUID) ([]Automation, error) {
	rows, err := r.pool.Query(ctx, `SELECT `+automationColumns+` FROM event_automations WHERE event_id=$1 ORDER BY created_at DESC`, eventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Automation{}
	for rows.Next() {
		a, err := scanAutomation(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, *a)
	}
	return items, rows.Err()
}

func (r *Repository) Create(ctx context.Context, a *Automation) error {
	return r.pool.QueryRow(ctx, `INSERT INTO event_automations(event_id,name,message,send_at,status,created_by)
		VALUES($1,$2,$3,$4,$5,$6) RETURNING id,created_at,updated_at`, a.EventID, a.Name, a.Message, a.SendAt, a.Status, a.CreatedBy).
		Scan(&a.ID, &a.CreatedAt, &a.UpdatedAt)
}

func (r *Repository) Update(ctx context.Context, eventID, id uuid.UUID, name, message string, sendAt *time.Time, status Status) (*Automation, error) {
	a, err := scanAutomation(r.pool.QueryRow(ctx, `UPDATE event_automations SET name=$3,message=$4,send_at=$5,status=$6,
		attempts=CASE WHEN status='FAILED' THEN 0 ELSE attempts END,last_error=CASE WHEN status='FAILED' THEN '' ELSE last_error END,
		next_attempt_at=now(),updated_at=now() WHERE id=$1 AND event_id=$2 AND status IN ('DRAFT','SCHEDULED','FAILED')
		RETURNING `+automationColumns, id, eventID, name, message, sendAt, status))
	if errors.Is(err, ErrNotFound) {
		return nil, r.classifyMissingMutation(ctx, eventID, id)
	}
	return a, err
}

func (r *Repository) Cancel(ctx context.Context, eventID, id uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `UPDATE event_automations SET status='CANCELLED',updated_at=now() WHERE id=$1 AND event_id=$2 AND status IN ('DRAFT','SCHEDULED','FAILED')`, id, eventID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return r.classifyMissingMutation(ctx, eventID, id)
	}
	return nil
}

func (r *Repository) classifyMissingMutation(ctx context.Context, eventID, id uuid.UUID) error {
	var exists bool
	err := r.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM event_automations WHERE id=$1 AND event_id=$2)`, id, eventID).Scan(&exists)
	if err != nil {
		return err
	}
	if exists {
		return ErrImmutable
	}
	return ErrNotFound
}

func (r *Repository) ClaimDue(ctx context.Context, limit int) ([]Automation, error) {
	rows, err := r.pool.Query(ctx, `WITH due AS (SELECT id FROM event_automations WHERE
		(status='SCHEDULED' AND send_at<=now() AND next_attempt_at<=now()) OR (status='PROCESSING' AND locked_at<now()-interval '5 minutes')
		ORDER BY send_at LIMIT $1 FOR UPDATE SKIP LOCKED)
		UPDATE event_automations a SET status='PROCESSING',locked_at=now(),updated_at=now() FROM due WHERE a.id=due.id RETURNING `+automationColumns, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Automation{}
	for rows.Next() {
		a, err := scanAutomation(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, *a)
	}
	return items, rows.Err()
}

func (r *Repository) MarkSent(ctx context.Context, id uuid.UUID, count int) error {
	_, err := r.pool.Exec(ctx, `UPDATE event_automations SET status='SENT',sent_count=$2,sent_at=now(),locked_at=NULL,last_error='',updated_at=now() WHERE id=$1`, id, count)
	return err
}
func (r *Repository) RecordFailure(ctx context.Context, id uuid.UUID, cause string, maxAttempts int) error {
	_, err := r.pool.Exec(ctx, `UPDATE event_automations SET attempts=attempts+1,last_error=$2,locked_at=NULL,
		status=CASE WHEN attempts+1 >= $3 THEN 'FAILED' ELSE 'SCHEDULED' END,
		next_attempt_at=now()+(LEAST(POWER(2,attempts),60)::int*interval '1 minute'),updated_at=now() WHERE id=$1`, id, cause, maxAttempts)
	if err != nil {
		return fmt.Errorf("record automation failure: %w", err)
	}
	return nil
}
