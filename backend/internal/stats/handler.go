package stats

import (
	"context"
	"fmt"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/unity-run-club/api/internal/httpresponse"
)

type Summary struct {
	OpenEvents       int `json:"open_events"`
	ConfirmedRunners int `json:"confirmed_runners"`
	Locations        int `json:"locations"`
}

type AdminSummary struct {
	TotalEvents            int `json:"total_events"`
	ActiveEvents           int `json:"active_events"`
	TotalRegistrations     int `json:"total_registrations"`
	ConfirmedRegistrations int `json:"confirmed_registrations"`
	TotalRevenueCents      int `json:"total_revenue_cents"`
	TotalCheckedIn         int `json:"total_checked_in"`
}

type reader interface {
	Summary(ctx context.Context) (Summary, error)
	AdminSummary(ctx context.Context) (AdminSummary, error)
}

func (r *Repository) AdminSummary(ctx context.Context) (AdminSummary, error) {
	const query = `
		SELECT
			(SELECT COUNT(*) FROM events),
			(SELECT COUNT(*) FROM events WHERE status IN ('PUBLISHED', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED')),
			(SELECT COUNT(*) FROM registrations),
			(SELECT COUNT(*) FROM registrations WHERE status = 'CONFIRMED'),
			(SELECT COALESCE(SUM(amount_cents), 0) FROM payments WHERE status = 'SUCCEEDED'),
			(SELECT COUNT(*) FROM check_ins)`

	var summary AdminSummary
	if err := r.pool.QueryRow(ctx, query).Scan(
		&summary.TotalEvents,
		&summary.ActiveEvents,
		&summary.TotalRegistrations,
		&summary.ConfirmedRegistrations,
		&summary.TotalRevenueCents,
		&summary.TotalCheckedIn,
	); err != nil {
		return AdminSummary{}, fmt.Errorf("stats: admin summary: %w", err)
	}
	return summary, nil
}

// Repository reads live aggregates from PostgreSQL.
type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func (r *Repository) Summary(ctx context.Context) (Summary, error) {
	const query = `
		SELECT
			COUNT(*) FILTER (WHERE status = 'REGISTRATION_OPEN'),
			COUNT(DISTINCT NULLIF(BTRIM(location), '')) FILTER (
				WHERE status IN ('PUBLISHED', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'COMPLETED')
			),
			(
				SELECT COUNT(*)
				FROM registrations r
				JOIN events e ON e.id = r.event_id
				WHERE r.status = 'CONFIRMED'
				  AND e.status IN ('PUBLISHED', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'COMPLETED')
			)
		FROM events`

	var summary Summary
	if err := r.pool.QueryRow(ctx, query).Scan(
		&summary.OpenEvents,
		&summary.Locations,
		&summary.ConfirmedRunners,
	); err != nil {
		return Summary{}, fmt.Errorf("stats: summary: %w", err)
	}
	return summary, nil
}

// Handler serves the public club summary endpoint.
type Handler struct {
	repo reader
}

func NewHandler(repo reader) *Handler {
	return &Handler{repo: repo}
}

func (h *Handler) Summary(w http.ResponseWriter, r *http.Request) {
	summary, err := h.repo.Summary(r.Context())
	if err != nil {
		httpresponse.WriteError(w, http.StatusInternalServerError, "internal_error", "failed to load club stats")
		return
	}
	httpresponse.WriteData(w, http.StatusOK, summary)
}

func (h *Handler) AdminSummary(w http.ResponseWriter, r *http.Request) {
	summary, err := h.repo.AdminSummary(r.Context())
	if err != nil {
		httpresponse.WriteError(w, http.StatusInternalServerError, "internal_error", "failed to load admin stats")
		return
	}
	httpresponse.WriteData(w, http.StatusOK, summary)
}
