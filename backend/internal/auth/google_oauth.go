package auth

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/unity-run-club/api/internal/httpresponse"
)

const (
	googleStateCookieName  = "google_oauth_state"
	googleReturnCookieName = "google_oauth_return"
	googleCookiePath       = "/api/v1/auth/google"
	googleAuthorizeURL     = "https://accounts.google.com/o/oauth2/v2/auth"
	googleTokenURL         = "https://oauth2.googleapis.com/token"
	googleUserInfoURL      = "https://openidconnect.googleapis.com/v1/userinfo"
)

// GoogleOAuthConfig contains only server-side OAuth web-client settings
type GoogleOAuthConfig struct {
	ClientID     string
	ClientSecret string
	RedirectURL  string
	PublicAppURL string
}

type googleOAuthFlow struct {
	config GoogleOAuthConfig
	client *http.Client
}

// ConfigureGoogle enables Google sign-in. Leaving ClientID empty keeps the provider disabled and the normal password flow unchanged
func (h *Handler) ConfigureGoogle(config GoogleOAuthConfig) {
	if config.ClientID == "" {
		h.google = nil
		return
	}
	h.google = &googleOAuthFlow{
		config: config,
		client: &http.Client{Timeout: 10 * time.Second},
	}
}

// Providers reports which optional sign-in providers are available
func (h *Handler) Providers(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	httpresponse.WriteData(w, http.StatusOK, map[string]bool{"google": h.google != nil})
}

// GoogleStart begins the authorization-code flow with a browser-bound state
func (h *Handler) GoogleStart(w http.ResponseWriter, r *http.Request) {
	if h.google == nil {
		httpresponse.WriteError(w, http.StatusNotFound, "provider_unavailable", "Google sign-in is not configured")
		return
	}
	state, err := randomOAuthState()
	if err != nil {
		httpresponse.WriteError(w, http.StatusInternalServerError, "internal_error", "could not start Google sign-in")
		return
	}
	returnPath := safeReturnPath(r.URL.Query().Get("redirect"))
	h.setOAuthCookie(w, googleStateCookieName, state, 600)
	h.setOAuthCookie(w, googleReturnCookieName, returnPath, 600)

	query := url.Values{
		"client_id":     {h.google.config.ClientID},
		"redirect_uri":  {h.google.config.RedirectURL},
		"response_type": {"code"},
		"scope":         {"openid email profile"},
		"state":         {state},
		"prompt":        {"select_account"},
	}
	http.Redirect(w, r, googleAuthorizeURL+"?"+query.Encode(), http.StatusFound)
}

// GoogleCallback exchanges the one-time code, verifies the Google profile via the OIDC userinfo endpoint, creates/links the local account, and establishes the same rotating refresh session used by password login
func (h *Handler) GoogleCallback(w http.ResponseWriter, r *http.Request) {
	if h.google == nil {
		httpresponse.WriteError(w, http.StatusNotFound, "provider_unavailable", "Google sign-in is not configured")
		return
	}
	returnPath := h.oauthReturnPath(r)
	h.clearOAuthCookies(w)

	if providerError := r.URL.Query().Get("error"); providerError != "" {
		h.redirectOAuthError(w, r, "access_denied")
		return
	}
	stateCookie, err := r.Cookie(googleStateCookieName)
	state := r.URL.Query().Get("state")
	if err != nil || state == "" || subtle.ConstantTimeCompare([]byte(stateCookie.Value), []byte(state)) != 1 {
		h.redirectOAuthError(w, r, "invalid_state")
		return
	}
	code := strings.TrimSpace(r.URL.Query().Get("code"))
	if code == "" {
		h.redirectOAuthError(w, r, "missing_code")
		return
	}

	profile, err := h.google.exchangeProfile(r.Context(), code)
	if err != nil {
		h.redirectOAuthError(w, r, "verification_failed")
		return
	}
	result, err := h.svc.LoginWithGoogle(r.Context(), profile)
	if err != nil {
		h.redirectOAuthError(w, r, "account_unavailable")
		return
	}
	h.setRefreshCookie(w, result.RefreshToken)
	destination := h.google.config.PublicAppURL + "/auth/google/callback?redirect=" + url.QueryEscape(returnPath)
	http.Redirect(w, r, destination, http.StatusFound)
}

