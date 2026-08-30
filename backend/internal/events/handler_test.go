package events

import (
	"bytes"
	"context"
	"encoding/json"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/unity-run-club/api/internal/auth"
)

// testJWTSecret is the JWT secret used for testing
const testJWTSecret = "test-secret"

// newTestTokens creates a new token issuer for testing
func newTestTokens() *auth.TokenIssuer {
	return auth.NewTokenIssuer(testJWTSecret, time.Hour)
}

// bearerToken creates a bearer token for the given role
func bearerToken(t *testing.T, tokens *auth.TokenIssuer, role auth.Role) string {
	t.Helper()
	tok, err := tokens.GenerateAccessToken(uuid.New(), role)
	if err != nil {
		t.Fatalf("GenerateAccessToken() error = %v", err)
	}
	return tok
}

// newTestRouter creates a new test router
func newTestRouter(h *Handler, tokens *auth.TokenIssuer) http.Handler {
	r := chi.NewRouter()
	r.Route("/api/v1/events", func(ev chi.Router) {
		ev.With(auth.RequireAuth(tokens, auth.RoleAdmin)).Post("/posters", h.UploadPoster)
		ev.With(auth.OptionalAuth(tokens)).Get("/", h.List)
		ev.With(auth.OptionalAuth(tokens)).Get("/{id}", h.GetBySlug)
		ev.With(auth.RequireAuth(tokens, auth.RoleAdmin)).Post("/", h.Create)
		ev.With(auth.RequireAuth(tokens, auth.RoleAdmin)).Post("/{id}/duplicate", h.Duplicate)
		ev.With(auth.RequireAuth(tokens, auth.RoleAdmin)).Patch("/{id}", h.Update)
		ev.With(auth.RequireAuth(tokens, auth.RoleAdmin)).Delete("/{id}", h.Delete)
	})
	return r
}

