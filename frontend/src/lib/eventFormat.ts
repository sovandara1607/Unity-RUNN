/**
 * One place for turning event data into words.
 *
 * Before this module, five pages each defined their own `formatDate`, three defined their
 * own status vocabulary, and two rendered times in 24h while a third rendered 12h. Two
 * genuine bugs came out of that spread, both fixed here:
 *
 *  1. `event_date` is a SQL DATE, serialized as "2026-09-05T00:00:00Z". Formatting it in
 *     the browser's local zone shifts it backward anywhere west of UTC -- a runner in New
 *     York saw a Saturday race listed as Friday. Date-only values are formatted in UTC so
 *     the calendar date survives.
 *  2. Every formatter passed `undefined` as the locale, so a Khmer-locale browser rendered
 *     Khmer dates inside otherwise English chrome. The locale is explicit.
 *
 * `start_time` is a SQL TIME -- a bare wall clock with no zone. It must be read literally,
 * never converted, or a 09:00 start would drift by the viewer's offset.
 */

const LOCALE = "en-GB";

const DATE_STYLES = {
  /** 05 Sep 2026 — dense contexts: cards, tables */
  short: { day: "2-digit", month: "short", year: "numeric" },
  /** Sat, 5 Sep — the runner's own entries, where the year is implied */
  compact: { weekday: "short", day: "numeric", month: "short" },
  /** 5 September 2026 */
  medium: { day: "numeric", month: "long", year: "numeric" },
  /** Saturday, 5 September 2026 — hero and confirmation contexts */
  long: { weekday: "long", day: "numeric", month: "long", year: "numeric" },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;

export type EventDateStyle = keyof typeof DATE_STYLES;

/** Reads the calendar date out of a date-only value without letting the local zone shift it. */
function parseCalendarDate(value?: string | null): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match) {
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

/**
 * en-GB is the only English family that renders day-first, but it abbreviates September
 * as "Sept" -- the sole four-letter month abbreviation. The calendar block sets the month
 * in a fixed-width disc under the day numeral, so a stray fourth character breaks the
 * column. Every abbreviation is normalised to three letters.
 */
function threeLetterMonth(value: string): string {
  return value.replace(/\bSept\b/, "Sep");
}

export function formatEventDate(value?: string | null, style: EventDateStyle = "short", fallback = "Date TBC"): string {
  const date = parseCalendarDate(value);
  if (!date) return fallback;
  return threeLetterMonth(new Intl.DateTimeFormat(LOCALE, { ...DATE_STYLES[style], timeZone: "UTC" }).format(date));
}

/** The day/month/weekday pieces a calendar block renders separately. */
export function formatEventDateParts(value?: string | null): { day: string; month: string; weekday: string } {
  const date = parseCalendarDate(value);
  if (!date) return { day: "--", month: "TBC", weekday: "" };
  const part = (options: Intl.DateTimeFormatOptions) =>
    threeLetterMonth(new Intl.DateTimeFormat(LOCALE, { ...options, timeZone: "UTC" }).format(date));
  return {
    day: part({ day: "2-digit" }),
    month: part({ month: "short" }),
    weekday: part({ weekday: "short" }),
  };
}

/**
 * Formats a bare wall-clock start time as 24h, which is how race schedules are published
 * in Cambodia and how the admin enters them.
 */
export function formatEventTime(value?: string | null, fallback = "Time TBC"): string {
  if (!value) return fallback;
  const match = /(\d{2}):(\d{2})/.exec(value.includes("T") ? value.slice(11) : value);
  if (!match) return fallback;
  return `${match[1]}:${match[2]}`;
}

/** A real instant (registration deadlines), which genuinely belongs in the viewer's zone. */
export function formatEventDateTime(value?: string | null, fallback = "No cutoff"): string {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return fallback;
  return threeLetterMonth(new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(parsed));
}

// --- Status vocabulary ------------------------------------------------------
//
// One phrase per state, in the site's terse voice. `tone` is semantic rather than a class
// string so each surface can style it its own way (black chip, tinted pill, dot).

export type StatusTone = "open" | "closed" | "soon" | "done" | "cancelled";

const EVENT_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  REGISTRATION_OPEN: { label: "Entry open", tone: "open" },
  REGISTRATION_CLOSED: { label: "Entry closed", tone: "closed" },
  PUBLISHED: { label: "Opens soon", tone: "soon" },
  COMPLETED: { label: "Completed", tone: "done" },
  CANCELLED: { label: "Cancelled", tone: "cancelled" },
};

const EVENT_STATUS_FALLBACK = { label: "Opens soon", tone: "soon" } as const;

export function eventStatusLabel(status?: string | null): string {
  return (status && EVENT_STATUS[status]?.label) || EVENT_STATUS_FALLBACK.label;
}

export function eventStatusTone(status?: string | null): StatusTone {
  return (status && EVENT_STATUS[status]?.tone) || EVENT_STATUS_FALLBACK.tone;
}

/** A runner's own entry, where "checked in" outranks the stored status. */
export function registrationStatusLabel(registration: { status: string; checked_in_at?: string | null }): string {
  if (registration.checked_in_at) return "Checked in";
  if (registration.status === "PENDING") return "Payment due";
  if (registration.status === "CONFIRMED") return "Confirmed";
  if (registration.status === "CANCELLED") return "Cancelled";
  return "Refunded";
}

export function registrationStatusTone(registration: { status: string; checked_in_at?: string | null }): StatusTone {
  if (registration.checked_in_at) return "done";
  if (registration.status === "PENDING") return "soon";
  if (registration.status === "CONFIRMED") return "open";
  return "cancelled";
}
