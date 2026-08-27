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

func GenerateRaw() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("tokenhash: generate: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}
