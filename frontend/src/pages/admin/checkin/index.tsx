import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle, AlertTriangle, CheckCircle, Clock, Volume2, VolumeX,
} from "lucide-react";
import { AdminLayout } from "../../../components/admin/AdminLayout";
import { QRCodeScanner } from "../../../components/admin/QRCodeScanner";
import { withMinSkeleton } from "../../../lib/withMinSkeleton";
import { api } from "../../../lib/api";
import type { Event, Registration } from "../../../types";

function playSound(type: "success" | "warning" | "error") {
  if (typeof window === "undefined") return;
  try {
    const BrowserAudioContext = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!BrowserAudioContext) return;
    const context = new BrowserAudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type === "warning" ? "sawtooth" : type === "error" ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(type === "success" ? 587.33 : type === "warning" ? 220 : 300, context.currentTime);
    oscillator.frequency.setValueAtTime(type === "success" ? 880 : type === "warning" ? 196 : 150, context.currentTime + 0.14);
    gain.gain.setValueAtTime(type === "warning" ? 0.15 : 0.2, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.38);
    oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + 0.4);
  } catch {
    // Browsers may restrict audio until the volunteer interacts with the page.
  }
}

interface ScanResult {
  status: "success" | "already_checked_in" | "error";
  message: string;
  registration?: Registration;
  timestamp: string;
}

type ApiError = Error & { code?: string; status?: number };
type RecentCheckin = { name: string; number: string; tshirt: string; time: string };

function recentForEvent(registrations: Registration[], eventId: string): RecentCheckin[] {
  return registrations
    .filter((registration) => registration.event_id === eventId && Boolean(registration.checked_in_at))
    .sort((a, b) => String(b.checked_in_at).localeCompare(String(a.checked_in_at)))
    .slice(0, 15)
    .map((registration) => ({
      name: registration.full_name,
      number: registration.registration_number,
      tshirt: registration.tshirt_size,
      time: new Date(registration.checked_in_at as string).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    }));
}

