package auditlog

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Repository persists audit log entries in PostgreSQL.
type Repository struct {
	pool *pgxpool.Pool
}

// NewRepository builds a Repository backed by pool.
func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// Insert records e, populating e.ID/CreatedAt.
func (r *Repository) Insert(ctx context.Context, e *Entry) error {
	metadata := e.Metadata
	if metadata == nil {
		metadata = map[string]any{}
	}
	raw, err := json.Marshal(metadata)
	if err != nil {
		return fmt.Errorf("auditlog: encode metadata: %w", err)
	}

	const query = `
		INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata)
		VALUES ($1,$2,$3,$4,$5)
		RETURNING id, created_at`
	return r.pool.QueryRow(ctx, query, e.ActorID, e.Action, e.EntityType, e.EntityID, raw).
		Scan(&e.ID, &e.CreatedAt)
}

// ListFilter narrows a List query.
type ListFilter struct {
	EntityType string
	Limit      int
	Offset     int
}

// List returns audit log entries, most recent first, optionally
// filtered by entity_type — for the admin audit trail view.
func (r *Repository) List(ctx context.Context, filter ListFilter) ([]Entry, error) {
	where := "WHERE 1=1"
	args := []any{}
	if filter.EntityType != "" {
		where += fmt.Sprintf(" AND entity_type = $%d", len(args)+1)
		args = append(args, filter.EntityType)
	}

	limit := filter.Limit
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	args = append(args, limit, filter.Offset)

	query := fmt.Sprintf(`
		SELECT id, actor_id, action, entity_type, entity_id, metadata, created_at
		FROM audit_logs %s
		ORDER BY created_at DESC
		LIMIT $%d OFFSET $%d`, where, len(args)-1, len(args))

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("auditlog: list: %w", err)
	}
	defer rows.Close()

	var out []Entry
	for rows.Next() {
		var e Entry
		var raw []byte
		if err := rows.Scan(&e.ID, &e.ActorID, &e.Action, &e.EntityType, &e.EntityID, &raw, &e.CreatedAt); err != nil {
			return nil, fmt.Errorf("auditlog: scan: %w", err)
		}
		if err := json.Unmarshal(raw, &e.Metadata); err != nil {
			return nil, fmt.Errorf("auditlog: decode metadata: %w", err)
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// ListByEntity returns audit log entries for one entity, most recent
// first — for a future admin UI (e.g. a registration's history).
func (r *Repository) ListByEntity(ctx context.Context, entityType string, entityID uuid.UUID) ([]Entry, error) {
	const query = `
		SELECT id, actor_id, action, entity_type, entity_id, metadata, created_at
		FROM audit_logs WHERE entity_type = $1 AND entity_id = $2
		ORDER BY created_at DESC`

	rows, err := r.pool.Query(ctx, query, entityType, entityID)
	if err != nil {
		return nil, fmt.Errorf("auditlog: list by entity: %w", err)
	}
	defer rows.Close()

	var out []Entry
	for rows.Next() {
		var e Entry
		var raw []byte
		if err := rows.Scan(&e.ID, &e.ActorID, &e.Action, &e.EntityType, &e.EntityID, &raw, &e.CreatedAt); err != nil {
			return nil, fmt.Errorf("auditlog: scan: %w", err)
		}
		if err := json.Unmarshal(raw, &e.Metadata); err != nil {
			return nil, fmt.Errorf("auditlog: decode metadata: %w", err)
		}
		out = append(out, e)
	}
	return out, rows.Err()
}
