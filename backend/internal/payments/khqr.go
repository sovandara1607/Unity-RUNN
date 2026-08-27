package payments

import (
	"crypto/md5" // KHQR/Open API identifies a QR by MD5, per NBC's protocol.
	"encoding/hex"
	"fmt"
	"strconv"
	"strings"
	"time"
)

type KHQRMerchant struct {
	AccountID     string
	MerchantID    string
	AcquiringBank string
	MerchantName  string
	MerchantCity  string
	MCC           string
	StoreLabel    string
	TerminalLabel string
}

func GenerateMerchantKHQR(m KHQRMerchant, reference, currency string, amountCents int, at time.Time) (string, string, error) {
	if m.AccountID == "" || m.MerchantID == "" || m.AcquiringBank == "" || m.MerchantName == "" {
		return "", "", fmt.Errorf("payments: incomplete Bakong merchant identity")
	}
	if amountCents <= 0 {
		return "", "", fmt.Errorf("payments: amount must be positive")
	}
	numericCurrency := map[string]string{"USD": "840", "KHR": "116"}[strings.ToUpper(currency)]
	if numericCurrency == "" {
		return "", "", fmt.Errorf("payments: unsupported KHQR currency %q", currency)
	}
	amount := fmt.Sprintf("%.2f", float64(amountCents)/100)
	if numericCurrency == "116" {
		amount = strconv.Itoa(amountCents) // KHR is stored in the smallest unit (1 riel).
	}
	merchantAccount := tlv("00", clean(m.AccountID, 32)) + tlv("01", clean(m.MerchantID, 32)) + tlv("02", clean(m.AcquiringBank, 32))
	additional := tlv("01", clean(reference, 25))
	if m.StoreLabel != "" {
		additional += tlv("03", clean(m.StoreLabel, 25))
	}
	if m.TerminalLabel != "" {
		additional += tlv("07", clean(m.TerminalLabel, 25))
	}
	timestamp := tlv("00", strconv.FormatInt(at.UnixMilli(), 10))
	payload := tlv("00", "01") + tlv("01", "12") + tlv("30", merchantAccount) +
		tlv("52", defaultValue(m.MCC, "5999")) + tlv("53", numericCurrency) + tlv("54", amount) +
		tlv("58", "KH") + tlv("59", clean(m.MerchantName, 25)) + tlv("60", clean(defaultValue(m.MerchantCity, "PHNOM PENH"), 15)) +
		tlv("62", additional) + tlv("99", timestamp) + "6304"
	payload += fmt.Sprintf("%04X", crc16CCITT([]byte(payload)))
	sum := md5.Sum([]byte(payload))
	return payload, hex.EncodeToString(sum[:]), nil
}

func tlv(tag, value string) string { return fmt.Sprintf("%s%02d%s", tag, len([]byte(value)), value) }

func clean(value string, max int) string {
	value = strings.TrimSpace(value)
	if len([]byte(value)) <= max {
		return value
	}
	b := []byte(value)
	return string(b[:max])
}

func defaultValue(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}

func crc16CCITT(data []byte) uint16 {
	crc := uint16(0xFFFF)
	for _, b := range data {
		crc ^= uint16(b) << 8
		for range 8 {
			if crc&0x8000 != 0 {
				crc = (crc << 1) ^ 0x1021
			} else {
				crc <<= 1
			}
		}
	}
	return crc
}