func (f *googleOAuthFlow) exchangeProfile(ctx context.Context, code string) (GoogleProfile, error) {
	form := url.Values{
		"code":          {code},
		"client_id":     {f.config.ClientID},
		"client_secret": {f.config.ClientSecret},
		"redirect_uri":  {f.config.RedirectURL},
		"grant_type":    {"authorization_code"},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, googleTokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return GoogleProfile{}, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	res, err := f.client.Do(req)
	if err != nil {
		return GoogleProfile{}, fmt.Errorf("google oauth: exchange code: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(res.Body, 1<<20))
		return GoogleProfile{}, fmt.Errorf("google oauth: token endpoint returned %s", res.Status)
	}
	var token struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(io.LimitReader(res.Body, 1<<20)).Decode(&token); err != nil || token.AccessToken == "" {
		return GoogleProfile{}, errors.New("google oauth: invalid token response")
	}

	userReq, err := http.NewRequestWithContext(ctx, http.MethodGet, googleUserInfoURL, nil)
	if err != nil {
		return GoogleProfile{}, err
	}
	userReq.Header.Set("Authorization", "Bearer "+token.AccessToken)
	userRes, err := f.client.Do(userReq)
	if err != nil {
		return GoogleProfile{}, fmt.Errorf("google oauth: fetch userinfo: %w", err)
	}
	defer userRes.Body.Close()
	if userRes.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(userRes.Body, 1<<20))
		return GoogleProfile{}, fmt.Errorf("google oauth: userinfo endpoint returned %s", userRes.Status)
	}
	var claims struct {
		Subject       string `json:"sub"`
		Email         string `json:"email"`
		EmailVerified bool   `json:"email_verified"`
		Name          string `json:"name"`
		Picture       string `json:"picture"`
	}
	if err := json.NewDecoder(io.LimitReader(userRes.Body, 1<<20)).Decode(&claims); err != nil {
		return GoogleProfile{}, fmt.Errorf("google oauth: decode userinfo: %w", err)
	}
	if claims.Subject == "" || claims.Email == "" || !claims.EmailVerified {
		return GoogleProfile{}, ErrUnverifiedOAuthEmail
	}
	return GoogleProfile{
		Subject: claims.Subject, Email: claims.Email, EmailVerified: claims.EmailVerified,
		FullName: claims.Name, AvatarURL: claims.Picture,
	}, nil
}

func randomOAuthState() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

func safeReturnPath(raw string) string {
	if raw == "" || strings.Contains(raw, "\\") || strings.ContainsAny(raw, "\r\n\x00") {
		return "/dashboard"
	}
	parsed, err := url.Parse(raw)
	if err == nil && !parsed.IsAbs() && parsed.Host == "" && strings.HasPrefix(parsed.Path, "/") && !strings.HasPrefix(parsed.Path, "//") {
		return parsed.RequestURI()
	}
	return "/dashboard"
}

func (h *Handler) setOAuthCookie(w http.ResponseWriter, name, value string, maxAge int) {
	http.SetCookie(w, &http.Cookie{
		Name: name, Value: value, Path: googleCookiePath, HttpOnly: true,
		Secure: h.isProduction, SameSite: http.SameSiteLaxMode, MaxAge: maxAge,
	})
}

func (h *Handler) clearOAuthCookies(w http.ResponseWriter) {
	for _, name := range []string{googleStateCookieName, googleReturnCookieName} {
		http.SetCookie(w, &http.Cookie{
			Name: name, Value: "", Path: googleCookiePath, HttpOnly: true,
			Secure: h.isProduction, SameSite: http.SameSiteLaxMode,
			MaxAge: -1, Expires: time.Unix(1, 0),
		})
	}
}

func (h *Handler) oauthReturnPath(r *http.Request) string {
	cookie, err := r.Cookie(googleReturnCookieName)
	if err != nil {
		return "/dashboard"
	}
	return safeReturnPath(cookie.Value)
}

func (h *Handler) redirectOAuthError(w http.ResponseWriter, r *http.Request, code string) {
	destination := h.google.config.PublicAppURL + "/auth/login?oauth_error=" + url.QueryEscape(code)
	http.Redirect(w, r, destination, http.StatusFound)
}
