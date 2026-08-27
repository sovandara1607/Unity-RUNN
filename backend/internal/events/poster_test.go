package events

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"testing"
)

// TestPosterVariantPreservesAspectRatioWithinBounds tests the poster variant that preserves aspect ratio within bounds
func TestPosterVariantPreservesAspectRatioWithinBounds(t *testing.T) {
	source := image.NewRGBA(image.Rect(0, 0, 1200, 1500))
	for y := 0; y < 1500; y++ {
		for x := 0; x < 1200; x++ {
			source.Set(x, y, color.RGBA{R: uint8(x % 255), G: uint8(y % 255), B: 90, A: 255})
		}
	}
	var encoded bytes.Buffer
	if err := jpeg.Encode(&encoded, source, &jpeg.Options{Quality: 88}); err != nil {
		t.Fatalf("encode source: %v", err)
	}

	variant, err := posterVariant(encoded.Bytes(), 720, 720, 82)
	if err != nil {
		t.Fatalf("posterVariant: %v", err)
	}
	config, err := jpeg.DecodeConfig(bytes.NewReader(variant))
	if err != nil {
		t.Fatalf("decode variant config: %v", err)
	}
	if config.Width != 576 || config.Height != 720 {
		t.Fatalf("variant dimensions = %dx%d, want 576x720", config.Width, config.Height)
	}
}
