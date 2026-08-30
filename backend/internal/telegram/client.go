package telegram

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type Client struct {
	token   string
	baseURL string
	http    *http.Client
}

func NewClient(token, baseURL string) *Client {
	if strings.TrimSpace(baseURL) == "" {
		baseURL = "https://api.telegram.org"
	}
	return &Client{token: token, baseURL: strings.TrimRight(baseURL, "/"), http: &http.Client{Timeout: 15 * time.Second}}
}

func (c *Client) SendMessage(ctx context.Context, chatID int64, message string) error {
	return c.postJSON(ctx, "sendMessage", map[string]any{"chat_id": chatID, "text": message})
}

func (c *Client) SendPhoto(ctx context.Context, chatID int64, photo []byte, filename, caption string) error {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	_ = writer.WriteField("chat_id", strconv.FormatInt(chatID, 10))
	_ = writer.WriteField("caption", caption)
	part, err := writer.CreateFormFile("photo", filename)
	if err != nil {
		return fmt.Errorf("telegram: create photo part: %w", err)
	}
	if _, err := part.Write(photo); err != nil {
		return fmt.Errorf("telegram: write photo: %w", err)
	}
	if err := writer.Close(); err != nil {
		return fmt.Errorf("telegram: close photo body: %w", err)
	}
	return c.do(ctx, "sendPhoto", writer.FormDataContentType(), &body)
}

func (c *Client) postJSON(ctx context.Context, method string, payload any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	return c.do(ctx, method, "application/json", bytes.NewReader(body))
}

func (c *Client) do(ctx context.Context, method, contentType string, body io.Reader) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/bot"+c.token+"/"+method, body)
	if err != nil {
		return fmt.Errorf("telegram: create request: %w", err)
	}
	req.Header.Set("Content-Type", contentType)
	resp, err := c.http.Do(req)
	if err != nil {
		// Do not wrap url.Error here: its URL contains the bot token. The caller
		// only needs a retryable, credential-safe provider failure.
		return fmt.Errorf("telegram: %s request failed", method)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		limited, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return fmt.Errorf("telegram: %s returned %d: %s", method, resp.StatusCode, strings.TrimSpace(string(limited)))
	}
	return nil
}
