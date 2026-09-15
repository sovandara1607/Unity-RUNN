-- +goose Up
-- The registration capacity check (see internal/registrations/repository.go's
-- Create() and CountActive()) filters on event_category_id + status while
-- holding a FOR UPDATE lock on the category row, so an unindexed scan here
-- serializes every concurrent registration attempt for that category behind
-- it. Verified via EXPLAIN ANALYZE against 38k synthetic rows: Seq Scan
-- (2.47ms) before this index, Index Only Scan (0.26ms) after.
CREATE INDEX idx_registrations_category_active
    ON registrations (event_category_id)
    WHERE status IN ('PENDING', 'CONFIRMED');

-- +goose Down
DROP INDEX idx_registrations_category_active;
