# Design direction — Unity Runn Club mobile

Source of truth, in priority order: (1) explicit direction from the product
owner given directly in conversation, (2) the live public web app's design
system (`frontend/src/styles/globals.css`, the rendered homepage). This file
started as a transcription of (2); the palette and information-architecture
sections below were since revised by an explicit owner brief (see "Owner
revision" callouts) and that direction now wins where the two disagree.

## Identity

Unity Runn Club is a community running club in Phnom Penh. The brand voice
is a sports poster, not a SaaS dashboard: bold, high-contrast, physical.
Photography of real runners, condensed display type shouting the headline,
one electric accent color used with confidence rather than restraint.

## Palette

**Owner revision:** the web's exact `#111111`/`#1a1a1a` pair and the
full-bleed blue event card read as a second brand competing with lime.
Superseded with:

| Role | Value | Note |
|---|---|---|
| Background | `#0c0c0c` | near-black, was `#111111` |
| Surface (cards, inputs, raised) | `#171717` | was `#1a1a1a` |
| Primary accent | `#d9ff00` lime | unchanged, the one primary accent |
| Secondary accent | `#3155ff` blue | **demoted**: an event-specific accent (status text, a filled badge) only, never a dominant field. The `EventImage` fallback that used to flood `colors.blue` across the whole card now sits on `colors.canvas` instead. |
| Text on brand/light surfaces | `#0c0c0c` | same role as before, new value |

Neutral text/border scale, verified against WCAG AA with the antislop
contrast checker (not eyeballed) on the current `#0c0c0c`/`#171717` pair:

| Role | Value | Contrast |
|---|---|---|
| Primary text (white) | `#ffffff` on `#0c0c0c` | 19.56:1 |
| Muted text (warm gray, was a cooler blue-tinted gray) | `#a8a29e` on `#0c0c0c` | 7.76:1 |
| Error | `#ff5470` on `#0c0c0c` | 6.29:1 |
| Blue as small text-on-dark | `#7c93ff` on `#0c0c0c` | 6.96:1 (raw brand blue `#3155ff` fails under 4.5:1 for normal text; only use raw blue as a filled background, never as text on the background/surface) |
| Hairline border | `rgba(255,255,255,0.4)` on `#0c0c0c` / `#171717` | 3.78:1 / non-text minimum |

Cap: 2 core neutrals (ink, white) + 2 brand accents (lime, blue-as-accent).
Muted, canvas, line, and error are structural/semantic, not part of the
"look at me" palette. Lime is used more liberally than a typical accent
would be — that's a deliberate brand trait, not an "accent everywhere"
default, but it is now the *only* liberally-used accent; blue no longer
competes with it for that role.

## Typography

- Display: Anton (condensed, no width axis — matches `--font-display` /
  `.sport-display` on web). Used uppercase, tight leading, for headlines
  only. This is the identity motif: swap the logo and the Anton headline
  treatment is still recognizably this product.
  - **Note: mobile currently loads Anton at regular weight/tracking, not
    the web's tight negative letter-spacing (`-0.03em` to `-0.045em`) and
    near-0.7-0.9 leading.** React Native's `letterSpacing` and `lineHeight`
    can approximate this; not yet matched. Worth a follow-up pass.
- Body: Inter (400/500/700). Chosen because it's what the web app already
  loads (`--font-secondary`), not because it's a default pick.
- No monospace-as-aesthetic, no wide-tracked uppercase labels for body
  copy. Eyebrows are the one deliberate uppercase-tracked exception
  (11px, 1.6 tracking) and they run in lime, mirroring the web's lime
  eyebrow labels on dark sections.

## Shape

- Not a pill-everything system. Radius varies by role: primary CTAs and
  filter chips are fully rounded (pill), matching the web's "BROWSE
  RACES ↗" hero CTA and pagination dots. Cards, inputs, and badges use a
  smaller radius (12-24px depending on size), matching the web's
  `--radius` system (~10px base, scaled up for hero-sized elements).

## Motion

**Owner revision:** entrance motion is now implemented on the Events screen
via `react-native-reanimated` (confirmed working: `babel-preset-expo`
auto-detects `react-native-worklets` and wires the transform, no
`babel.config.js` needed):
- Hero text: fade + slight rise on mount (`FadeInDown`, 320ms).
- Cards (featured + compact rows): custom entering animation, scale
  0.97 → 1 + fade, 220ms eased out, staggered ~40ms per row. Deliberately
  fast, not springy — "sporty", not floaty, per the owner's own framing.
- Filter chips: the lime selection pill cross-fades via
  `interpolateColor` (160ms) instead of snapping.

**Not implemented, flagged honestly rather than faked:** scroll-based
parallax on cards. This needs `useAnimatedScrollHandler` wired through
`FlatList`'s scroll offset and per-item interpolation — real engineering
risk to add blind (no way to visually verify scroll-driven motion via
static screenshots in this environment). Left for a follow-up with actual
device-in-hand verification.

## Dials

- **ENERGY: 3** — bold display type, high-saturation lime, photography-led
  hero. This is closer to an agency sports brand than a SaaS product.
- **RHYTHM: 2** — screens should avoid "every section is centered title +
  card grid": the featured event card, compact row list, wallet QR block,
  and a plain settings row are intentionally different shapes.
- **MOTION: 2** — entrance animation now exists (see above) with a stated
  purpose (guide attention to what just loaded, distinguish the featured
  card), not a decorative loop. Parallax remains a target, not yet built.

## Information architecture — Events screen

**Owner revision:** the previous Events screen was a wordmark header, an
oversized hero (~40% of first screen), a redundant "All events" filter +
"N events" count line immediately under it, and a uniform list of
identically-styled cards. Redesigned per an explicit owner brief into:

- Header: `UNITY RUNN CLUB` + a location icon/label (not raw "PHNOM PENH,
  KH" text) + a profile icon, right-aligned.
- Hero shrunk (52px → 46px, tighter spacing): "FIND YOUR NEXT RACE."
- Filters relabeled `Upcoming` / `Open for entry` / `Past` (was "All
  events" / "Open for entry" / "Past races"), and the redundant count line
  removed. `Upcoming`'s underlying status filter was also *narrowed* to
  exclude `COMPLETED` — the old "All events" value included it, which
  would make the new label lie.
- The soonest event becomes a "Featured race" card: real cover photo (or
  the non-blue-flooded fallback) or artwork, a stacked month/day badge
  (`JAN` / `01`), distances pulled from one extra detail fetch (the list
  endpoint doesn't return categories — see `events.Handler.List` in the
  backend, which masks them for non-staff callers), and an explicit
  "View event →" action.
- Remaining events render as compact single-line rows under "More races",
  not full cards — a real information hierarchy (one thing worth a big
  card, several things worth a row), not decoration.
- **What the owner's mock also proposed that was deliberately not built:**
  a second "RUN WITH THE COMMUNITY" section for club runs/training
  sessions. The backend has no such distinction — every record is just an
  `Event` with no type field separating races from social runs. Building
  that section would mean inventing a content category the data doesn't
  support (the antislop rule this would break: don't add a section that
  isn't backed by real content). If the club wants that distinction, it
  needs an `event_type` (or similar) field on the backend first.

## What NOT to copy from web

- The web's shadcn/admin token set (`oklch(...)` neutrals, `--radius:
  0.625rem` sidebar system) is the **admin dashboard**, a different
  product surface. Mobile mirrors the **public site's** brand only.
- Don't port the web's CSS-only decorative touches (topo background
  pattern, admin track-surface grid lines) — they're scoped to specific
  admin/marketing contexts, not the general app chrome.
