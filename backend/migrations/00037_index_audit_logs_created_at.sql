-- +goose Up
-- audit_logs only had indexes on (entity_type, entity_id) and (actor_id) --
-- neither serves the default admin view (List() with no entity_type filter,
-- see internal/auditlog/repository.go), which sorts the whole table by
-- created_at DESC on every load. This table has no natural size cap (every
-- registration, cancellation, and role change inserts a row), so the scan
-- gets slower forever as history accumulates. Verified via EXPLAIN ANALYZE
-- against 500k synthetic rows: Parallel Seq Scan (16.9ms) before this index,
-- plain Index Scan (0.11ms) after -- it also speeds up the entity_type-
-- filtered variant since Postgres can walk newest-first and filter as it goes.
CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at DESC);

-- +goose Down
DROP INDEX idx_audit_logs_created_at;
