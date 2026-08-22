package events

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrNotFound is returned when an event (or its detail) doesn't exist.
var ErrNotFound = errors.New("events: not found")

// Repository persists events and their child collections in
// PostgreSQL. No business rules live here — only SQL.
type Repository struct {
	pool *pgxpool.Pool
}

// NewRepository builds a Repository backed by pool.
func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// List returns events matching filter, ordered by event_date ascending,
// plus the total matching count (ignoring limit/offset) for pagination.
func (r *Repository) List(ctx context.Context, filter ListFilter) ([]Event, int, error) {
	statuses := filter.Statuses
	if len(statuses) == 0 {
		for s := range publicStatuses {
			statuses = append(statuses, s)
		}
	}

	statusStrs := make([]string, len(statuses))
	for i, s := range statuses {
		statusStrs[i] = string(s)
	}

	const countQuery = `SELECT count(*) FROM events WHERE status = ANY($1)`
	var total int
	if err := r.pool.QueryRow(ctx, countQuery, statusStrs).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("events: count: %w", err)
	}

	const listQuery = `
		SELECT id, name, slug, description, cover_image, event_date, start_time,
		       location, latitude, longitude, registration_open_at, registration_close_at,
		       status, created_at, updated_at
		FROM events
		WHERE status = ANY($1)
		ORDER BY event_date ASC
		LIMIT $2 OFFSET $3`

	rows, err := r.pool.Query(ctx, listQuery, statusStrs, filter.Limit, filter.Offset)
	if err != nil {
		return nil, 0, fmt.Errorf("events: list: %w", err)
	}
	defer rows.Close()

	var out []Event
	for rows.Next() {
		e, err := scanEvent(rows)
		if err != nil {
			return nil, 0, fmt.Errorf("events: scan: %w", err)
		}
		out = append(out, e)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("events: list rows: %w", err)
	}

	return out, total, nil
}

// GetByID fetches a single event by ID.
func (r *Repository) GetByID(ctx context.Context, id uuid.UUID) (*Event, error) {
	const query = `
		SELECT id, name, slug, description, cover_image, event_date, start_time,
		       location, latitude, longitude, registration_open_at, registration_close_at,
		       status, created_at, updated_at
		FROM events WHERE id = $1`

	row := r.pool.QueryRow(ctx, query, id)
	e, err := scanEvent(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("events: get by id: %w", err)
	}
	return &e, nil
}

// GetDetailBySlug fetches an event and its full child collections by slug.
func (r *Repository) GetDetailBySlug(ctx context.Context, slug string) (*EventDetail, error) {
	const query = `
		SELECT id, name, slug, description, cover_image, event_date, start_time,
		       location, latitude, longitude, registration_open_at, registration_close_at,
		       status, created_at, updated_at
		FROM events WHERE slug = $1`

	row := r.pool.QueryRow(ctx, query, slug)
	e, err := scanEvent(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("events: get detail by slug: %w", err)
	}

	detail := &EventDetail{Event: e}

	if detail.Categories, err = r.listCategories(ctx, e.ID); err != nil {
		return nil, err
	}
	if detail.Schedule, err = r.listSchedule(ctx, e.ID); err != nil {
		return nil, err
	}
	if detail.FAQs, err = r.listFAQs(ctx, e.ID); err != nil {
		return nil, err
	}
	if detail.Rules, err = r.listRules(ctx, e.ID); err != nil {
		return nil, err
	}

	return detail, nil
}

// SlugExists reports whether slug is already used by another event
// (excluding excludeID, if non-nil — used when updating an event).
func (r *Repository) SlugExists(ctx context.Context, slug string, excludeID *uuid.UUID) (bool, error) {
	var exists bool
	var err error
	if excludeID != nil {
		err = r.pool.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM events WHERE slug = $1 AND id != $2)`,
			slug, *excludeID).Scan(&exists)
	} else {
		err = r.pool.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM events WHERE slug = $1)`, slug).Scan(&exists)
	}
	if err != nil {
		return false, fmt.Errorf("events: slug exists: %w", err)
	}
	return exists, nil
}

// Create inserts a new event, populating e.ID/CreatedAt/UpdatedAt.
func (r *Repository) Create(ctx context.Context, e *Event) error {
	const query = `
		INSERT INTO events (name, slug, description, cover_image, event_date, start_time,
		                     location, latitude, longitude, registration_open_at,
		                     registration_close_at, status)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
		RETURNING id, created_at, updated_at`

	return r.pool.QueryRow(ctx, query,
		e.Name, e.Slug, e.Description, e.CoverImage, e.EventDate, e.StartTime,
		e.Location, e.Latitude, e.Longitude, e.RegistrationOpenAt,
		e.RegistrationCloseAt, e.Status,
	).Scan(&e.ID, &e.CreatedAt, &e.UpdatedAt)
}

