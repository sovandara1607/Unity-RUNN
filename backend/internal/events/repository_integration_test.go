//go:build integration

package events

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// testPool opens a pool against DATABASE_URL (the docker-compose
// Postgres) and truncates event tables before each test so tests
// don't interfere with each other.
func testPool(t *testing.T) *pgxpool.Pool {
	t.Helper()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set; skipping integration test")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect to database: %v", err)
	}
	t.Cleanup(pool.Close)

	if _, err := pool.Exec(ctx, `TRUNCATE TABLE events CASCADE`); err != nil {
		t.Fatalf("truncate events: %v", err)
	}

	return pool
}

func testEvent(name, slug string) *Event {
	return &Event{
		Name:      name,
		Slug:      slug,
		EventDate: time.Date(2025, 12, 6, 0, 0, 0, 0, time.UTC),
		StartTime: time.Date(0, 1, 1, 6, 0, 0, 0, time.UTC),
		Status:    StatusDraft,
	}
}

func TestRepository_CreateAndGetByID(t *testing.T) {
	pool := testPool(t)
	repo := NewRepository(pool)
	ctx := context.Background()

	e := testEvent("Founders Run", "founders-run")
	if err := repo.Create(ctx, e); err != nil {
		t.Fatalf("Create() error = %v", err)
	}
	if e.ID.String() == "" {
		t.Fatal("expected ID to be populated after Create")
	}

	got, err := repo.GetByID(ctx, e.ID)
	if err != nil {
		t.Fatalf("GetByID() error = %v", err)
	}
	if got.Slug != "founders-run" {
		t.Errorf("Slug = %q, want %q", got.Slug, "founders-run")
	}
}

func TestRepository_GetByID_NotFound(t *testing.T) {
	pool := testPool(t)
	repo := NewRepository(pool)

	_, err := repo.GetByID(context.Background(), testEvent("x", "x").ID)
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("GetByID() error = %v, want ErrNotFound", err)
	}
}

func TestRepository_SlugExists(t *testing.T) {
	pool := testPool(t)
	repo := NewRepository(pool)
	ctx := context.Background()

	e := testEvent("Founders Run", "founders-run")
	if err := repo.Create(ctx, e); err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	exists, err := repo.SlugExists(ctx, "founders-run", nil)
	if err != nil {
		t.Fatalf("SlugExists() error = %v", err)
	}
	if !exists {
		t.Error("expected slug to exist")
	}

	exists, err = repo.SlugExists(ctx, "founders-run", &e.ID)
	if err != nil {
		t.Fatalf("SlugExists() error = %v", err)
	}
	if exists {
		t.Error("expected slug to be excluded for its own ID")
	}
}

func TestRepository_Update(t *testing.T) {
	pool := testPool(t)
	repo := NewRepository(pool)
	ctx := context.Background()

	e := testEvent("Founders Run", "founders-run")
	if err := repo.Create(ctx, e); err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	e.Status = StatusPublished
	if err := repo.Update(ctx, e); err != nil {
		t.Fatalf("Update() error = %v", err)
	}

	got, err := repo.GetByID(ctx, e.ID)
	if err != nil {
		t.Fatalf("GetByID() error = %v", err)
	}
	if got.Status != StatusPublished {
		t.Errorf("Status = %q, want %q", got.Status, StatusPublished)
	}
}

func TestRepository_DeleteCascadesChildRows(t *testing.T) {
	pool := testPool(t)
	repo := NewRepository(pool)
	ctx := context.Background()

	e := testEvent("Founders Run", "founders-run")
	if err := repo.Create(ctx, e); err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	if _, err := pool.Exec(ctx,
		`INSERT INTO event_categories (event_id, name, distance, price_cents, capacity)
		 VALUES ($1, '5K', '5K', 500000, 100)`, e.ID); err != nil {
		t.Fatalf("insert category: %v", err)
	}

	if err := repo.Delete(ctx, e.ID); err != nil {
		t.Fatalf("Delete() error = %v", err)
	}

	var count int
	if err := pool.QueryRow(ctx,
		`SELECT count(*) FROM event_categories WHERE event_id = $1`, e.ID).Scan(&count); err != nil {
		t.Fatalf("count categories: %v", err)
	}
	if count != 0 {
		t.Errorf("expected cascade delete to remove child categories, found %d", count)
	}
}

func TestRepository_GetDetailBySlug_IncludesChildren(t *testing.T) {
	pool := testPool(t)
	repo := NewRepository(pool)
	ctx := context.Background()

	e := testEvent("Founders Run", "founders-run")
	if err := repo.Create(ctx, e); err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	if _, err := pool.Exec(ctx,
		`INSERT INTO event_categories (event_id, name, distance, price_cents, capacity)
		 VALUES ($1, '5K', '5K', 500000, 100)`, e.ID); err != nil {
		t.Fatalf("insert category: %v", err)
	}
	if _, err := pool.Exec(ctx,
		`INSERT INTO event_faqs (event_id, question, answer) VALUES ($1, 'Q?', 'A.')`, e.ID); err != nil {
		t.Fatalf("insert faq: %v", err)
	}

	detail, err := repo.GetDetailBySlug(ctx, "founders-run")
	if err != nil {
		t.Fatalf("GetDetailBySlug() error = %v", err)
	}
	if len(detail.Categories) != 1 {
		t.Errorf("Categories = %d, want 1", len(detail.Categories))
	}
	if len(detail.FAQs) != 1 {
		t.Errorf("FAQs = %d, want 1", len(detail.FAQs))
	}
}

func TestRepository_List_FiltersByStatus(t *testing.T) {
	pool := testPool(t)
	repo := NewRepository(pool)
	ctx := context.Background()

	draft := testEvent("Draft Event", "draft-event")
	if err := repo.Create(ctx, draft); err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	published := testEvent("Published Event", "published-event")
	published.Status = StatusPublished
	if err := repo.Create(ctx, published); err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	events, total, err := repo.List(ctx, ListFilter{Limit: 10})
	if err != nil {
		t.Fatalf("List() error = %v", err)
	}
	if total != 1 {
		t.Fatalf("total = %d, want 1 (only public statuses)", total)
	}
	if len(events) != 1 || events[0].Slug != "published-event" {
		t.Errorf("events = %+v, want only published-event", events)
	}
}
