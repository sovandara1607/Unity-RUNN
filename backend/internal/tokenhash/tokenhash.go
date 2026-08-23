// Package tokenhash provides the one hashing scheme used everywhere a
// raw secret token (refresh tokens, QR ticket tokens) needs to be
// looked up without ever persisting the raw value: SHA-256, hex
// encoded. Shared so internal/registrations (issuance) and
// internal/checkin (verification) can't drift into different
// schemes.
package tokenhash

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
)

// Hash returns the hex-encoded SHA-256 hash of raw.
func Hash(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

// GenerateRaw returns a new cryptographically random, URL-safe raw
// token suitable for QR/refresh-token issuance.
func GenerateRaw() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("tokenhash: generate: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}