// Update overwrites all mutable columns of the event identified by
// e.ID, refreshing UpdatedAt. Callers (the service layer) are
// responsible for fetch-modify-save semantics.
func (r *Repository) Update(ctx context.Context, e *Event) error {
	const query = `
		UPDATE events SET
			name = $1, slug = $2, description = $3, cover_image = $4,
			event_date = $5, start_time = $6, location = $7, latitude = $8,
			longitude = $9, registration_open_at = $10, registration_close_at = $11,
			status = $12, updated_at = now()
		WHERE id = $13
		RETURNING updated_at`

	err := r.pool.QueryRow(ctx, query,
		e.Name, e.Slug, e.Description, e.CoverImage, e.EventDate, e.StartTime,
		e.Location, e.Latitude, e.Longitude, e.RegistrationOpenAt,
		e.RegistrationCloseAt, e.Status, e.ID,
	).Scan(&e.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("events: update: %w", err)
	}
	return nil
}

// Delete removes an event by ID. Child rows cascade via FK.
func (r *Repository) Delete(ctx context.Context, id uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM events WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("events: delete: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanEvent(row rowScanner) (Event, error) {
	var e Event
	err := row.Scan(
		&e.ID, &e.Name, &e.Slug, &e.Description, &e.CoverImage, &e.EventDate, &e.StartTime,
		&e.Location, &e.Latitude, &e.Longitude, &e.RegistrationOpenAt, &e.RegistrationCloseAt,
		&e.Status, &e.CreatedAt, &e.UpdatedAt,
	)
	return e, err
}

func (r *Repository) listCategories(ctx context.Context, eventID uuid.UUID) ([]EventCategory, error) {
	const query = `
		SELECT id, event_id, name, distance, price_cents, capacity,
		       registration_deadline, status, created_at, updated_at
		FROM event_categories WHERE event_id = $1 ORDER BY created_at ASC`

	rows, err := r.pool.Query(ctx, query, eventID)
	if err != nil {
		return nil, fmt.Errorf("events: list categories: %w", err)
	}
	defer rows.Close()

	var out []EventCategory
	for rows.Next() {
		var c EventCategory
		if err := rows.Scan(&c.ID, &c.EventID, &c.Name, &c.Distance, &c.PriceCents,
			&c.Capacity, &c.RegistrationDeadline, &c.Status, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, fmt.Errorf("events: scan category: %w", err)
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *Repository) listSchedule(ctx context.Context, eventID uuid.UUID) ([]EventSchedule, error) {
	const query = `
		SELECT id, event_id, time, title, description, sort_order, created_at, updated_at
		FROM event_schedules WHERE event_id = $1 ORDER BY sort_order ASC, time ASC`

	rows, err := r.pool.Query(ctx, query, eventID)
	if err != nil {
		return nil, fmt.Errorf("events: list schedule: %w", err)
	}
	defer rows.Close()

	var out []EventSchedule
	for rows.Next() {
		var s EventSchedule
		if err := rows.Scan(&s.ID, &s.EventID, &s.Time, &s.Title, &s.Description,
			&s.SortOrder, &s.CreatedAt, &s.UpdatedAt); err != nil {
			return nil, fmt.Errorf("events: scan schedule: %w", err)
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (r *Repository) listFAQs(ctx context.Context, eventID uuid.UUID) ([]EventFAQ, error) {
	const query = `
		SELECT id, event_id, question, answer, sort_order, created_at, updated_at
		FROM event_faqs WHERE event_id = $1 ORDER BY sort_order ASC`

	rows, err := r.pool.Query(ctx, query, eventID)
	if err != nil {
		return nil, fmt.Errorf("events: list faqs: %w", err)
	}
	defer rows.Close()

	var out []EventFAQ
	for rows.Next() {
		var f EventFAQ
		if err := rows.Scan(&f.ID, &f.EventID, &f.Question, &f.Answer,
			&f.SortOrder, &f.CreatedAt, &f.UpdatedAt); err != nil {
			return nil, fmt.Errorf("events: scan faq: %w", err)
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

func (r *Repository) listRules(ctx context.Context, eventID uuid.UUID) ([]EventRule, error) {
	const query = `
		SELECT id, event_id, rule, sort_order, created_at, updated_at
		FROM event_rules WHERE event_id = $1 ORDER BY sort_order ASC`

	rows, err := r.pool.Query(ctx, query, eventID)
	if err != nil {
		return nil, fmt.Errorf("events: list rules: %w", err)
	}
	defer rows.Close()

	var out []EventRule
	for rows.Next() {
		var ru EventRule
		if err := rows.Scan(&ru.ID, &ru.EventID, &ru.Rule, &ru.SortOrder,
			&ru.CreatedAt, &ru.UpdatedAt); err != nil {
			return nil, fmt.Errorf("events: scan rule: %w", err)
		}
		out = append(out, ru)
	}
	return out, rows.Err()
}
