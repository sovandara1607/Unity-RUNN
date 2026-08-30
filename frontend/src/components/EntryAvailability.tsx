import type { Availability } from "../types";
import { registrationDeadlineClosed } from "../lib/registrationDeadline";

export function entryAvailabilityLabel(availability?: Availability, registrationDeadline?: string | null, now: Date = new Date()) {
  if (registrationDeadlineClosed(registrationDeadline, now)) return { label: "Entry closed", full: true, urgent: true };
  if (!availability) return { label: "Checking places", full: false, urgent: false };
  if (availability.available <= 0) return { label: "Entry full", full: true, urgent: true };
  const urgent = availability.available <= 10 || availability.available / Math.max(availability.capacity, 1) <= 0.1;
  return {
    label: urgent ? `Only ${availability.available} ${availability.available === 1 ? "place" : "places"} left` : `${availability.available} places available`,
    full: false,
    urgent,
  };
}

export function EntryAvailability({ availability, appearance = "dark", registrationDeadline }: { availability?: Availability; appearance?: "dark" | "light"; registrationDeadline?: string | null }) {
  const state = entryAvailabilityLabel(availability, registrationDeadline);
  const foreground = appearance === "dark"
    ? state.full ? "text-rose-300" : state.urgent ? "text-amber-300" : "text-emerald-300"
    : state.full ? "text-rose-700" : state.urgent ? "text-amber-700" : "text-emerald-700";
  const dot = state.full ? "bg-rose-400" : state.urgent ? "bg-amber-400" : "bg-emerald-400";
  return (
    <span className={`inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.12em] ${availability ? foreground : appearance === "dark" ? "text-white/35" : "text-black/35"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${availability ? dot : appearance === "dark" ? "animate-pulse bg-white/30" : "animate-pulse bg-black/25"}`} aria-hidden />
      {state.label}
    </span>
  );
}
