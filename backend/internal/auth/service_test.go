package auth

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

// fakeAuthRepo is an in-memory authRepository for service unit tests.
type fakeAuthRepo struct {
	usersByID    map[uuid.UUID]*User
	usersByEmail map[string]*User
	profiles     map[uuid.UUID]*Profile // keyed by user ID
	tokens       map[string]*RefreshToken
	identities   map[string]*OAuthIdentity
}

func newFakeAuthRepo() *fakeAuthRepo {
	return &fakeAuthRepo{
		usersByID:    map[uuid.UUID]*User{},
		usersByEmail: map[string]*User{},
		profiles:     map[uuid.UUID]*Profile{},
		tokens:       map[string]*RefreshToken{},
		identities:   map[string]*OAuthIdentity{},
	}
}

func identityKey(provider, subject string) string { return provider + "\x00" + subject }

func (f *fakeAuthRepo) GetUserByIdentity(ctx context.Context, provider, subject string) (*User, error) {
	identity, ok := f.identities[identityKey(provider, subject)]
	if !ok {
		return nil, ErrNotFound
	}
	return f.GetUserByID(ctx, identity.UserID)
}

func (f *fakeAuthRepo) LinkIdentity(_ context.Context, identity *OAuthIdentity) error {
	key := identityKey(identity.Provider, identity.Subject)
	if _, exists := f.identities[key]; !exists {
		copy := *identity
		copy.ID = uuid.New()
		f.identities[key] = &copy
	}
	return nil
}

func (f *fakeAuthRepo) CreateUserWithProfile(ctx context.Context, u *User, p *Profile) error {
	if _, exists := f.usersByEmail[u.Email]; exists {
		return ErrEmailTaken
	}
	u.ID = uuid.New()
	u.CreatedAt, u.UpdatedAt = time.Now(), time.Now()
	f.usersByID[u.ID] = u
	f.usersByEmail[u.Email] = u

	p.ID = uuid.New()
	p.UserID = u.ID
	p.CreatedAt, p.UpdatedAt = time.Now(), time.Now()
	f.profiles[u.ID] = p
	return nil
}

func (f *fakeAuthRepo) GetUserByEmail(ctx context.Context, email string) (*User, error) {
	u, ok := f.usersByEmail[email]
	if !ok {
		return nil, ErrNotFound
	}
	return u, nil
}

func (f *fakeAuthRepo) GetUserByID(ctx context.Context, id uuid.UUID) (*User, error) {
	u, ok := f.usersByID[id]
	if !ok {
		return nil, ErrNotFound
	}
	return u, nil
}

func (f *fakeAuthRepo) GetProfileByUserID(ctx context.Context, userID uuid.UUID) (*Profile, error) {
	p, ok := f.profiles[userID]
	if !ok {
		return nil, ErrNotFound
	}
	return p, nil
}

func (f *fakeAuthRepo) UpdateProfile(ctx context.Context, p *Profile) error {
	if _, ok := f.profiles[p.UserID]; !ok {
		return ErrNotFound
	}
	f.profiles[p.UserID] = p
	return nil
}

func (f *fakeAuthRepo) CreateRefreshToken(ctx context.Context, t *RefreshToken) error {
	t.ID = uuid.New()
	t.CreatedAt = time.Now()
	f.tokens[t.TokenHash] = t
	return nil
}

func (f *fakeAuthRepo) GetRefreshTokenByHash(ctx context.Context, hash string) (*RefreshToken, error) {
	t, ok := f.tokens[hash]
	if !ok {
		return nil, ErrNotFound
	}
	return t, nil
}

func (f *fakeAuthRepo) RevokeRefreshToken(ctx context.Context, id uuid.UUID, now time.Time) error {
	for _, t := range f.tokens {
		if t.ID == id {
			t.RevokedAt = &now
			return nil
		}
	}
	return ErrNotFound
}

func (f *fakeAuthRepo) ListUsers(ctx context.Context, role *Role, limit, offset int) ([]User, int, error) {
	users := make([]User, 0, len(f.usersByID))
	for _, user := range f.usersByID {
		if role == nil || user.Role == *role {
			users = append(users, *user)
		}
	}
	return users, len(users), nil
}

func (f *fakeAuthRepo) UpdateUserRole(ctx context.Context, id uuid.UUID, role Role) (*User, error) {
	user, ok := f.usersByID[id]
	if !ok {
		return nil, ErrNotFound
	}
	user.Role = role
	user.UpdatedAt = time.Now()
	return user, nil
}

