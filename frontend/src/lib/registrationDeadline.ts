export function registrationDeadlineClosed(value?: string | null, now: Date = new Date()) {
  if (!value) return false;
  const deadline = new Date(value);
  return Number.isFinite(deadline.getTime()) && now.getTime() > deadline.getTime();
}

export function formatRegistrationDeadline(value?: string | null) {
  if (!value) return "No category cutoff";
  const deadline = new Date(value);
  if (!Number.isFinite(deadline.getTime())) return "No category cutoff";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(deadline);
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
