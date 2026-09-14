export function eventDate(value: string, compact = false) {
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "Date to be announced";
  return new Intl.DateTimeFormat(
    "en-GB",
    compact
      ? { day: "numeric", month: "short", timeZone: "UTC" }
      : {
          weekday: "short",
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        },
  ).format(new Date(`${day}T12:00:00Z`));
}
/** Month/day split for a stacked calendar-style badge ("JAN" over "01"), rather
 * than the single-line "1 Jan" `eventDate(_, true)` reads as a sentence fragment. */
export function eventDateParts(value: string): { month: string; day: string } | null {
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const date = new Date(`${day}T12:00:00Z`);
  return {
    month: new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" })
      .format(date)
      .toUpperCase(),
    day: new Intl.DateTimeFormat("en-GB", { day: "2-digit", timeZone: "UTC" }).format(date),
  };
}
export function eventTime(value: string) {
  // SQL TIME is serialized by Go with a synthetic date. It is Cambodian wall time.
  return value.match(/(?:T|^)(\d{2}:\d{2})/)?.[1] ?? "Time to be announced";
}
export function money(amount: number, currency: string) {
  if (amount === 0) return "Free";
  return currency === "KHR"
    ? `${amount.toLocaleString("en-US")} KHR`
    : `$${(amount / 100).toFixed(2)} USD`;
}
export function assetUrl(value: string, apiOrigin: string, webOrigin: string) {
  if (!value || value.startsWith("//")) return undefined;
  try {
    const base =
      value.startsWith("/uploads/") || value.startsWith("/api/")
        ? apiOrigin
        : webOrigin;
    const url = new URL(value, base);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}
/** A category can cut off entries before the event's own registration window closes
 * (see registration_deadline on EventCategory). Mirrors web's lib/registrationDeadline.ts. */
export function registrationDeadlineClosed(value?: string | null, now: Date = new Date()) {
  if (!value) return false;
  const deadline = new Date(value);
  return Number.isFinite(deadline.getTime()) && now.getTime() > deadline.getTime();
}
export function registrationDeadlineLabel(value?: string | null) {
  if (!value) return null;
  const deadline = new Date(value);
  if (!Number.isFinite(deadline.getTime())) return null;
  return `Closes ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(deadline)}`;
}
export const statusLabel: Record<string, string> = {
  REGISTRATION_OPEN: "Registration open",
  PUBLISHED: "Coming up",
  REGISTRATION_CLOSED: "Registration closed",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  DRAFT: "Draft",
  ARCHIVED: "Archived",
};
