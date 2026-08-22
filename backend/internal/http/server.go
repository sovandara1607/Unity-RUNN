package http

import (
	"context"
	"net/http"
	"time"
)

// Server wraps *http.Server with sensible defaults and graceful
// shutdown support.
type Server struct {
	httpServer *http.Server
}

// NewServer builds a Server bound to addr (":8080" style) serving
// handler, with conservative timeouts suitable for a REST API.
func NewServer(addr string, handler http.Handler) *Server {
	return &Server{
		httpServer: &http.Server{
			Addr:              addr,
			Handler:           handler,
			ReadHeaderTimeout: 5 * time.Second,
			ReadTimeout:       15 * time.Second,
			WriteTimeout:      15 * time.Second,
			IdleTimeout:       60 * time.Second,
		},
	}
}

// Start begins serving and blocks until the server stops or errors.
// It returns http.ErrServerClosed on a clean Shutdown, which callers
// should treat as a non-error termination.
func (s *Server) Start() error {
	return s.httpServer.ListenAndServe()
}

// Shutdown gracefully stops the server, waiting for in-flight
// requests to complete within ctx's deadline.
func (s *Server) Shutdown(ctx context.Context) error {
	return s.httpServer.Shutdown(ctx)
}