func newTestService() (*Service, *fakeAuthRepo) {
	repo := newFakeAuthRepo()
	tokens := NewTokenIssuer("test-secret", time.Hour)
	svc := NewService(repo, tokens, bcrypt.MinCost, 24*time.Hour)
	return svc, repo
}

func validRegisterReq() RegisterRequest {
	return RegisterRequest{Email: "runner@unityrunclub.com", Password: "hunter22", FullName: "Test Runner"}
}

func TestService_LoginWithGoogle_CreatesAndReusesLinkedAccount(t *testing.T) {
	svc, repo := newTestService()
	profile := GoogleProfile{
		Subject: "google-sub-1", Email: "Runner@Example.com", EmailVerified: true,
		FullName: "Google Runner", AvatarURL: "https://example.com/avatar.jpg",
	}
	first, err := svc.LoginWithGoogle(context.Background(), profile)
	if err != nil {
		t.Fatalf("LoginWithGoogle() error = %v", err)
	}
	second, err := svc.LoginWithGoogle(context.Background(), profile)
	if err != nil {
		t.Fatalf("second LoginWithGoogle() error = %v", err)
	}
	if first.User.ID != second.User.ID || len(repo.usersByID) != 1 {
		t.Fatalf("Google login did not reuse account: first=%s second=%s users=%d", first.User.ID, second.User.ID, len(repo.usersByID))
	}
	if first.User.Email != "runner@example.com" {
		t.Fatalf("normalized email = %q", first.User.Email)
	}
}

func TestService_LoginWithGoogle_LinksVerifiedExistingEmail(t *testing.T) {
	svc, repo := newTestService()
	existing, err := svc.Register(context.Background(), RegisterRequest{
		Email: "runner@example.com", Password: "hunter22", FullName: "Existing Runner",
	})
	if err != nil {
		t.Fatal(err)
	}
	result, err := svc.LoginWithGoogle(context.Background(), GoogleProfile{
		Subject: "google-sub-2", Email: "runner@example.com", EmailVerified: true, FullName: "Google Runner",
	})
	if err != nil {
		t.Fatalf("LoginWithGoogle() error = %v", err)
	}
	if result.User.ID != existing.User.ID || len(repo.usersByID) != 1 {
		t.Fatal("verified Google email was not linked to the existing account")
	}
}

func TestService_LoginWithGoogle_RejectsUnverifiedEmail(t *testing.T) {
	svc, _ := newTestService()
	_, err := svc.LoginWithGoogle(context.Background(), GoogleProfile{
		Subject: "google-sub-3", Email: "runner@example.com", EmailVerified: false,
	})
	if !errors.Is(err, ErrUnverifiedOAuthEmail) {
		t.Fatalf("LoginWithGoogle() error = %v, want ErrUnverifiedOAuthEmail", err)
	}
}

func TestService_Register_Success(t *testing.T) {
	svc, _ := newTestService()

	result, err := svc.Register(context.Background(), validRegisterReq())
	if err != nil {
		t.Fatalf("Register() error = %v", err)
	}
	if result.User.Role != RoleUser {
		t.Errorf("Role = %q, want %q", result.User.Role, RoleUser)
	}
	if result.AccessToken == "" || result.RefreshToken == "" {
		t.Error("expected non-empty access and refresh tokens")
	}
}

func TestService_Register_DuplicateEmailRejected(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()

	if _, err := svc.Register(ctx, validRegisterReq()); err != nil {
		t.Fatalf("first Register() error = %v", err)
	}

	_, err := svc.Register(ctx, validRegisterReq())
	if !errors.Is(err, ErrEmailTaken) {
		t.Fatalf("second Register() error = %v, want ErrEmailTaken", err)
	}
}

func TestService_EmailIdentityIsCaseInsensitive(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()
	req := validRegisterReq()
	req.Email = " Runner@UnityRunClub.COM "
	if _, err := svc.Register(ctx, req); err != nil {
		t.Fatalf("Register() error = %v", err)
	}
	if _, err := svc.Login(ctx, LoginRequest{Email: "runner@unityrunclub.com", Password: req.Password}); err != nil {
		t.Fatalf("case-normalized Login() error = %v", err)
	}
	if _, err := svc.Register(ctx, validRegisterReq()); !errors.Is(err, ErrEmailTaken) {
		t.Fatalf("case-variant duplicate error = %v, want ErrEmailTaken", err)
	}
}

