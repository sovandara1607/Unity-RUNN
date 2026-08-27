package http

import (
	"context"
	"net/http"
	"time"
)

// Server wraps it with sensible defaults and gracefull shutdown support
type Server struct {
	httpServer *http.Server
}

// NewServer builds a Server bound to addr serving handler with conservative timeouts suitable for current REST API WORKLOAD
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

// Server starts serving and blocks until the server is listen and serve
func (s *Server) Start() error {
	return s.httpServer.ListenAndServe()
}

// Server shutdown if the context is error
func (s *Server) Shutdown(ctx context.Context) error {
	return s.httpServer.Shutdown(ctx)
}
