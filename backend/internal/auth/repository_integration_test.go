//go:build integration

package auth

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// testPool opens a pool against DATABASE_URL (the docker-compose
// Postgres) and truncates the auth tables before each test, mirroring
// internal/events/repository_integration_test.go's pattern.
func testPool(t *testing.T) *pgxpool.Pool {
	t.Helper()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set; skipping integration test")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect to database: %v", err)
	}
	t.Cleanup(pool.Close)

	if _, err := pool.Exec(ctx, `TRUNCATE TABLE users CASCADE`); err != nil {
		t.Fatalf("truncate users: %v", err)
	}

	return pool
}

func testUserAndProfile(email string) (*User, *Profile) {
	return &User{Email: email, PasswordHash: "hashed", Role: RoleUser},
		&Profile{FullName: "Test Runner"}
}

func TestRepository_CreateUserWithProfile(t *testing.T) {
	pool := testPool(t)
	repo := NewRepository(pool)
	ctx := context.Background()

	u, p := testUserAndProfile("runner@unityrunclub.com")
	if err := repo.CreateUserWithProfile(ctx, u, p); err != nil {
		t.Fatalf("CreateUserWithProfile() error = %v", err)
	}
	if u.ID.String() == "" || p.ID.String() == "" {
		t.Fatal("expected IDs to be populated")
	}
	if p.UserID != u.ID {
		t.Errorf("profile.UserID = %v, want %v", p.UserID, u.ID)
	}
}

func TestRepository_CreateUserWithProfile_DuplicateEmail(t *testing.T) {
	pool := testPool(t)
	repo := NewRepository(pool)
	ctx := context.Background()

	u1, p1 := testUserAndProfile("runner@unityrunclub.com")
	if err := repo.CreateUserWithProfile(ctx, u1, p1); err != nil {
		t.Fatalf("first CreateUserWithProfile() error = %v", err)
	}

	u2, p2 := testUserAndProfile("runner@unityrunclub.com")
	err := repo.CreateUserWithProfile(ctx, u2, p2)
	if !errors.Is(err, ErrEmailTaken) {
		t.Fatalf("second CreateUserWithProfile() error = %v, want ErrEmailTaken", err)
	}
}

func TestRepository_GetUserByEmail_NotFound(t *testing.T) {
	pool := testPool(t)
	repo := NewRepository(pool)

	_, err := repo.GetUserByEmail(context.Background(), "nobody@unityrunclub.com")
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("GetUserByEmail() error = %v, want ErrNotFound", err)
	}
}

func TestRepository_RefreshTokenLifecycle(t *testing.T) {
	pool := testPool(t)
	repo := NewRepository(pool)
	ctx := context.Background()

	u, p := testUserAndProfile("runner@unityrunclub.com")
	if err := repo.CreateUserWithProfile(ctx, u, p); err != nil {
		t.Fatalf("CreateUserWithProfile() error = %v", err)
	}

	rt := &RefreshToken{UserID: u.ID, TokenHash: "hash-abc", ExpiresAt: time.Now().Add(time.Hour)}
	if err := repo.CreateRefreshToken(ctx, rt); err != nil {
		t.Fatalf("CreateRefreshToken() error = %v", err)
	}

	got, err := repo.GetRefreshTokenByHash(ctx, "hash-abc")
	if err != nil {
		t.Fatalf("GetRefreshTokenByHash() error = %v", err)
	}
	if !got.IsActive(time.Now()) {
		t.Fatal("expected freshly created refresh token to be active")
	}

	if err := repo.RevokeRefreshToken(ctx, got.ID, time.Now()); err != nil {
		t.Fatalf("RevokeRefreshToken() error = %v", err)
	}

	got2, err := repo.GetRefreshTokenByHash(ctx, "hash-abc")
	if err != nil {
		t.Fatalf("GetRefreshTokenByHash() after revoke error = %v", err)
	}
	if got2.IsActive(time.Now()) {
		t.Fatal("expected revoked refresh token to be inactive")
	}
}

func TestRepository_DeleteUserCascadesProfileAndTokens(t *testing.T) {
	pool := testPool(t)
	repo := NewRepository(pool)
	ctx := context.Background()

	u, p := testUserAndProfile("runner@unityrunclub.com")
	if err := repo.CreateUserWithProfile(ctx, u, p); err != nil {
		t.Fatalf("CreateUserWithProfile() error = %v", err)
	}
	rt := &RefreshToken{UserID: u.ID, TokenHash: "hash-abc", ExpiresAt: time.Now().Add(time.Hour)}
	if err := repo.CreateRefreshToken(ctx, rt); err != nil {
		t.Fatalf("CreateRefreshToken() error = %v", err)
	}

	if _, err := pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, u.ID); err != nil {
		t.Fatalf("delete user: %v", err)
	}

	if _, err := repo.GetProfileByUserID(ctx, u.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected profile to cascade-delete, GetProfileByUserID error = %v", err)
	}
	if _, err := repo.GetRefreshTokenByHash(ctx, "hash-abc"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected refresh token to cascade-delete, GetRefreshTokenByHash error = %v", err)
	}
}
