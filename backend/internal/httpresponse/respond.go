// Package httpresponse provides the shared JSON response envelope
// used across every HTTP domain package, so handlers in events, auth,
// and future domains all respond in the same shape:
// {"data": ...} on success, {"error": {"code": ..., "message": ...}}
// on failure.
package httpresponse

import (
	"encoding/json"
	"net/http"
)

// WriteData writes a successful JSON response wrapped in {"data": ...}.
func WriteData(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"data": data})
}

// WriteError writes an error JSON response wrapped in
// {"error": {"code": ..., "message": ...}}.
func WriteError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"error": map[string]string{"code": code, "message": message},
	})
}
