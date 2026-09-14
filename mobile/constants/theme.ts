// Palette per the product owner's explicit direction (superseding the earlier
// web-CSS-derived near-black): near-black background, a distinct raised
// surface, lime as the one primary accent, blue demoted to a sparing
// event-specific accent rather than a second brand color. See DESIGN.md.
// `ink` doubles as both the base surface color and the text color used ON
// the lime/light brand surfaces.
export const colors = {
  ink: "#0c0c0c",
  lime: "#d9ff00",
  blue: "#3155ff",
  // Brand blue lightened for small text set directly on the ink surface.
  // Raw `blue` text-on-ink measures well under WCAG AA 4.5:1; this variant
  // measures 6.96:1. Use `blue` only as a filled background (white text on
  // it already passes) and `blueText` for the accent color itself as text.
  blueText: "#7c93ff",
  white: "#ffffff",
  canvas: "#171717",
  // Warm gray, not the cooler blue-tinted gray this replaced: measured
  // 7.76:1 on `ink`, 7.11:1 on `canvas`.
  muted: "#a8a29e",
  // 0.4 alpha, not a "looks like a hairline" 0.14: a border is a non-text
  // UI boundary and needs 3:1 against the surfaces it separates (WCAG
  // 1.4.11). Verified against both `ink` and `canvas`.
  line: "rgba(255,255,255,0.4)",
  error: "#ff5470",
};
export const fonts = {
  display: "Anton_400Regular",
  body: "Inter_400Regular",
  medium: "Inter_500Medium",
  bold: "Inter_700Bold",
};