func TestHandler_Duplicate_RequiresAdminAndCreatesDraft(t *testing.T) {
	repo := newFakeRepo()
	source := testEvent("Founders Run 2026", "founders-run-2026")
	if err := repo.Create(context.Background(), source); err != nil {
		t.Fatalf("Create() error = %v", err)
	}
	tokens := newTestTokens()
	router := newTestRouter(NewHandler(NewService(repo, nil)), tokens)
	body := `{"name":"Founders Run 2027","event_date":"2027-12-06"}`

	forbidden := httptest.NewRequest(http.MethodPost, "/api/v1/events/"+source.ID.String()+"/duplicate", strings.NewReader(body))
	forbidden.Header.Set("Authorization", "Bearer "+bearerToken(t, tokens, auth.RoleUser))
	forbidden.Header.Set("Content-Type", "application/json")
	forbiddenRec := httptest.NewRecorder()
	router.ServeHTTP(forbiddenRec, forbidden)
	if forbiddenRec.Code != http.StatusForbidden {
		t.Fatalf("user duplicate status = %d, want 403", forbiddenRec.Code)
	}

	request := httptest.NewRequest(http.MethodPost, "/api/v1/events/"+source.ID.String()+"/duplicate", strings.NewReader(body))
	request.Header.Set("Authorization", "Bearer "+bearerToken(t, tokens, auth.RoleAdmin))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusCreated {
		t.Fatalf("admin duplicate status = %d, want 201, body=%s", recorder.Code, recorder.Body.String())
	}
	var response struct {
		Data Event `json:"data"`
	}
	if err := json.NewDecoder(recorder.Body).Decode(&response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response.Data.Status != StatusDraft || response.Data.Name != "Founders Run 2027" {
		t.Fatalf("duplicate response = %#v", response.Data)
	}
}

// newPosterRequest creates a new poster request
func newPosterRequest(t *testing.T, content []byte, filename string) *http.Request {
	return newPosterRequestWithFields(t, content, filename, nil)
}

// newPosterRequestWithFields creates a new poster request with fields
func newPosterRequestWithFields(t *testing.T, content []byte, filename string, fields map[string]string) *http.Request {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for key, value := range fields {
		if err := writer.WriteField(key, value); err != nil {
			t.Fatalf("WriteField() error = %v", err)
		}
	}
	part, err := writer.CreateFormFile("poster", filename)
	if err != nil {
		t.Fatalf("CreateFormFile() error = %v", err)
	}
	if _, err := part.Write(content); err != nil {
		t.Fatalf("Write() error = %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/events/posters", &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	return req
}

// TestHandler_UploadPoster_SavesImage tests the UploadPoster method that saves an image
func TestHandler_UploadPoster_SavesImage(t *testing.T) {
	root := t.TempDir()
	tokens := newTestTokens()
	router := newTestRouter(NewHandler(NewService(newFakeRepo(), nil), root), tokens)

	var imageData bytes.Buffer
	img := image.NewRGBA(image.Rect(0, 0, 2, 2))
	img.Set(0, 0, color.RGBA{R: 217, G: 255, A: 255})
	if err := png.Encode(&imageData, img); err != nil {
		t.Fatalf("png.Encode() error = %v", err)
	}

	req := newPosterRequest(t, imageData.Bytes(), "race-poster.png")
	req.Host = "attacker.example"
	req.Header.Set("X-Forwarded-Host", "attacker.example")
	req.Header.Set("Authorization", "Bearer "+bearerToken(t, tokens, auth.RoleAdmin))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusCreated, rec.Body.String())
	}
	files, err := filepath.Glob(filepath.Join(root, "events", "*.jpg"))
	if err != nil || len(files) != 3 {
		t.Fatalf("saved files = %v, error = %v", files, err)
	}
	original := posterFileWithoutVariant(t, files)
	if info, err := os.Stat(original); err != nil || info.Size() == 0 {
		t.Fatalf("saved poster stat error = %v, info = %v", err, info)
	}
	saved, err := os.Open(original)
	if err != nil {
		t.Fatalf("open normalized poster: %v", err)
	}
	defer saved.Close()
	normalized, err := jpeg.Decode(saved)
	if err != nil {
		t.Fatalf("decode normalized poster: %v", err)
	}
	if got := normalized.Bounds().Size(); got.X != DefaultPosterWidth || got.Y != DefaultPosterHeight {
		t.Fatalf("normalized poster size = %v, want %dx%d", got, DefaultPosterWidth, DefaultPosterHeight)
	}
	var response struct {
		Data struct {
			URL     string `json:"url"`
			CardURL string `json:"card_url"`
			HeroURL string `json:"hero_url"`
			Width   int    `json:"width"`
			Height  int    `json:"height"`
			Format  string `json:"format"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode upload response: %v", err)
	}
	if got := response.Data.URL; !strings.HasPrefix(got, "/uploads/events/") || strings.Contains(got, "attacker.example") {
		t.Fatalf("upload URL = %q, want origin-neutral event path", got)
	}
	if response.Data.Width != DefaultPosterWidth || response.Data.Height != DefaultPosterHeight || response.Data.Format != "jpeg" {
		t.Fatalf("upload metadata = %+v", response.Data)
	}
	if !strings.Contains(response.Data.CardURL, "@card.jpg") || !strings.Contains(response.Data.HeroURL, "@hero.jpg") {
		t.Fatalf("variant URLs = card %q hero %q", response.Data.CardURL, response.Data.HeroURL)
	}
}

// posterFileWithoutVariant returns the poster file without the variant suffix
func posterFileWithoutVariant(t *testing.T, files []string) string {
	t.Helper()
	for _, file := range files {
		if !strings.Contains(filepath.Base(file), "@") {
			return file
		}
	}
	t.Fatal("original poster file not found")
	return ""
}

// TestHandler_UploadPoster_UsesRequestedArtboard tests the UploadPoster method that uses the requested artboard
func TestHandler_UploadPoster_UsesRequestedArtboard(t *testing.T) {
	root := t.TempDir()
	tokens := newTestTokens()
	router := newTestRouter(NewHandler(NewService(newFakeRepo(), nil), root), tokens)
	var imageData bytes.Buffer
	if err := png.Encode(&imageData, image.NewRGBA(image.Rect(0, 0, 20, 30))); err != nil {
		t.Fatal(err)
	}
	req := newPosterRequestWithFields(t, imageData.Bytes(), "poster.png", map[string]string{"width": "1080", "height": "1920"})
	req.Header.Set("Authorization", "Bearer "+bearerToken(t, tokens, auth.RoleAdmin))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, body=%s", rec.Code, rec.Body.String())
	}
	files, _ := filepath.Glob(filepath.Join(root, "events", "*.jpg"))
	saved, err := os.Open(posterFileWithoutVariant(t, files))
	if err != nil {
		t.Fatal(err)
	}
	defer saved.Close()
	poster, err := jpeg.Decode(saved)
	if err != nil {
		t.Fatal(err)
	}
	if got := poster.Bounds().Size(); got.X != 1080 || got.Y != 1920 {
		t.Fatalf("poster size = %v, want 1080x1920", got)
	}
}

// TestHandler_UploadPoster_RejectsNonImage tests the UploadPoster method that rejects a non-image
func TestHandler_UploadPoster_RejectsNonImage(t *testing.T) {
	tokens := newTestTokens()
	router := newTestRouter(NewHandler(NewService(newFakeRepo(), nil), t.TempDir()), tokens)
	req := newPosterRequest(t, []byte("this is not an image"), "poster.txt")
	req.Header.Set("Authorization", "Bearer "+bearerToken(t, tokens, auth.RoleAdmin))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnsupportedMediaType {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusUnsupportedMediaType, rec.Body.String())
	}
}

// TestHandler_GetBySlug_HiddenForPublicWhenDraft tests the GetBySlug method that returns a 404 for a draft event
func TestHandler_GetBySlug_HiddenForPublicWhenDraft(t *testing.T) {
	repo := newFakeRepo()
	svc := NewService(repo, nil)
	h := NewHandler(svc)
	tokens := newTestTokens()
	router := newTestRouter(h, tokens)

	e, err := svc.Create(context.Background(), validCreateReq("Founders Run"))
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/events/"+e.Slug, nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusNotFound, rec.Body.String())
	}
}

// TestHandler_GetBySlug_VisibleForStaff tests the GetBySlug method that returns a 200 for a staff user
func TestHandler_GetBySlug_VisibleForStaff(t *testing.T) {
	repo := newFakeRepo()
	svc := NewService(repo, nil)
	h := NewHandler(svc)
	tokens := newTestTokens()
	router := newTestRouter(h, tokens)

	e, err := svc.Create(context.Background(), validCreateReq("Founders Run"))
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/events/"+e.Slug, nil)
	req.Header.Set("Authorization", "Bearer "+bearerToken(t, tokens, auth.RoleStaff))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
}

// TestHandler_Create_RequiresAuth tests the Create method that requires authentication
func TestHandler_Create_RequiresAuth(t *testing.T) {
	repo := newFakeRepo()
	tokens := newTestTokens()
	router := newTestRouter(NewHandler(NewService(repo, nil)), tokens)

	body, _ := json.Marshal(validCreateReq("Founders Run"))
	req := httptest.NewRequest(http.MethodPost, "/api/v1/events/", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusUnauthorized, rec.Body.String())
	}
}

// TestHandler_Create_InsufficientRoleForbidden tests the Create method that returns a 403 for a user with insufficient role
func TestHandler_Create_InsufficientRoleForbidden(t *testing.T) {
	repo := newFakeRepo()
	tokens := newTestTokens()
	router := newTestRouter(NewHandler(NewService(repo, nil)), tokens)

	body, _ := json.Marshal(validCreateReq("Founders Run"))
	req := httptest.NewRequest(http.MethodPost, "/api/v1/events/", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+bearerToken(t, tokens, auth.RoleUser))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusForbidden, rec.Body.String())
	}
}

// TestHandler_Create_ValidationFailure tests the Create method that returns a 422 for validation failure
func TestHandler_Create_ValidationFailure(t *testing.T) {
	repo := newFakeRepo()
	tokens := newTestTokens()
	router := newTestRouter(NewHandler(NewService(repo, nil)), tokens)

	// Missing required fields (name, event_date, start_time).
	body, _ := json.Marshal(map[string]string{})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/events/", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+bearerToken(t, tokens, auth.RoleAdmin))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusUnprocessableEntity, rec.Body.String())
	}
}

// TestHandler_Create_Success tests the Create method that returns a 201 for success
func TestHandler_Create_Success(t *testing.T) {
	repo := newFakeRepo()
	tokens := newTestTokens()
	router := newTestRouter(NewHandler(NewService(repo, nil)), tokens)

	body, _ := json.Marshal(validCreateReq("Founders Run"))
	req := httptest.NewRequest(http.MethodPost, "/api/v1/events/", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+bearerToken(t, tokens, auth.RoleAdmin))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusCreated, rec.Body.String())
	}
}

// TestHandler_Create_DuplicateSlugConflict tests the Create method that returns a 409 for duplicate slug
func TestHandler_Create_DuplicateSlugConflict(t *testing.T) {
	repo := newFakeRepo()
	tokens := newTestTokens()
	router := newTestRouter(NewHandler(NewService(repo, nil)), tokens)
	adminBearer := "Bearer " + bearerToken(t, tokens, auth.RoleAdmin)

	req1 := validCreateReq("Founders Run")
	req1.Slug = "founders-run"
	body, _ := json.Marshal(req1)
	r1 := httptest.NewRequest(http.MethodPost, "/api/v1/events/", bytes.NewReader(body))
	r1.Header.Set("Authorization", adminBearer)
	router.ServeHTTP(httptest.NewRecorder(), r1)

	r2 := httptest.NewRequest(http.MethodPost, "/api/v1/events/", bytes.NewReader(body))
	r2.Header.Set("Authorization", adminBearer)
	rec2 := httptest.NewRecorder()
	router.ServeHTTP(rec2, r2)

	if rec2.Code != http.StatusConflict {
		t.Fatalf("status = %d, want %d, body=%s", rec2.Code, http.StatusConflict, rec2.Body.String())
	}
}
