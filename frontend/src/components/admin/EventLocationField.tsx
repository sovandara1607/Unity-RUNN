import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ExternalLink, LocateFixed, MapPin, Trash2 } from "lucide-react";
import { parseEventCoordinates } from "../../lib/eventLocation";

const EventLocationMap = dynamic(
  () => import("./EventLocationMap").then((module) => module.EventLocationMap),
  { ssr: false, loading: () => <div className="h-full w-full animate-pulse bg-slate-200" /> },
);

interface EventLocationFieldProps {
  location: string;
  latitude: string;
  longitude: string;
  disabled?: boolean;
  onChange: (next: { location: string; latitude: string; longitude: string }) => void;
}

export function EventLocationField({ location, latitude, longitude, disabled, onChange }: EventLocationFieldProps) {
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const coordinates = useMemo(() => {
    try {
      return parseEventCoordinates(latitude, longitude);
    } catch {
      return null;
    }
  }, [latitude, longitude]);

  const mapLink = coordinates
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${coordinates.latitude},${coordinates.longitude}`)}`
    : "";

  const useCurrentLocation = () => {
    setLocationError(null);
    if (!navigator.geolocation) {
      setLocationError("Location access is not available in this browser.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        onChange({ location, latitude: coords.latitude.toFixed(6), longitude: coords.longitude.toFixed(6) });
        setLocating(false);
      },
      () => {
        setLocationError("Location access was unavailable. Enter the coordinates manually.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-xs font-bold text-slate-900"><MapPin className="h-4 w-4 text-[#3155ff]" />Event location</p>
              <p className="mt-1 text-[11px] leading-5 text-slate-500">Enter the venue, then click its meeting point on the map.</p>
            </div>
            {coordinates && (
              <button type="button" disabled={disabled} onClick={() => onChange({ location, latitude: "", longitude: "" })} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-[10px] font-bold text-slate-500 transition hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50">
                <Trash2 className="h-3.5 w-3.5" />Remove pin
              </button>
            )}
          </div>

          <label htmlFor="event-location" className="mt-5 block text-xs font-semibold text-slate-700">Location / venue *</label>
          <input id="event-location" type="text" required value={location} onChange={(event) => onChange({ location: event.target.value, latitude, longitude })} placeholder="Koh Pich, Phnom Penh, Cambodia" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-[#3155ff] focus:ring-2 focus:ring-[#3155ff]/15" />

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" disabled={disabled || locating} onClick={useCurrentLocation} className="inline-flex items-center gap-2 rounded-xl bg-[#111] px-3.5 py-2.5 text-[10px] font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#3155ff] disabled:opacity-50">
              <LocateFixed className="h-3.5 w-3.5" />{locating ? "Finding…" : "Use my location"}
            </button>
            {mapLink && <a href={mapLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[10px] font-bold text-[#3155ff] hover:underline">Check in Google Maps <ExternalLink className="h-3 w-3" /></a>}
          </div>
          {locationError && <p className="mt-3 text-[11px] font-semibold text-rose-700" role="alert">{locationError}</p>}

          <details className="mt-5 border-t border-slate-200 pt-4">
            <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400 transition hover:text-slate-700">Advanced coordinates</summary>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="event-latitude" className="block text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Latitude</label>
                <input id="event-latitude" type="number" step="any" min="-90" max="90" value={latitude} onChange={(event) => onChange({ location, latitude: event.target.value, longitude })} placeholder="11.5564" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs outline-none transition focus:border-[#3155ff] focus:ring-2 focus:ring-[#3155ff]/15" />
              </div>
              <div>
                <label htmlFor="event-longitude" className="block text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Longitude</label>
                <input id="event-longitude" type="number" step="any" min="-180" max="180" value={longitude} onChange={(event) => onChange({ location, latitude, longitude: event.target.value })} placeholder="104.9282" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs outline-none transition focus:border-[#3155ff] focus:ring-2 focus:ring-[#3155ff]/15" />
              </div>
            </div>
          </details>
        </div>

        <div className="relative h-72 border-t border-slate-200 bg-slate-200 lg:h-auto lg:min-h-full lg:border-l lg:border-t-0">
          <EventLocationMap
            coordinates={coordinates}
            onPick={({ latitude: nextLatitude, longitude: nextLongitude }) => onChange({ location, latitude: nextLatitude.toFixed(6), longitude: nextLongitude.toFixed(6) })}
          />
          <div className="pointer-events-none absolute left-3 top-3 z-[500] rounded-lg bg-[#111] px-3 py-2 text-[9px] font-black uppercase tracking-[0.1em] text-white shadow-lg">
            {coordinates ? "Click to move pin" : "Click to place pin"}
          </div>
        </div>
      </div>
    </section>
  );
}
