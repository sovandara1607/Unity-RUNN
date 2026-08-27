package payments

import (
	"strings"
	"testing"
	"time"
)

func TestGenerateMerchantKHQR(t *testing.T) {
	qr, ref, err := GenerateMerchantKHQR(KHQRMerchant{AccountID: "unity@bank", MerchantID: "UNITY001", AcquiringBank: "TESTBANK", MerchantName: "UNITY RUNN", MerchantCity: "PHNOM PENH"}, "registration-1", "USD", 1250, time.UnixMilli(1700000000000))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(qr, "5303840") || !strings.Contains(qr, "540512.50") {
		t.Fatalf("unexpected payload: %s", qr)
	}
	if len(ref) != 32 {
		t.Fatalf("expected MD5 reference, got %q", ref)
	}
	body := qr[:len(qr)-4]
	want := strings.ToUpper(qr[len(qr)-4:])
	got := strings.ToUpper(strings.TrimSpace(func() string { return fmtCRC(crc16CCITT([]byte(body))) }()))
	if got != want {
		t.Fatalf("CRC = %s, want %s", got, want)
	}
}

func fmtCRC(v uint16) string {
	const digits = "0123456789ABCDEF"
	return string([]byte{digits[v>>12], digits[(v>>8)&15], digits[(v>>4)&15], digits[v&15]})
}
