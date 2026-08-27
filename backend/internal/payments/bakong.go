package payments

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type BakongConfig struct {
	BaseURL    string
	Token      string
	Merchant   KHQRMerchant
	PaymentTTL time.Duration
	HTTPClient *http.Client
}

type BakongProvider struct {
	baseURL  string
	token    string
	merchant KHQRMerchant
	ttl      time.Duration
	client   *http.Client
	now      func() time.Time
}

func NewBakongProvider(cfg BakongConfig) (*BakongProvider, error) {
	if strings.TrimSpace(cfg.BaseURL) == "" || strings.TrimSpace(cfg.Token) == "" {
		return nil, fmt.Errorf("payments: BAKONG_BASE_URL and BAKONG_TOKEN are required")
	}
	if cfg.PaymentTTL <= 0 {
		cfg.PaymentTTL = 10 * time.Minute
	}
	if cfg.HTTPClient == nil {
		cfg.HTTPClient = &http.Client{Timeout: 10 * time.Second}
	}
	if _, _, err := GenerateMerchantKHQR(cfg.Merchant, "config-check", "USD", 100, time.Now()); err != nil {
		return nil, err
	}
	return &BakongProvider{baseURL: strings.TrimRight(cfg.BaseURL, "/"), token: cfg.Token, merchant: cfg.Merchant, ttl: cfg.PaymentTTL, client: cfg.HTTPClient, now: time.Now}, nil
}

func (p *BakongProvider) Name() string { return "bakong" }

func (p *BakongProvider) CreatePayment(ctx context.Context, registrationID, currency string, amountCents int) (Payment, error) {
	now := p.now()
	qr, md5Value, err := GenerateMerchantKHQR(p.merchant, registrationID, currency, amountCents, now)
	if err != nil {
		return Payment{}, err
	}
	return Payment{ProviderReference: md5Value, Status: StatusPending, Checkout: &Checkout{QRString: qr, ExpiresAt: now.Add(p.ttl)}}, nil
}

type bakongCheckResponse struct {
	ResponseCode    int    `json:"responseCode"`
	ResponseMessage string `json:"responseMessage"`
	ErrorCode       *int   `json:"errorCode"`
	Data            *struct {
		Hash        string  `json:"hash"`
		ToAccountID string  `json:"toAccountId"`
		Currency    string  `json:"currency"`
		Amount      float64 `json:"amount"`
	} `json:"data"`
}

func (p *BakongProvider) GetPaymentStatus(ctx context.Context, providerReference string) (Payment, error) {
	body, _ := json.Marshal(map[string]string{"md5": providerReference})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.baseURL+"/v1/check_transaction_by_md5", bytes.NewReader(body))
	if err != nil {
		return Payment{}, err
	}
	req.Header.Set("Authorization", "Bearer "+p.token)
	req.Header.Set("Content-Type", "application/json")
	res, err := p.client.Do(req)
	if err != nil {
		return Payment{}, fmt.Errorf("payments: Bakong status request: %w", err)
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return Payment{}, fmt.Errorf("payments: read Bakong response: %w", err)
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return Payment{}, fmt.Errorf("payments: Bakong API returned HTTP %d", res.StatusCode)
	}
	var result bakongCheckResponse
	if err := json.Unmarshal(raw, &result); err != nil {
		return Payment{}, fmt.Errorf("payments: decode Bakong response: %w", err)
	}
	if result.ResponseCode != 0 || result.Data == nil {
		if result.ErrorCode != nil && *result.ErrorCode == 1 {
			return Payment{ProviderReference: providerReference, Status: StatusPending}, nil
		}
		return Payment{}, fmt.Errorf("payments: Bakong verification failed: %s", result.ResponseMessage)
	}
	if !strings.EqualFold(result.Data.ToAccountID, p.merchant.AccountID) {
		return Payment{}, fmt.Errorf("payments: Bakong receiver mismatch")
	}
	currency := normalizeBakongCurrency(result.Data.Currency)
	amountCents := int(result.Data.Amount*100 + 0.5)
	if currency == "KHR" {
		amountCents = int(result.Data.Amount + 0.5)
	}
	return Payment{ProviderReference: providerReference, Status: StatusSucceeded, Verification: &Verification{
		AmountCents: amountCents, Currency: currency, ReceiverAccount: result.Data.ToAccountID, TransactionHash: result.Data.Hash,
	}}, nil
}

func normalizeBakongCurrency(v string) string {
	switch strings.ToUpper(v) {
	case "840", "USD":
		return "USD"
	case "116", "KHR":
		return "KHR"
	default:
		return strings.ToUpper(v)
	}
}

func (p *BakongProvider) HandleWebhook(context.Context, []byte, string) (WebhookEvent, error) {
	return WebhookEvent{}, ErrUnsupported
}
func (p *BakongProvider) RefundPayment(context.Context, string, int) error { return ErrUnsupported }
