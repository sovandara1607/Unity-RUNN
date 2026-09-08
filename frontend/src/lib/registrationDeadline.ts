import { formatEventDateTime } from "./eventFormat";

export function registrationDeadlineClosed(value?: string | null, now: Date = new Date()) {
  if (!value) return false;
  const deadline = new Date(value);
  return Number.isFinite(deadline.getTime()) && now.getTime() > deadline.getTime();
}

export function formatRegistrationDeadline(value?: string | null) {
  // A deadline is a real instant, so it is rendered in the viewer's own zone --
  // unlike event_date, which is a calendar date. See lib/eventFormat.ts.
  return formatEventDateTime(value, "No category cutoff");
}

export function toLocalDateTimeInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function registrationDeadlinePayload(value: string) {
  return value ? new Date(value).toISOString() : undefined;
}