func TestService_Login_WrongPasswordRejected(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()

	if _, err := svc.Register(ctx, validRegisterReq()); err != nil {
		t.Fatalf("Register() error = %v", err)
	}

	_, err := svc.Login(ctx, LoginRequest{Email: "runner@unityrunclub.com", Password: "wrong"})
	if !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("Login() error = %v, want ErrInvalidCredentials", err)
	}
}

func TestService_Login_UnknownEmailRejected(t *testing.T) {
	svc, _ := newTestService()

	_, err := svc.Login(context.Background(), LoginRequest{Email: "nobody@unityrunclub.com", Password: "whatever"})
	if !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("Login() error = %v, want ErrInvalidCredentials", err)
	}
}

func TestService_Login_Success(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()

	if _, err := svc.Register(ctx, validRegisterReq()); err != nil {
		t.Fatalf("Register() error = %v", err)
	}

	result, err := svc.Login(ctx, LoginRequest{Email: "runner@unityrunclub.com", Password: "hunter22"})
	if err != nil {
		t.Fatalf("Login() error = %v", err)
	}
	if result.AccessToken == "" {
		t.Error("expected non-empty access token")
	}
}

func TestService_Refresh_RotatesAndInvalidatesOldToken(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()

	reg, err := svc.Register(ctx, validRegisterReq())
	if err != nil {
		t.Fatalf("Register() error = %v", err)
	}

	refreshed, err := svc.Refresh(ctx, reg.RefreshToken)
	if err != nil {
		t.Fatalf("Refresh() error = %v", err)
	}
	if refreshed.RefreshToken == reg.RefreshToken {
		t.Error("expected a new refresh token, got the same one back")
	}

	// Reusing the old (now-revoked) refresh token must fail.
	if _, err := svc.Refresh(ctx, reg.RefreshToken); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("Refresh() with old token error = %v, want ErrInvalidToken", err)
	}

	// The new one should still work.
	if _, err := svc.Refresh(ctx, refreshed.RefreshToken); err != nil {
		t.Fatalf("Refresh() with new token error = %v", err)
	}
}

func TestService_Refresh_ExpiredTokenRejected(t *testing.T) {
	repo := newFakeAuthRepo()
	tokens := NewTokenIssuer("test-secret", time.Hour)
	svc := NewService(repo, tokens, bcrypt.MinCost, 24*time.Hour)
	svc.now = func() time.Time { return time.Now().Add(-48 * time.Hour) } // issue in the "past"

	reg, err := svc.Register(context.Background(), validRegisterReq())
	if err != nil {
		t.Fatalf("Register() error = %v", err)
	}

	svc.now = time.Now // back to real time — the token is now expired
	if _, err := svc.Refresh(context.Background(), reg.RefreshToken); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("Refresh() error = %v, want ErrInvalidToken", err)
	}
}

func TestService_Logout_RevokesToken(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()

	reg, err := svc.Register(ctx, validRegisterReq())
	if err != nil {
		t.Fatalf("Register() error = %v", err)
	}

	if err := svc.Logout(ctx, reg.RefreshToken); err != nil {
		t.Fatalf("Logout() error = %v", err)
	}

	if _, err := svc.Refresh(ctx, reg.RefreshToken); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("Refresh() after logout error = %v, want ErrInvalidToken", err)
	}
}

func TestService_Logout_UnknownTokenIsNoop(t *testing.T) {
	svc, _ := newTestService()

	if err := svc.Logout(context.Background(), "not-a-real-token"); err != nil {
		t.Fatalf("Logout() error = %v, want nil (idempotent)", err)
	}
}

func TestService_UpdateUserRole_PreventsSelfDemotion(t *testing.T) {
	svc, repo := newTestService()
	actorID := uuid.New()
	repo.usersByID[actorID] = &User{ID: actorID, Role: RoleSuperAdmin}

	_, err := svc.UpdateUserRole(context.Background(), actorID, actorID, RoleAdmin)
	if !errors.Is(err, ErrCannotDemoteSelf) {
		t.Fatalf("UpdateUserRole() error = %v, want ErrCannotDemoteSelf", err)
	}
}

func TestService_UpdateProfile(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()

	reg, err := svc.Register(ctx, validRegisterReq())
	if err != nil {
		t.Fatalf("Register() error = %v", err)
	}

	newName := "Updated Runner"
	p, err := svc.UpdateProfile(ctx, reg.User.ID, UpdateProfileRequest{FullName: &newName})
	if err != nil {
		t.Fatalf("UpdateProfile() error = %v", err)
	}
	if p.FullName != newName {
		t.Errorf("FullName = %q, want %q", p.FullName, newName)
	}
}
