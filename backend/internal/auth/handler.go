package auth

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/unity-run-club/api/internal/httpresponse"
)

const refreshCookieName = "refresh_token"
const refreshCookiePath = "/api/v1/auth"

// Handler wires HTTP requests to the auth Service. Handlers stay thin: decode -> validate -> service -> respond
type Handler struct {
	svc             *Service
	refreshTokenTTL time.Duration
	loginLimiter    AttemptLimiter
	google          *googleOAuthFlow
	// mobileCodes stores short-lived, single-use handoff codes for the mobile Google
	// sign-in deep-link callback (see completeMobileGoogleLogin). Nil disables that path
	// without touching the web OAuth flow.
	mobileCodes *redis.Client
	// isProduction controls cookie SameSite/Secure flags: Lax+non-Secure in development (so plain-HTTP localhost testing works), None+Secure otherwise (required for a cross-site Vercel <-> API deployment)
	isProduction bool
}

// NewHandler builds a Handler backed by svc
func NewHandler(svc *Service, refreshTokenTTL time.Duration, isProduction bool, loginLimiters ...AttemptLimiter) *Handler {
	h := &Handler{svc: svc, refreshTokenTTL: refreshTokenTTL, isProduction: isProduction}
	if len(loginLimiters) > 0 {
		h.loginLimiter = loginLimiters[0]
	}
	return h
}

type userResponse struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Role  Role   `json:"role"`
}

func toUserResponse(u *User) userResponse {
	return userResponse{ID: u.ID.String(), Email: u.Email, Role: u.Role}
}

type authResponse struct {
	AccessToken  string       `json:"access_token"`
	RefreshToken string       `json:"refresh_token,omitempty"`
	User         userResponse `json:"user"`
}

// Register handles POST /api/v1/auth/register
func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	h.register(w, r, false)
}

// MobileRegister uses explicit tokens and never reads or writes browser cookies.
func (h *Handler) MobileRegister(w http.ResponseWriter, r *http.Request) {
	h.register(w, r, true)
}

func (h *Handler) register(w http.ResponseWriter, r *http.Request, mobile bool) {
	w.Header().Set("Cache-Control", "no-store")
	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_body", "malformed JSON body")
		return
	}
	if err := validate.Struct(req); err != nil {
		httpresponse.WriteError(w, http.StatusUnprocessableEntity, "validation_failed", err.Error())
		return
	}

	result, err := h.svc.Register(r.Context(), req)
	switch {
	case errors.Is(err, ErrEmailTaken):
		httpresponse.WriteError(w, http.StatusConflict, "email_taken", "an account with this email already exists")
	case err != nil:
		httpresponse.WriteError(w, http.StatusInternalServerError, "internal_error", "failed to register")
	default:
		h.writeSession(w, http.StatusCreated, result, mobile)
	}
}

// Login handles POST /api/v1/auth/login
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	h.login(w, r, false)
}

// MobileLogin uses explicit tokens and never reads or writes browser cookies.
func (h *Handler) MobileLogin(w http.ResponseWriter, r *http.Request) {
	h.login(w, r, true)
}

func (h *Handler) login(w http.ResponseWriter, r *http.Request, mobile bool) {
	w.Header().Set("Cache-Control", "no-store")
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_body", "malformed JSON body")
		return
	}
	if err := validate.Struct(req); err != nil {
		httpresponse.WriteError(w, http.StatusUnprocessableEntity, "validation_failed", err.Error())
		return
	}
	if h.loginLimiter != nil {
		allowed, _ := h.loginLimiter.Allow(r.Context(), req.Email)
		if !allowed {
			w.Header().Set("Retry-After", "900")
			httpresponse.WriteError(w, http.StatusTooManyRequests, "login_rate_limited", "too many login attempts; try again later")
			return
		}
	}

	result, err := h.svc.Login(r.Context(), req)
	switch {
	case errors.Is(err, ErrInvalidCredentials):
		httpresponse.WriteError(w, http.StatusUnauthorized, "invalid_credentials", "invalid email or password")
	case err != nil:
		httpresponse.WriteError(w, http.StatusInternalServerError, "internal_error", "failed to log in")
	default:
		if h.loginLimiter != nil {
			_ = h.loginLimiter.Reset(r.Context(), req.Email)
		}
		h.writeSession(w, http.StatusOK, result, mobile)
	}
}

// Refresh handles POST /api/v1/auth/refresh
func (h *Handler) Refresh(w http.ResponseWriter, r *http.Request) {
	h.refresh(w, r, false)
}

// MobileRefresh uses explicit tokens and never reads or writes browser cookies.
func (h *Handler) MobileRefresh(w http.ResponseWriter, r *http.Request) {
	h.refresh(w, r, true)
}

func (h *Handler) refresh(w http.ResponseWriter, r *http.Request, mobile bool) {
	w.Header().Set("Cache-Control", "no-store")
	rawToken, err := refreshTokenFromRequest(r, mobile)
	if err != nil || rawToken == "" {
		httpresponse.WriteError(w, http.StatusUnauthorized, "unauthorized", "missing refresh token")
		return
	}

	result, err := h.svc.Refresh(r.Context(), rawToken)
	switch {
	case errors.Is(err, ErrInvalidToken):
		if !mobile {
			h.clearRefreshCookie(w)
		}
		httpresponse.WriteError(w, http.StatusUnauthorized, "unauthorized", "invalid or expired refresh token")
	case err != nil:
		httpresponse.WriteError(w, http.StatusInternalServerError, "internal_error", "failed to refresh session")
	default:
		h.writeSession(w, http.StatusOK, result, mobile)
	}
}

