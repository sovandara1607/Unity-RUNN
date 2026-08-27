package auth

import "golang.org/x/crypto/bcrypt"

// HashPassword hashes a plaintext password with bcrypt at the given cost (use bcrypt.DefaultCost or higher in production; tests can pass bcrypt.MinCost for speed)
func HashPassword(password string, cost int) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), cost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

// VerifyPassword reports whether password matches hash
func VerifyPassword(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}
