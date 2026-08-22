package auth

import (
	"testing"

	"golang.org/x/crypto/bcrypt"
)

func TestHashAndVerifyPassword(t *testing.T) {
	hash, err := HashPassword("correct-horse-battery-staple", bcrypt.MinCost)
	if err != nil {
		t.Fatalf("HashPassword() error = %v", err)
	}

	if !VerifyPassword(hash, "correct-horse-battery-staple") {
		t.Error("VerifyPassword() = false for correct password, want true")
	}
	if VerifyPassword(hash, "wrong-password") {
		t.Error("VerifyPassword() = true for wrong password, want false")
	}
}
