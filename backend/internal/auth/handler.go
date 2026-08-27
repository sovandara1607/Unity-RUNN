package auth

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/unity-run-club/api/internal/httpresponse"
)

const refreshCookieName = "refresh_token"
const refreshCookiePath = "/api/v1/auth"

// Handler wires HTTP requests to the auth Service. Handlers stay
// thin: decode -> validate -> service -> respond.
type Handler struct {
	svc             *Service
	refreshTokenTTL time.Duration
	loginLimiter    AttemptLimiter
	google          *googleOAuthFlow
	// isProduction controls cookie SameSite/Secure flags: Lax+non-Secure
	// in development (so plain-HTTP localhost testing works), None+Secure
	// otherwise (required for a cross-site Vercel <-> API deployment).
	isProduction bool
}

// NewHandler builds a Handler backed by svc.
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
	AccessToken string       `json:"access_token"`
	User        userResponse `json:"user"`
}

// Register handles POST /api/v1/auth/register.
func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
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
		h.setRefreshCookie(w, result.RefreshToken)
		httpresponse.WriteData(w, http.StatusCreated, authResponse{
			AccessToken: result.AccessToken,
			User:        toUserResponse(result.User),
		})
	}
}

// Login handles POST /api/v1/auth/login.
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
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
		h.setRefreshCookie(w, result.RefreshToken)
		httpresponse.WriteData(w, http.StatusOK, authResponse{
			AccessToken: result.AccessToken,
			User:        toUserResponse(result.User),
		})
	}
}

// Refresh handles POST /api/v1/auth/refresh.
func (h *Handler) Refresh(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	cookie, err := r.Cookie(refreshCookieName)
	if err != nil || cookie.Value == "" {
		httpresponse.WriteError(w, http.StatusUnauthorized, "unauthorized", "missing refresh token")
		return
	}

	result, err := h.svc.Refresh(r.Context(), cookie.Value)
	switch {
	case errors.Is(err, ErrInvalidToken):
		h.clearRefreshCookie(w)
		httpresponse.WriteError(w, http.StatusUnauthorized, "unauthorized", "invalid or expired refresh token")
	case err != nil:
		httpresponse.WriteError(w, http.StatusInternalServerError, "internal_error", "failed to refresh session")
	default:
		h.setRefreshCookie(w, result.RefreshToken)
		httpresponse.WriteData(w, http.StatusOK, authResponse{
			AccessToken: result.AccessToken,
			User:        toUserResponse(result.User),
		})
	}
}

// Logout handles POST /api/v1/auth/logout.
func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if cookie, err := r.Cookie(refreshCookieName); err == nil && cookie.Value != "" {
		_ = h.svc.Logout(r.Context(), cookie.Value) // best-effort; always clear the cookie
	}
	h.clearRefreshCookie(w)
	w.WriteHeader(http.StatusNoContent)
}

// Me handles GET /api/v1/me (requires auth).
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

// UpdateMe handles PATCH /api/v1/me (requires auth).
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
