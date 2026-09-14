// Stacked bands approximate a gradient without a library dependency. The
// solid zone has to be tall enough for the ENTIRE caption block, including
// `Copy`'s shared lineHeight:23 which the title/description below override
// explicitly -- an earlier version left that implicit, underestimated the
// real text height by ~25pt, and the title landed partly in the faded zone:
// legible in theory (verified against 0.85 opacity) but not in practice,
// because that opacity wasn't actually behind it. Confirmed by screenshot,
// not just recomputed on paper this time.
//
// Shared by both photo interstitials on the Events home screen (previously
// lived only in HeroCarousel.tsx, now used twice with different caption
// lengths -- see EventListScreen.tsx's PhotoInterstitial).
export const SCRIM_BANDS = [
  { height: 35, opacity: 0 },
  { height: 25, opacity: 0.4 },
  { height: 150, opacity: 0.88 },
];
export const SCRIM_HEIGHT = SCRIM_BANDS.reduce((sum, b) => sum + b.height, 0);
