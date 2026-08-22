package http

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"time"
)

const defaultReadyTimeout = 2 * time.Second

// healthResponse is the payload for /health.
type healthResponse struct {
	Status string `json:"status"`
}

// readyResponse is the payload for /ready.
type readyResponse struct {
	Status       string            `json:"status"`
	Dependencies map[string]string `json:"dependencies"`
}

// healthHandler reports liveness only: if the process can respond at
// all, it's healthy. No dependency checks — that's /ready's job.
func healthHandler(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, healthResponse{Status: "ok"})
}

// readyHandler reports readiness by pinging PostgreSQL and Redis
// concurrently, each bounded by deps.ReadyTimeout. Returns 200 only
// if every configured dependency responds; 503 otherwise, with a
// per-dependency breakdown.
func readyHandler(deps Deps) http.HandlerFunc {
	timeout := deps.ReadyTimeout
	if timeout <= 0 {
		timeout = defaultReadyTimeout
	}

	return func(w http.ResponseWriter, r *http.Request) {
		checks := map[string]Pinger{
			"postgres": deps.DB,
			"redis":    deps.Redis,
		}

		results := make(map[string]string, len(checks))
		allHealthy := true

		var mu sync.Mutex
		var wg sync.WaitGroup

		for name, pinger := range checks {
			if pinger == nil {
				// Guard with mu even though no goroutines are racing on
				// this particular key yet — writes to the same map from
				// the main goroutine and worker goroutines below must
				// still be synchronized, since Go maps aren't safe for
				// any concurrent access regardless of key.
				mu.Lock()
				results[name] = "not_configured"
				mu.Unlock()
				continue
			}

			wg.Add(1)
			go func(name string, pinger Pinger) {
				defer wg.Done()

				ctx, cancel := context.WithTimeout(r.Context(), timeout)
				defer cancel()

				status := "ok"
				if err := pinger.Ping(ctx); err != nil {
					status = "unhealthy"
				}

				mu.Lock()
				results[name] = status
				if status != "ok" {
					allHealthy = false
				}
				mu.Unlock()
			}(name, pinger)
		}

		wg.Wait()

		resp := readyResponse{Dependencies: results}
		if allHealthy {
			resp.Status = "ok"
			writeJSON(w, http.StatusOK, resp)
			return
		}

		resp.Status = "unavailable"
		writeJSON(w, http.StatusServiceUnavailable, resp)
	}
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
