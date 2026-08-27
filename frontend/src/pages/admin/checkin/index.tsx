import React, { useEffect, useRef, useState } from "react";
import {
  Activity, AlertCircle, AlertTriangle, CheckCircle, Clock, Keyboard,
  QrCode, Radio, ScanLine, Search, Shirt, TicketCheck, Users,
  Volume2, VolumeX,
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
  const [processing, setProcessing] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [recentCheckins, setRecentCheckins] = useState<RecentCheckin[]>([]);
  const manualInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function loadStation() {
      try {
        setLoading(true);
        const [eventsResponse, registrationsResponse] = await withMinSkeleton(() => Promise.all([
          api.listEvents({ limit: 50 }),
          api.adminListRegistrations({ limit: 300 }),
        ]));
        const eventList = (eventsResponse.events || []).filter((event) => ["PUBLISHED", "REGISTRATION_OPEN", "REGISTRATION_CLOSED"].includes(event.status));
        const registrationList = registrationsResponse.registrations || [];
        setEvents(eventList); setRegistrations(registrationList);
        if (eventList.length > 0) {
          const initialEventId = eventList[0].id;
          setSelectedEventId(initialEventId);
          setRecentCheckins(recentForEvent(registrationList, initialEventId));
        }
      } finally {
        setLoading(false);
      }
    }
    void loadStation();
  }, []);

  const handleProcessScan = async (tokenOrId: string) => {
    const raw = tokenOrId.trim();
    if (!raw || processing) return;
    if (!selectedEventId) {
      setLastResult({ status: "error", message: "Select an event before scanning.", timestamp: new Date().toLocaleTimeString() });
      return;
    }

    setProcessing(true); setManualToken("");
    try {
      const match = registrations.find((registration) => registration.event_id === selectedEventId && (
        registration.id === raw ||
        registration.registration_number?.toLowerCase() === raw.toLowerCase() ||
        registration.email?.toLowerCase() === raw.toLowerCase()
      ));
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
          registration: registrations.find((registration) => registration.event_id === selectedEventId && [registration.registration_number, registration.email, registration.id].some((value) => value?.toLowerCase() === raw.toLowerCase())),
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
      title="Check-in Station"
      subtitle="Race-day entry verification and kit handoff"
      actions={<button onClick={() => setSoundEnabled((enabled) => !enabled)} className={`grid h-10 w-10 place-items-center rounded-full border text-[10px] font-black uppercase tracking-[0.1em] transition sm:flex sm:w-auto sm:gap-2 sm:px-3.5 ${soundEnabled ? "border-slate-200 bg-white text-slate-800 hover:bg-slate-50" : "border-rose-200 bg-rose-50 text-rose-700"}`} aria-label={soundEnabled ? "Mute check-in sounds" : "Enable check-in sounds"} title={soundEnabled ? "Sound on" : "Sound muted"}>{soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}<span className="hidden sm:inline">{soundEnabled ? "Sound on" : "Muted"}</span></button>}
    >
      <section className="mb-5 overflow-hidden rounded-[26px] bg-[#151515] text-white shadow-[0_25px_70px_-45px_rgba(0,0,0,.8)]">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="border-b border-white/10 p-5 sm:p-6 lg:border-b-0 lg:border-r lg:border-white/10">
            <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.18em] text-[#d9ff00]"><Radio className="h-3.5 w-3.5" /> Live gate assignment</div>
            <label htmlFor="checkin-event" className="sr-only">Active event for check-in</label>
            <select id="checkin-event" value={selectedEventId} onChange={(event) => { setSelectedEventId(event.target.value); setRecentCheckins(recentForEvent(registrations, event.target.value)); setLastResult(null); }} disabled={loading} className="mt-3 w-full appearance-none bg-transparent pr-8 text-xl font-black tracking-[-0.02em] text-white outline-none sm:text-2xl">
              {loading ? <option value="">Loading events…</option> : events.map((event) => <option key={event.id} value={event.id} className="text-slate-900">{event.name}</option>)}
            </select>
            <p className="mt-2 text-xs text-white/40"><span className="mr-2 font-black uppercase tracking-[0.08em] text-[#d9ff00]">{selectedEvent?.status.replaceAll("_", " ")}</span>Every scan is checked against this event. Switch assignments before scanning another race.</p>
          </div>
          <div className="grid grid-cols-3 divide-x divide-white/10 lg:min-w-[420px]"><GateMetric value={checkedInCount} label="Entered" accent /><GateMetric value={remainingCount} label="Waiting" /><GateMetric value={`${progressPercent}%`} label="Flow" /></div>
        </div>
        <div className="h-1.5 bg-white/10"><div className="h-full bg-[#d9ff00] transition-all duration-500" style={{ width: `${progressPercent}%` }} /></div>
      </section>

      {!loading && events.length === 0 ? (
        <div className="rounded-[26px] border border-slate-200 bg-white p-12 text-center"><TicketCheck className="mx-auto h-10 w-10 text-slate-300" /><h2 className="mt-4 text-lg font-black text-slate-900">No event is ready for check-in</h2><p className="mt-1 text-sm text-slate-500">Publish an event before opening this station.</p></div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-12">
          <section className="overflow-hidden rounded-[26px] bg-[#151515] text-white shadow-sm xl:col-span-8" aria-label="Ticket scanner">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-6"><div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#d9ff00]">Scan lane 01</p><h2 className="mt-1 flex items-center gap-2 text-sm font-black uppercase tracking-[0.06em]"><ScanLine className="h-4 w-4" /> Scan ticket QR</h2></div><span className="flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-emerald-300"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /><span className="hidden sm:inline">Gate</span> Ready</span></div>
            <div className="p-3 sm:p-5"><QRCodeScanner onScan={handleProcessScan} paused={processing || !selectedEventId} /></div>
            <div className="border-t border-white/10 p-4 sm:p-5">
              <div className="mb-2 flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.14em] text-white/40"><Keyboard className="h-3.5 w-3.5" /> Handheld scanner or desk lookup</div>
              <form onSubmit={(event) => { event.preventDefault(); void handleProcessScan(manualToken); }} className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1"><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" /><input ref={manualInputRef} type="text" placeholder="Registration number, email, or ticket code" value={manualToken} onChange={(event) => setManualToken(event.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 py-3.5 pl-11 pr-4 font-mono text-xs text-white outline-none placeholder:text-white/25 focus:border-[#d9ff00] focus:ring-2 focus:ring-[#d9ff00]/20" /></div>
                <button type="submit" disabled={processing || !manualToken || !selectedEventId} className="inline-flex min-w-28 items-center justify-center gap-2 rounded-xl bg-[#d9ff00] px-5 py-3.5 text-xs font-black uppercase tracking-[0.08em] text-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40">{processing ? <><Activity className="h-4 w-4 animate-pulse" /> Checking</> : <>Verify <QrCode className="h-4 w-4" /></>}</button>
              </form>
            </div>
          </section>

          <aside className="space-y-5 xl:col-span-4">
            <CheckinResultPanel result={lastResult} eventName={selectedEvent?.name} />
            <RecentFeed items={recentCheckins} />
          </aside>
        </div>
      )}
    </AdminLayout>
  );
}

function GateMetric({ value, label, accent = false }: { value: number | string; label: string; accent?: boolean }) {
  return <div className="flex min-h-28 flex-col justify-center px-4 py-5 text-center"><strong className={`text-3xl font-black tracking-[-0.04em] sm:text-4xl ${accent ? "text-[#d9ff00]" : "text-white"}`}>{value}</strong><span className="mt-1 text-[8px] font-black uppercase tracking-[0.16em] text-white/35">{label}</span></div>;
}

function CheckinResultPanel({ result, eventName }: { result: ScanResult | null; eventName?: string }) {
  if (!result) return <section className="flex min-h-64 flex-col justify-between rounded-[26px] border border-slate-200 bg-[#eef0ff] p-5 shadow-sm"><div className="flex items-center justify-between"><span className="text-[9px] font-black uppercase tracking-[0.16em] text-[#3155ff]">Verification result</span><span className="h-2 w-2 animate-pulse rounded-full bg-[#3155ff]" /></div><div><TicketCheck className="h-10 w-10 text-[#3155ff]" /><h2 className="mt-4 text-2xl font-black tracking-[-0.03em] text-slate-950">Ready for the next ticket.</h2><p className="mt-2 text-xs leading-5 text-slate-500">Scanning against {eventName || "the selected event"}.</p></div></section>;
  const style = result.status === "success" ? { shell: "border-emerald-200 bg-emerald-500", text: "text-emerald-950", icon: <CheckCircle className="h-8 w-8" />, title: "Entry confirmed" } : result.status === "already_checked_in" ? { shell: "border-amber-200 bg-amber-300", text: "text-amber-950", icon: <AlertTriangle className="h-8 w-8" />, title: "Already inside" } : { shell: "border-rose-200 bg-rose-500", text: "text-white", icon: <AlertCircle className="h-8 w-8" />, title: "Ticket stopped" };
  return <section className={`min-h-64 rounded-[26px] border p-5 shadow-sm animate-fadeIn ${style.shell} ${style.text}`} role="status"><div className="flex items-start justify-between gap-4">{style.icon}<span className="font-mono text-[9px] font-bold opacity-60">{result.timestamp}</span></div><h2 className="mt-7 text-3xl font-black tracking-[-0.04em]">{style.title}</h2><p className="mt-2 text-xs font-semibold leading-5 opacity-75">{result.message}</p>{result.registration && <div className="mt-5 border-t border-black/10 pt-4"><p className="truncate text-lg font-black">{result.registration.full_name}</p><div className="mt-3 grid grid-cols-2 gap-3"><div><span className="block text-[8px] font-black uppercase tracking-[0.14em] opacity-55">Bib / reference</span><span className="mt-1 block font-mono text-xs font-black">#{result.registration.registration_number || result.registration.id.slice(0, 8)}</span></div><div><span className="block text-[8px] font-black uppercase tracking-[0.14em] opacity-55">Hand over kit</span><span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-black px-2.5 py-1 text-[10px] font-black text-white"><Shirt className="h-3 w-3" /> SIZE {result.registration.tshirt_size || "L"}</span></div></div></div>}</section>;
}

function RecentFeed({ items }: { items: RecentCheckin[] }) {
  return <section className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#3155ff]">Arrival stream</p><h2 className="mt-1 text-sm font-black text-slate-900">Recent runners</h2></div><span className="rounded-full bg-slate-100 px-2.5 py-1 font-mono text-[10px] font-bold text-slate-500">{items.length}</span></div>{items.length === 0 ? <div className="flex min-h-48 flex-col items-center justify-center px-8 text-center"><Users className="h-8 w-8 text-slate-200" /><p className="mt-3 text-xs font-bold text-slate-500">Waiting for the first runner</p><p className="mt-1 text-[11px] leading-5 text-slate-400">Verified arrivals appear here immediately.</p></div> : <div className="max-h-[410px] divide-y divide-slate-100 overflow-y-auto">{items.map((item, index) => <div key={`${item.number}-${index}`} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3.5"><span className="grid h-8 w-8 place-items-center rounded-full bg-[#eef0ff] text-[10px] font-black text-[#3155ff]">{String(index + 1).padStart(2, "0")}</span><div className="min-w-0"><p className="truncate text-xs font-black text-slate-900">{item.name}</p><p className="mt-0.5 font-mono text-[9px] text-slate-400">#{item.number} · SIZE {item.tshirt}</p></div><span className="flex items-center gap-1 font-mono text-[9px] text-slate-400"><Clock className="h-3 w-3" />{item.time}</span></div>)}</div>}</section>;
}
