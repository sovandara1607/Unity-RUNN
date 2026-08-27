import type { Event } from "../types";

export function parseEventCoordinates(latitude: string, longitude: string) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!latitude.trim() && !longitude.trim()) return null;
  if (!latitude.trim() || !longitude.trim()) throw new Error("Add both latitude and longitude, or remove the map pin.");
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error("Latitude must be between -90 and 90.");
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new Error("Longitude must be between -180 and 180.");
  return { latitude: lat, longitude: lng };
}

export function eventMapURL(event: Pick<Event, "location" | "latitude" | "longitude">) {
  const query = event.latitude != null && event.longitude != null
    ? `${event.latitude},${event.longitude}`
    : event.location;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
