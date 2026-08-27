package events

import (
	"bytes"
	"errors"
	"image"
	"image/color"
	"image/draw"
	"image/jpeg"
	_ "image/png"
	"math"

	xdraw "golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
)

const (
	DefaultPosterWidth  = 1200
	DefaultPosterHeight = 1500
	minPosterDimension  = 400
	maxPosterDimension  = 2400
	posterJPEGQuality   = 88
	maxPosterPixels     = 50_000_000
	maxOutputPixels     = 4_500_000
)

var errInvalidPosterImage = errors.New("events: invalid poster image")

// normalizePoster converts an upload into the administrator-selected artboard
// Center-cropping avoids stretching while producing stable dimensions for R2
func normalizePoster(data []byte, width, height int) ([]byte, error) {
	if width < minPosterDimension || width > maxPosterDimension || height < minPosterDimension || height > maxPosterDimension || int64(width)*int64(height) > maxOutputPixels {
		return nil, errInvalidPosterImage
	}
	config, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || config.Width <= 0 || config.Height <= 0 {
		return nil, errInvalidPosterImage
	}
	if int64(config.Width)*int64(config.Height) > maxPosterPixels {
		return nil, errInvalidPosterImage
	}

	source, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, errInvalidPosterImage
	}
	sourceBounds := source.Bounds()
	sourceWidth, sourceHeight := sourceBounds.Dx(), sourceBounds.Dy()
	if sourceWidth <= 0 || sourceHeight <= 0 {
		return nil, errInvalidPosterImage
	}

	scale := math.Max(float64(width)/float64(sourceWidth), float64(height)/float64(sourceHeight))
	scaledWidth := int(math.Ceil(float64(sourceWidth) * scale))
	scaledHeight := int(math.Ceil(float64(sourceHeight) * scale))
	scaled := image.NewRGBA(image.Rect(0, 0, scaledWidth, scaledHeight))
	xdraw.CatmullRom.Scale(scaled, scaled.Bounds(), source, sourceBounds, xdraw.Over, nil)

	poster := image.NewRGBA(image.Rect(0, 0, width, height))
	draw.Draw(poster, poster.Bounds(), &image.Uniform{C: color.RGBA{R: 17, G: 17, B: 17, A: 255}}, image.Point{}, draw.Src)
	cropOrigin := image.Pt((scaledWidth-width)/2, (scaledHeight-height)/2)
	draw.Draw(poster, poster.Bounds(), scaled, cropOrigin, draw.Over)

	var output bytes.Buffer
	if err := jpeg.Encode(&output, poster, &jpeg.Options{Quality: posterJPEGQuality}); err != nil {
		return nil, err
	}
	return output.Bytes(), nil
}

// posterVariant creates a smaller, aspect-preserving derivative of an already normalized poster. Public cards can load this instead of the full artboard
func posterVariant(data []byte, maxWidth, maxHeight, quality int) ([]byte, error) {
	source, err := jpeg.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, errInvalidPosterImage
	}
	bounds := source.Bounds()
	scale := math.Min(float64(maxWidth)/float64(bounds.Dx()), float64(maxHeight)/float64(bounds.Dy()))
	if scale > 1 {
		scale = 1
	}
	width := max(1, int(math.Round(float64(bounds.Dx())*scale)))
	height := max(1, int(math.Round(float64(bounds.Dy())*scale)))
	variant := image.NewRGBA(image.Rect(0, 0, width, height))
	xdraw.CatmullRom.Scale(variant, variant.Bounds(), source, bounds, xdraw.Over, nil)
	var output bytes.Buffer
	if err := jpeg.Encode(&output, variant, &jpeg.Options{Quality: quality}); err != nil {
		return nil, err
	}
	return output.Bytes(), nil
}
