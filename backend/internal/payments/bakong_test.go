package payments

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestBakongGetPaymentStatusSucceeded(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/check_transaction_by_md5" {
			t.Fatalf("path = %s", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer secret" {
			t.Fatalf("missing bearer token")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"responseCode":0,"responseMessage":"Success","data":{"hash":"tx-hash","toAccountId":"unity@bank","currency":"USD","amount":12.5}}`))
	}))
	defer server.Close()
	p, err := NewBakongProvider(BakongConfig{BaseURL: server.URL, Token: "secret", Merchant: testMerchant()})
	if err != nil {
		t.Fatal(err)
	}
	payment, err := p.GetPaymentStatus(context.Background(), "qr-md5")
	if err != nil {
		t.Fatal(err)
	}
	if payment.Status != StatusSucceeded || payment.Verification == nil {
		t.Fatalf("payment = %#v", payment)
	}
	if payment.Verification.AmountCents != 1250 || payment.Verification.Currency != "USD" {
		t.Fatalf("verification = %#v", payment.Verification)
	}
}

func TestBakongGetPaymentStatusPending(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"responseCode":1,"responseMessage":"Transaction not found","errorCode":1}`))
	}))
	defer server.Close()
	p, err := NewBakongProvider(BakongConfig{BaseURL: server.URL, Token: "secret", Merchant: testMerchant()})
	if err != nil {
		t.Fatal(err)
	}
	payment, err := p.GetPaymentStatus(context.Background(), "qr-md5")
	if err != nil {
		t.Fatal(err)
	}
	if payment.Status != StatusPending {
		t.Fatalf("status = %s", payment.Status)
	}
}

func TestBakongRejectsWrongReceiver(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"responseCode":0,"data":{"toAccountId":"attacker@bank","currency":"USD","amount":12.5}}`))
	}))
	defer server.Close()
	p, err := NewBakongProvider(BakongConfig{BaseURL: server.URL, Token: "secret", Merchant: testMerchant()})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := p.GetPaymentStatus(context.Background(), "qr-md5"); err == nil {
		t.Fatal("expected receiver mismatch")
	}
}

func testMerchant() KHQRMerchant {
	return KHQRMerchant{AccountID: "unity@bank", MerchantID: "UNITY001", AcquiringBank: "TESTBANK", MerchantName: "UNITY RUNN"}
}
