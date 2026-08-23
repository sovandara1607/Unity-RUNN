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
