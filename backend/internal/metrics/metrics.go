// Package metrics defines the Prometheus counters/histograms/gauges this
// service exposes, and MustRegister wires them onto the default registry.
//
// Deliberate cardinality guard: no metric here is labeled by user_id,
// event_id, registration_id, or any other per-entity identifier. A handful
// of users/events is fine; thousands of distinct label values per metric
// is a well-known way to make Prometheus fall over. Route labels use the
// chi route *pattern* (e.g. "/events/{id}"), never the raw request path.
package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
)

var (
	// HTTP
	HTTPRequestsTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "http_requests_total",
		Help: "Total HTTP requests, labeled by method, route pattern and status class.",
	}, []string{"method", "route", "status"})

	HTTPRequestDuration = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "http_request_duration_seconds",
		Help:    "HTTP request latency in seconds, labeled by method and route pattern.",
		Buckets: prometheus.DefBuckets,
	}, []string{"method", "route"})

	// Registration
	RegistrationAttemptTotal = prometheus.NewCounter(prometheus.CounterOpts{
		Name: "registration_attempt_total",
		Help: "Total calls into Service.Register, before any validation.",
	})
	RegistrationSuccessTotal = prometheus.NewCounter(prometheus.CounterOpts{
		Name: "registration_success_total",
		Help: "Registrations that completed successfully (free-confirmed or paid-checkout-created).",
	})
	RegistrationSoldOutTotal = prometheus.NewCounter(prometheus.CounterOpts{
		Name: "registration_sold_out_total",
		Help: "Registration attempts rejected because the category was at capacity.",
	})
	RegistrationConflictTotal = prometheus.NewCounter(prometheus.CounterOpts{
		Name: "registration_conflict_total",
		Help: "Registration attempts rejected because the caller already had an active registration.",
	})

	// Payments
	PaymentSuccessTotal = prometheus.NewCounter(prometheus.CounterOpts{
		Name: "payment_success_total",
		Help: "Payments confirmed (via poll or the leased background reconciler).",
	})
	PaymentFailureTotal = prometheus.NewCounter(prometheus.CounterOpts{
		Name: "payment_failure_total",
		Help: "Payments that ended in failure or expiry.",
	})

	// Database pool
	DBPoolAcquiredConns = prometheus.NewGauge(prometheus.GaugeOpts{
		Name: "db_pool_acquired_conns",
		Help: "Connections currently checked out of the pgx pool.",
	})
	DBPoolIdleConns = prometheus.NewGauge(prometheus.GaugeOpts{
		Name: "db_pool_idle_conns",
		Help: "Idle connections currently held by the pgx pool.",
	})

	// Redis
	RedisHitsTotal = prometheus.NewCounter(prometheus.CounterOpts{
		Name: "redis_cache_hits_total",
		Help: "Availability-cache reads served from Redis.",
	})
	RedisMissesTotal = prometheus.NewCounter(prometheus.CounterOpts{
		Name: "redis_cache_misses_total",
		Help: "Availability-cache reads that fell through to PostgreSQL.",
	})

	// Background workers
	NotificationQueueDepth = prometheus.NewGauge(prometheus.GaugeOpts{
		Name: "notification_queue_depth",
		Help: "Approximate length of the Redis notification queue list.",
	})
	WorkerFailuresTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "worker_failures_total",
		Help: "Background worker iterations that logged an error, labeled by worker name.",
	}, []string{"worker"})
)

// MustRegister registers every metric above on the default Prometheus
// registry. Call once at process startup.
func MustRegister() {
	prometheus.MustRegister(
		HTTPRequestsTotal,
		HTTPRequestDuration,
		RegistrationAttemptTotal,
		RegistrationSuccessTotal,
		RegistrationSoldOutTotal,
		RegistrationConflictTotal,
		PaymentSuccessTotal,
		PaymentFailureTotal,
		DBPoolAcquiredConns,
		DBPoolIdleConns,
		RedisHitsTotal,
		RedisMissesTotal,
		NotificationQueueDepth,
		WorkerFailuresTotal,
	)
}
