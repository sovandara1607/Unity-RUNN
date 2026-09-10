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

	"github.com/redis/go-redis/v9"

	"github.com/unity-run-club/api/internal/httpresponse"
)

const (
	googleStateCookieName  = "google_oauth_state"
	googleReturnCookieName = "google_oauth_return"
	googleMobileCookieName = "google_oauth_mobile"
	googleCookiePath       = "/api/v1/auth/google"
	googleAuthorizeURL     = "https://accounts.google.com/o/oauth2/v2/auth"
	googleTokenURL         = "https://oauth2.googleapis.com/token"
	googleUserInfoURL      = "https://openidconnect.googleapis.com/v1/userinfo"
	mobileDeepLinkRedirect = "unityrun://auth/callback"
	mobileCodeTTL          = 60 * time.Second
)

// GoogleOAuthConfig contains only server-side OAuth web-client settings
type GoogleOAuthConfig struct {
	ClientID     string
	ClientSecret string
	RedirectURL  string
	PublicAppURL string
}

type googleOAuthFlow struct {
	config   GoogleOAuthConfig
	client   *http.Client
	verifier *googleIDTokenVerifier
}

// ConfigureGoogle enables Google sign-in. Leaving ClientID empty keeps the provider disabled and the normal password flow unchanged
func (h *Handler) ConfigureGoogle(config GoogleOAuthConfig) {
	if config.ClientID == "" {
		h.google = nil
		return
	}
	client := &http.Client{Timeout: 10 * time.Second}
	h.google = &googleOAuthFlow{
		config: config,
		client: client,
		verifier: newGoogleIDTokenVerifier(client, config.ClientID),
	}
}

func (h *Handler) ConfigureGoogleMobile(rdb *redis.Client) {
	h.mobileCodes = rdb
}

// Providers reports which optional sign-in providers are available
func (h *Handler) Providers(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	httpresponse.WriteData(w, http.StatusOK, map[string]bool{
		"google":        h.google != nil,
		"google_mobile": h.google != nil && h.mobileCodes != nil,
	})
}

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
	if r.URL.Query().Get("platform") == "mobile" {
		h.setOAuthCookie(w, googleMobileCookieName, "1", 600)
	}

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
	mobileCookie, mobileErr := r.Cookie(googleMobileCookieName)
	mobile := mobileErr == nil && mobileCookie.Value == "1"
	h.clearOAuthCookies(w)

	if providerError := r.URL.Query().Get("error"); providerError != "" {
		h.redirectOAuthError(w, r, mobile, "access_denied")
		return
	}
	stateCookie, err := r.Cookie(googleStateCookieName)
	state := r.URL.Query().Get("state")
	if err != nil || state == "" || subtle.ConstantTimeCompare([]byte(stateCookie.Value), []byte(state)) != 1 {
		h.redirectOAuthError(w, r, mobile, "invalid_state")
		return
	}
	code := strings.TrimSpace(r.URL.Query().Get("code"))
	if code == "" {
		h.redirectOAuthError(w, r, mobile, "missing_code")
		return
	}

	profile, err := h.google.exchangeProfile(r.Context(), code)
	if err != nil {
		h.redirectOAuthError(w, r, mobile, "verification_failed")
		return
	}
	result, err := h.svc.LoginWithGoogle(r.Context(), profile)
	if err != nil {
		h.redirectOAuthError(w, r, mobile, "account_unavailable")
		return
	}
	if mobile {
		h.completeMobileGoogleLogin(w, r, result)
		return
	}
	h.setRefreshCookie(w, result.RefreshToken)
	destination := h.google.config.PublicAppURL + "/auth/google/callback?redirect=" + url.QueryEscape(returnPath)
	http.Redirect(w, r, destination, http.StatusFound)
}

