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
export const statusLabel: Record<string, string> = {
  REGISTRATION_OPEN: "Registration open",
  PUBLISHED: "Coming up",
  REGISTRATION_CLOSED: "Registration closed",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  DRAFT: "Draft",
  ARCHIVED: "Archived",
};
