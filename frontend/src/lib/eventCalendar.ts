import type { Event } from "../types";

const calendarTimeZone = "Asia/Phnom_Penh";

function escapeCalendarText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function compactDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}${match[2]}${match[3]}` : "";
}

function compactTime(value: string) {
  const match = value.match(/(?:^|T)(\d{2}):(\d{2})(?::(\d{2}))?/);
  return match ? `${match[1]}${match[2]}${match[3] || "00"}` : "060000";
}

function calendarTimestamp(now: Date) {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function eventCalendarFilename(event: Pick<Event, "slug">) {
  const safeSlug = event.slug.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${safeSlug || "unity-run-event"}.ics`;
}

export function buildEventCalendar(
  event: Pick<Event, "id" | "name" | "description" | "event_date" | "start_time" | "location">,
  eventURL: string,
  now = new Date(),
) {
  const date = compactDate(event.event_date);
  if (!date) throw new Error("This event does not have a valid race date.");
  const description = [event.description.trim(), `Event details: ${eventURL}`].filter(Boolean).join("\n\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Unity Runn Club//Race Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeCalendarText(event.id)}@unityrunn.club`,
    `DTSTAMP:${calendarTimestamp(now)}`,
    `DTSTART;TZID=${calendarTimeZone}:${date}T${compactTime(event.start_time)}`,
    "DURATION:PT3H",
    `SUMMARY:${escapeCalendarText(event.name)}`,
    `DESCRIPTION:${escapeCalendarText(description)}`,
    `LOCATION:${escapeCalendarText(event.location)}`,
    `URL:${eventURL}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