func (h *Handler) completeMobileGoogleLogin(w http.ResponseWriter, r *http.Request, result *AuthResult) {
	if h.mobileCodes == nil {
		h.redirectOAuthError(w, r, true, "mobile_unavailable")
		return
	}
	code, err := randomOAuthState()
	if err != nil {
		h.redirectOAuthError(w, r, true, "internal_error")
		return
	}
	payload, err := json.Marshal(authResponse{
		AccessToken:  result.AccessToken,
		RefreshToken: result.RefreshToken,
		User:         toUserResponse(result.User),
	})
	if err != nil {
		h.redirectOAuthError(w, r, true, "internal_error")
		return
	}
	if err := h.mobileCodes.Set(r.Context(), mobileCodeRedisKey(code), payload, mobileCodeTTL).Err(); err != nil {
		h.redirectOAuthError(w, r, true, "internal_error")
		return
	}
	http.Redirect(w, r, mobileDeepLinkRedirect+"?code="+url.QueryEscape(code), http.StatusFound)
}

// MobileGoogleCallback exchanges the one-time code from completeMobileGoogleLogin for the
// actual bearer token pair. Single-use (GETDEL) so a leaked or reused deep link is inert.
func (h *Handler) MobileGoogleCallback(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if h.mobileCodes == nil {
		httpresponse.WriteError(w, http.StatusNotFound, "provider_unavailable", "Google sign-in is not configured for mobile")
		return
	}
	var req struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_body", "malformed JSON body")
		return
	}
	req.Code = strings.TrimSpace(req.Code)
	if req.Code == "" {
		httpresponse.WriteError(w, http.StatusBadRequest, "missing_code", "code is required")
		return
	}
	raw, err := h.mobileCodes.GetDel(r.Context(), mobileCodeRedisKey(req.Code)).Bytes()
	if err != nil {
		httpresponse.WriteError(w, http.StatusUnauthorized, "invalid_code", "this sign-in link has expired or was already used")
		return
	}
	var response authResponse
	if err := json.Unmarshal(raw, &response); err != nil {
		httpresponse.WriteError(w, http.StatusInternalServerError, "internal_error", "could not complete Google sign-in")
		return
	}
	httpresponse.WriteData(w, http.StatusOK, response)
}

// MobileGoogleSignIn verifies a Google ID token from the mobile app's native Google Sign-In
// SDK (no browser, no deep link) and issues a bearer session directly. Unlike
// MobileGoogleCallback, this never touches h.mobileCodes: the ID token itself, once verified
// against Google's public keys, is proof enough of who signed in.
func (h *Handler) MobileGoogleSignIn(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if h.google == nil {
		httpresponse.WriteError(w, http.StatusNotFound, "provider_unavailable", "Google sign-in is not configured")
		return
	}
	var req struct {
		IDToken string `json:"id_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpresponse.WriteError(w, http.StatusBadRequest, "invalid_body", "malformed JSON body")
		return
	}
	req.IDToken = strings.TrimSpace(req.IDToken)
	if req.IDToken == "" {
		httpresponse.WriteError(w, http.StatusBadRequest, "missing_id_token", "id_token is required")
		return
	}
	profile, err := h.google.verifier.verify(r.Context(), req.IDToken)
	if err != nil {
		httpresponse.WriteError(w, http.StatusUnauthorized, "invalid_id_token", "could not verify Google sign-in")
		return
	}
	result, err := h.svc.LoginWithGoogle(r.Context(), profile)
	if err != nil {
		httpresponse.WriteError(w, http.StatusUnauthorized, "account_unavailable", "could not complete Google sign-in")
		return
	}
	h.writeSession(w, http.StatusOK, result, true)
}

func mobileCodeRedisKey(code string) string {
	return "auth:google-mobile-code:" + code
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
	for _, name := range []string{googleStateCookieName, googleReturnCookieName, googleMobileCookieName} {
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

func (h *Handler) redirectOAuthError(w http.ResponseWriter, r *http.Request, mobile bool, code string) {
	destination := h.google.config.PublicAppURL + "/auth/login?oauth_error=" + url.QueryEscape(code)
	if mobile {
		destination = mobileDeepLinkRedirect + "?error=" + url.QueryEscape(code)
	}
	http.Redirect(w, r, destination, http.StatusFound)
}