// Logout handles POST /api/v1/auth/logout
func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	h.logout(w, r, false)
}

// MobileLogout uses explicit tokens and never reads or writes browser cookies.
func (h *Handler) MobileLogout(w http.ResponseWriter, r *http.Request) {
	h.logout(w, r, true)
}

func (h *Handler) logout(w http.ResponseWriter, r *http.Request, mobile bool) {
	w.Header().Set("Cache-Control", "no-store")
	if mobile {
		rawToken, err := refreshTokenFromRequest(r, true)
		if err != nil || rawToken == "" {
			httpresponse.WriteError(w, http.StatusBadRequest, "invalid_body", "refresh_token is required")
			return
		}
		if err := h.svc.Logout(r.Context(), rawToken); err != nil {
			httpresponse.WriteError(w, http.StatusInternalServerError, "internal_error", "failed to revoke session")
			return
		}
	} else {
		if cookie, err := r.Cookie(refreshCookieName); err == nil && cookie.Value != "" {
			_ = h.svc.Logout(r.Context(), cookie.Value)
		}
		h.clearRefreshCookie(w)
	}
	w.WriteHeader(http.StatusNoContent)
}

// Me handles GET /api/v1/me (requires auth)
func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	authUser, ok := UserFromContext(r.Context())
	if !ok {
		httpresponse.WriteError(w, http.StatusUnauthorized, "unauthorized", "missing or invalid access token")
		return
	}

	profile, err := h.svc.GetProfile(r.Context(), authUser.ID)
	if err != nil {
		httpresponse.WriteError(w, http.StatusInternalServerError, "internal_error", "failed to load profile")
		return
	}

	u, err := h.svc.GetUserByID(r.Context(), authUser.ID)
	if err != nil {
		httpresponse.WriteError(w, http.StatusInternalServerError, "internal_error", "failed to load account")
		return
	}

	httpresponse.WriteData(w, http.StatusOK, map[string]any{
		"id":         authUser.ID,
		"role":       authUser.Role,
		"email":      u.Email,
		"profile":    profile,
		"created_at": u.CreatedAt,
		"updated_at": u.UpdatedAt,
	})
}

// UpdateMe handles PATCH /api/v1/me (requires auth)
func (h *Handler) UpdateMe(w http.ResponseWriter, r *http.Request) {
	authUser, ok := UserFromContext(r.Context())
	if !ok {
		httpresponse.WriteError(w, http.StatusUnauthorized, "unauthorized", "missing or invalid access token")
		return
	}

	var req UpdateProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_body", "malformed JSON body")
		return
	}
	if err := validate.Struct(req); err != nil {
		httpresponse.WriteError(w, http.StatusUnprocessableEntity, "validation_failed", err.Error())
		return
	}

	profile, err := h.svc.UpdateProfile(r.Context(), authUser.ID, req)
	switch {
	case errors.Is(err, ErrNotFound):
		httpresponse.WriteError(w, http.StatusNotFound, "not_found", "profile not found")
	case err != nil:
		httpresponse.WriteError(w, http.StatusBadRequest, "update_failed", err.Error())
	default:
		httpresponse.WriteData(w, http.StatusOK, profile)
	}
}

func (h *Handler) setRefreshCookie(w http.ResponseWriter, rawToken string) {
	http.SetCookie(w, &http.Cookie{
		Name:     refreshCookieName,
		Value:    rawToken,
		Path:     refreshCookiePath,
		HttpOnly: true,
		Secure:   h.isProduction,
		SameSite: h.sameSite(),
		MaxAge:   int(h.refreshTokenTTL.Seconds()),
	})
}

func (h *Handler) clearRefreshCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     refreshCookieName,
		Value:    "",
		Path:     refreshCookiePath,
		HttpOnly: true,
		Secure:   h.isProduction,
		SameSite: h.sameSite(),
		MaxAge:   -1,
		Expires:  time.Unix(1, 0),
	})
}

func (h *Handler) sameSite() http.SameSite {
	if h.isProduction {
		return http.SameSiteNoneMode
	}
	return http.SameSiteLaxMode
}

// Transport choice is made by the registered route, never by a request header.
func (h *Handler) writeSession(w http.ResponseWriter, status int, result *AuthResult, mobile bool) {
	response := authResponse{AccessToken: result.AccessToken, User: toUserResponse(result.User)}
	if mobile {
		response.RefreshToken = result.RefreshToken
	} else {
		h.setRefreshCookie(w, result.RefreshToken)
	}
	httpresponse.WriteData(w, status, response)
}

func refreshTokenFromRequest(r *http.Request, mobile bool) (string, error) {
	if !mobile {
		cookie, err := r.Cookie(refreshCookieName)
		if err != nil {
			return "", err
		}
		return cookie.Value, nil
	}
	var request struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		return "", err
	}
	if len(request.RefreshToken) > 256 {
		return "", ErrInvalidToken
	}
	return request.RefreshToken, nil
}
