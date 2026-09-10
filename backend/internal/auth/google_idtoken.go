package auth

import (
	"context"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	googleJWKSURL        = "https://www.googleapis.com/oauth2/v3/certs"
	googleJWKSCacheTTL   = time.Hour
	googleJWKSMinRefetch = 5 * time.Minute
)

// googleIssuers are the two issuer strings Google's ID tokens are documented to use.
var googleIssuers = map[string]bool{
	"accounts.google.com":         true,
	"https://accounts.google.com": true,
}

// googleIDTokenVerifier validates a Google-issued OpenID Connect ID token entirely offline
// once its signing keys are cached: fetch Google's published JWKS, verify the RS256 signature
// against the key named by the token's "kid" header, then check iss/aud/exp/email. This is
// what lets the mobile app's native Google Sign-In hand the backend an ID token directly --
// no authorization-code exchange, no client secret involved.
type googleIDTokenVerifier struct {
	client   *http.Client
	audience string

	mu        sync.Mutex
	keys      map[string]*rsa.PublicKey
	fetchedAt time.Time
}

func newGoogleIDTokenVerifier(client *http.Client, audience string) *googleIDTokenVerifier {
	return &googleIDTokenVerifier{client: client, audience: audience, keys: map[string]*rsa.PublicKey{}}
}

type googleIDTokenClaims struct {
	jwt.RegisteredClaims
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	Name          string `json:"name"`
	Picture       string `json:"picture"`
}

func (v *googleIDTokenVerifier) verify(ctx context.Context, rawToken string) (GoogleProfile, error) {
	var claims googleIDTokenClaims
	_, err := jwt.ParseWithClaims(rawToken, &claims, func(t *jwt.Token) (any, error) {
		kid, _ := t.Header["kid"].(string)
		if kid == "" {
			return nil, errors.New("id token missing kid")
		}
		return v.key(ctx, kid)
	}, jwt.WithValidMethods([]string{"RS256"}), jwt.WithAudience(v.audience))
	if err != nil {
		return GoogleProfile{}, fmt.Errorf("google id token: %w", err)
	}
	if !googleIssuers[claims.Issuer] {
		return GoogleProfile{}, fmt.Errorf("google id token: unexpected issuer %q", claims.Issuer)
	}
	subject := strings.TrimSpace(claims.Subject)
	email := strings.ToLower(strings.TrimSpace(claims.Email))
	if subject == "" || email == "" || !claims.EmailVerified {
		return GoogleProfile{}, ErrUnverifiedOAuthEmail
	}
	return GoogleProfile{
		Subject: subject, Email: email, EmailVerified: claims.EmailVerified,
		FullName: strings.TrimSpace(claims.Name), AvatarURL: claims.Picture,
	}, nil
}

// key returns the RSA public key for kid, refreshing the cached JWKS if it looks stale or the
// kid is unknown (Google rotates these keys periodically). A transient fetch failure falls
// back to a still-cached key rather than failing sign-in outright.
func (v *googleIDTokenVerifier) key(ctx context.Context, kid string) (*rsa.PublicKey, error) {
	v.mu.Lock()
	key, ok := v.keys[kid]
	fresh := ok && time.Since(v.fetchedAt) < googleJWKSCacheTTL
	recentlyFetched := time.Since(v.fetchedAt) < googleJWKSMinRefetch
	v.mu.Unlock()
	if fresh {
		return key, nil
	}
	if !ok && recentlyFetched {
		// Already refetched recently and this kid still isn't present -- don't hammer Google.
		return nil, fmt.Errorf("unknown signing key %q", kid)
	}
	if err := v.refresh(ctx); err != nil {
		if ok {
			return key, nil
		}
		return nil, err
	}
	v.mu.Lock()
	key, ok = v.keys[kid]
	v.mu.Unlock()
	if !ok {
		return nil, fmt.Errorf("unknown signing key %q", kid)
	}
	return key, nil
}

func (v *googleIDTokenVerifier) refresh(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, googleJWKSURL, nil)
	if err != nil {
		return err
	}
	res, err := v.client.Do(req)
	if err != nil {
		return fmt.Errorf("google id token: fetch jwks: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(res.Body, 1<<20))
		return fmt.Errorf("google id token: jwks endpoint returned %s", res.Status)
	}
	var body struct {
		Keys []struct {
			Kid string `json:"kid"`
			Kty string `json:"kty"`
			N   string `json:"n"`
			E   string `json:"e"`
		} `json:"keys"`
	}
	if err := json.NewDecoder(io.LimitReader(res.Body, 1<<20)).Decode(&body); err != nil {
		return fmt.Errorf("google id token: decode jwks: %w", err)
	}
	keys := make(map[string]*rsa.PublicKey, len(body.Keys))
	for _, k := range body.Keys {
		if k.Kty != "RSA" || k.Kid == "" || k.N == "" || k.E == "" {
			continue
		}
		pub, err := rsaPublicKeyFromJWK(k.N, k.E)
		if err != nil {
			continue
		}
		keys[k.Kid] = pub
	}
	if len(keys) == 0 {
		return errors.New("google id token: jwks response had no usable keys")
	}
	v.mu.Lock()
	v.keys = keys
	v.fetchedAt = time.Now()
	v.mu.Unlock()
	return nil
}

func rsaPublicKeyFromJWK(nEncoded, eEncoded string) (*rsa.PublicKey, error) {
	nBytes, err := base64.RawURLEncoding.DecodeString(nEncoded)
	if err != nil {
		return nil, err
	}
	eBytes, err := base64.RawURLEncoding.DecodeString(eEncoded)
	if err != nil {
		return nil, err
	}
	exponent := 0
	for _, b := range eBytes {
		exponent = exponent<<8 | int(b)
	}
	if exponent == 0 {
		return nil, errors.New("invalid exponent")
	}
	return &rsa.PublicKey{N: new(big.Int).SetBytes(nBytes), E: exponent}, nil
}