export default function AdminCheckinPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [manualToken, setManualToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [stationError, setStationError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [recentCheckins, setRecentCheckins] = useState<RecentCheckin[]>([]);
  const manualInputRef = useRef<HTMLInputElement>(null);

  const loadStation = useCallback(async () => {
    try {
      setLoading(true);
      setStationError(null);
      const [eventsResponse, registrationsResponse] = await withMinSkeleton(() => Promise.all([
        api.listEvents({ limit: 50 }),
        api.adminListRegistrations({ limit: 300 }),
      ]));
      const eventList = (eventsResponse.events || []).filter((event) => ["PUBLISHED", "REGISTRATION_OPEN", "REGISTRATION_CLOSED"].includes(event.status));
      const registrationList = registrationsResponse.registrations || [];
      setEvents(eventList);
      setRegistrations(registrationList);
      const initialEventId = eventList[0]?.id || "";
      setSelectedEventId(initialEventId);
      setRecentCheckins(initialEventId ? recentForEvent(registrationList, initialEventId) : []);
    } catch (error) {
      setStationError(error instanceof Error ? error.message : "The check-in station could not load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStation();
  }, [loadStation]);

  // Scanning happens once per runner at the gate -- potentially hundreds of times per
  // session -- so this indexes id/registration_number/email once per data change instead
  // of re-scanning the full registrations array on every single scan.
  const registrationIndex = useMemo(() => {
    const index = new Map<string, Registration>();
    for (const registration of registrations) {
      if (registration.event_id !== selectedEventId) continue;
      index.set(registration.id, registration);
      if (registration.registration_number) index.set(registration.registration_number.toLowerCase(), registration);
      if (registration.email) index.set(registration.email.toLowerCase(), registration);
    }
    return index;
  }, [registrations, selectedEventId]);

  const resolveScanTarget = useCallback(
    (token: string) => registrationIndex.get(token) ?? registrationIndex.get(token.toLowerCase()),
    [registrationIndex],
  );

  const handleProcessScan = async (tokenOrId: string) => {
    const raw = tokenOrId.trim();
    if (!raw || processing) return;
    if (!selectedEventId) {
      setLastResult({ status: "error", message: "Select an event before scanning.", timestamp: new Date().toLocaleTimeString() });
      return;
    }

    setProcessing(true); setManualToken("");
    try {
      const match = resolveScanTarget(raw);
      const response = await api.checkIn({ eventId: selectedEventId, qrToken: match?.registration_number || raw });
      if (soundEnabled) playSound("success");
      const scannedRegistration = response.registration;
      setRegistrations((current) => current.map((registration) => registration.id === scannedRegistration.id ? { ...registration, checked_in_at: response.check_in.checked_in_at } : registration));
      setLastResult({ status: "success", message: "Ticket verified. Hand over the runner kit and admit entry.", registration: scannedRegistration, timestamp: new Date().toLocaleTimeString() });
      setRecentCheckins((current) => [{
        name: scannedRegistration.full_name || "Runner",
        number: scannedRegistration.registration_number || scannedRegistration.id.slice(0, 8),
        tshirt: scannedRegistration.tshirt_size || "M",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      }, ...current.slice(0, 14)]);
    } catch (caught: unknown) {
      const error = caught as ApiError;
      const alreadyCheckedIn = error.message?.includes("already") || error.code === "already_checked_in";
      if (alreadyCheckedIn) {
        if (soundEnabled) playSound("warning");
        setLastResult({
          status: "already_checked_in",
          message: "This runner was admitted earlier. Do not issue another kit.",
          registration: resolveScanTarget(raw),
          timestamp: new Date().toLocaleTimeString(),
        });
      } else {
        if (soundEnabled) playSound("error");
        setLastResult({ status: "error", message: error.code === "wrong_event" ? "This ticket belongs to another event. Switch the gate assignment before scanning it." : error.message || "The ticket code could not be verified.", timestamp: new Date().toLocaleTimeString() });
      }
    } finally {
      setProcessing(false);
      manualInputRef.current?.focus();
    }
  };

  const confirmedRegistrations = registrations.filter((registration) => registration.event_id === selectedEventId && registration.status === "CONFIRMED");
  const checkedInCount = confirmedRegistrations.filter((registration) => Boolean(registration.checked_in_at)).length;
  const confirmedCount = confirmedRegistrations.length;
  const remainingCount = Math.max(0, confirmedCount - checkedInCount);
  const progressPercent = confirmedCount === 0 ? 0 : Math.min(100, Math.round((checkedInCount / confirmedCount) * 100));
  const selectedEvent = events.find((event) => event.id === selectedEventId);

  return (
    <AdminLayout
      title="Check-in station"
      subtitle="Verify tickets and hand over runner kits"
      plainSurface
      actions={
        <button
          type="button"
          onClick={() => setSoundEnabled((enabled) => !enabled)}
          className={`flex min-h-11 items-center gap-2 rounded-md border px-3.5 text-sm font-semibold transition-colors ${soundEnabled ? "border-black/15 bg-white text-slate-800 hover:bg-slate-50" : "border-amber-400 bg-amber-50 text-amber-900"}`}
          aria-label={soundEnabled ? "Mute check-in sounds" : "Enable check-in sounds"}
        >
          {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          <span>{soundEnabled ? "Sound on" : "Sound off"}</span>
        </button>
      }
    >
      {loading ? (
        <section className="grid min-h-[420px] place-items-center rounded-xl border border-black/15 bg-white p-8 text-center" aria-live="polite">
          <div>
            <div aria-hidden className="mx-auto h-8 w-8 border-2 border-black/15 border-t-black motion-safe:animate-spin" />
            <h2 className="mt-5 text-lg font-bold">Loading the check-in desk</h2>
            <p className="mt-2 text-sm text-black/60">Getting the event and runner list.</p>
          </div>
        </section>
      ) : stationError ? (
        <section className="rounded-xl border border-red-300 bg-red-50 p-6 text-red-950" role="alert">
          <h2 className="text-lg font-bold">The check-in desk did not load</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6">{stationError}</p>
          <button type="button" onClick={() => void loadStation()} className="mt-5 min-h-11 rounded-md bg-[#151515] px-5 text-sm font-bold text-white hover:bg-black">Retry loading</button>
        </section>
      ) : events.length === 0 ? (
        <section className="rounded-xl border border-black/15 bg-white p-8 sm:p-12">
          <h2 className="text-xl font-bold text-slate-950">No event is ready for check-in</h2>
          <p className="mt-2 text-sm text-slate-600">Publish an event before opening this station.</p>
        </section>
      ) : (
        <>
          <section className="mb-6 overflow-hidden rounded-xl border border-black/15 bg-white">
            <div className="grid lg:grid-cols-[minmax(0,1fr)_420px]">
              <div className="border-b border-black/10 p-5 sm:p-6 lg:border-b-0 lg:border-r">
                <label htmlFor="checkin-event" className="text-sm font-bold text-slate-950">Event at this gate</label>
                <select id="checkin-event" value={selectedEventId} onChange={(event) => { setSelectedEventId(event.target.value); setRecentCheckins(recentForEvent(registrations, event.target.value)); setLastResult(null); }} className="mt-2 min-h-12 w-full rounded-md border border-black/20 bg-white px-3 text-base font-bold text-slate-950 sm:text-lg">
                  {events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
                </select>
                <p className="mt-2 text-sm leading-5 text-slate-600">Every ticket is checked against this event. Change it before serving another race.</p>
              </div>
              <dl className="grid grid-cols-3 divide-x divide-black/10">
                <GateMetric value={checkedInCount} label="Checked in" />
                <GateMetric value={remainingCount} label="Waiting" />
                <GateMetric value={confirmedCount} label="Confirmed" />
              </dl>
            </div>
            <div className="h-1 bg-black/10" role="progressbar" aria-label={`${checkedInCount} of ${confirmedCount} runners checked in`} aria-valuemin={0} aria-valuemax={confirmedCount} aria-valuenow={checkedInCount}>
              <div className="h-full bg-[#d9ff00] transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${progressPercent}%` }} />
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-12">
            <section className="overflow-hidden rounded-xl border border-black/15 bg-white xl:col-span-8" aria-labelledby="ticket-scanner-heading">
              <header className="border-b border-black/10 px-5 py-5 sm:px-6">
                <h2 id="ticket-scanner-heading" className="text-2xl font-bold tracking-[-0.025em] text-slate-950">Scan tickets</h2>
                <p className="mt-1 text-sm text-slate-600">Point the gate camera at the ticket QR code.</p>
              </header>
              <div className="p-3 sm:p-5"><QRCodeScanner onScan={handleProcessScan} paused={processing || !selectedEventId} /></div>
              <form onSubmit={(event) => { event.preventDefault(); void handleProcessScan(manualToken); }} className="border-t border-black/10 bg-[#f7f6f1] p-4 sm:p-5">
                <label htmlFor="ticket-lookup" className="text-sm font-bold text-slate-950">Ticket lookup</label>
                <p className="mt-1 text-xs leading-5 text-slate-600">Use a handheld scanner, registration number, email, or ticket code.</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input id="ticket-lookup" ref={manualInputRef} type="text" autoComplete="off" placeholder="Enter ticket details" value={manualToken} onChange={(event) => setManualToken(event.target.value)} className="min-h-12 min-w-0 flex-1 rounded-md border border-black/20 bg-white px-4 font-mono text-sm text-slate-950 placeholder:text-slate-500 focus:border-black" />
                  <button type="submit" disabled={processing || !manualToken.trim() || !selectedEventId} className="min-h-12 rounded-md bg-[#151515] px-6 text-sm font-bold text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:bg-black/35">{processing ? "Checking ticket" : "Check ticket"}</button>
                </div>
              </form>
            </section>

            <aside className="space-y-6 xl:col-span-4">
              <CheckinResultPanel result={lastResult} eventName={selectedEvent?.name} />
              <RecentFeed items={recentCheckins} />
            </aside>
          </div>
        </>
      )}
    </AdminLayout>
  );
}

function GateMetric({ value, label }: { value: number | string; label: string }) {
  return <div className="flex min-h-28 flex-col justify-center px-3 py-5 text-center"><dt className="order-2 mt-1 text-xs font-medium text-slate-600">{label}</dt><dd className="order-1 text-3xl font-black tracking-[-0.04em] text-slate-950 sm:text-4xl">{value}</dd></div>;
}

function CheckinResultPanel({ result, eventName }: { result: ScanResult | null; eventName?: string }) {
  if (!result) return <section className="flex min-h-56 flex-col justify-end rounded-xl border border-black/15 bg-white p-5"><p className="text-sm font-semibold text-slate-500">Verification result</p><h2 className="mt-3 text-2xl font-bold tracking-[-0.03em] text-slate-950">Ready for a ticket</h2><p className="mt-2 text-sm leading-6 text-slate-600">Checking against {eventName || "the selected event"}.</p></section>;
  const style = result.status === "success"
    ? { shell: "border-emerald-700 bg-emerald-50 text-emerald-950", icon: <CheckCircle className="h-7 w-7" />, title: "Entry confirmed" }
    : result.status === "already_checked_in"
      ? { shell: "border-amber-600 bg-amber-50 text-amber-950", icon: <AlertTriangle className="h-7 w-7" />, title: "Already checked in" }
      : { shell: "border-red-700 bg-red-50 text-red-950", icon: <AlertCircle className="h-7 w-7" />, title: "Ticket not accepted" };
  return (
    <section className={`min-h-56 rounded-xl border-2 p-5 ${style.shell}`} role="status">
      <div className="flex items-start justify-between gap-4">{style.icon}<span className="font-mono text-xs font-semibold opacity-70">{result.timestamp}</span></div>
      <h2 className="mt-5 text-2xl font-bold tracking-[-0.03em]">{style.title}</h2>
      <p className="mt-2 text-sm font-medium leading-6 opacity-80">{result.message}</p>
      {result.registration && <div className="mt-5 border-t border-current/20 pt-4"><p className="truncate text-lg font-bold">{result.registration.full_name}</p><dl className="mt-3 grid grid-cols-2 gap-4 text-sm"><div><dt className="text-xs font-medium opacity-65">Bib or reference</dt><dd className="mt-1 break-all font-mono font-bold">#{result.registration.registration_number || result.registration.id.slice(0, 8)}</dd></div><div><dt className="text-xs font-medium opacity-65">Kit size</dt><dd className="mt-1 font-bold">{result.registration.tshirt_size || "L"}</dd></div></dl></div>}
    </section>
  );
}

function RecentFeed({ items }: { items: RecentCheckin[] }) {
  return (
    <section className="overflow-hidden rounded-xl border border-black/15 bg-white">
      <header className="flex items-baseline justify-between border-b border-black/10 px-5 py-4"><h2 className="text-base font-bold text-slate-950">Recent check-ins</h2><span className="text-xs font-medium text-slate-500">{items.length} shown</span></header>
      {items.length === 0 ? <div className="min-h-40 px-5 py-10"><p className="text-sm font-semibold text-slate-700">No one has checked in yet</p><p className="mt-1 text-sm leading-6 text-slate-500">Verified runners will appear here.</p></div> : <div className="max-h-[410px] divide-y divide-black/10 overflow-y-auto">{items.map((item, index) => <div key={`${item.number}-${index}`} className="grid grid-cols-[58px_minmax(0,1fr)] gap-3 px-5 py-3.5"><span className="flex items-center gap-1 font-mono text-xs text-slate-500"><Clock className="h-3 w-3" />{item.time}</span><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-950">{item.name}</p><p className="mt-0.5 truncate font-mono text-xs text-slate-500">#{item.number} · Kit {item.tshirt}</p></div></div>)}</div>}
    </section>
  );
}
