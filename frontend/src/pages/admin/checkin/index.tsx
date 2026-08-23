import React, { useState, useEffect, useRef } from "react";
import {
  QrCode,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Search,
  Users,
  Shirt,
  Flame,
  Volume2,
  VolumeX,
  RefreshCw,
  Clock,
  Sparkles,
} from "lucide-react";
import { AdminLayout } from "../../../components/admin/AdminLayout";
import { QRCodeScanner } from "../../../components/admin/QRCodeScanner";
import { api } from "../../../lib/api";
import type { Event, Registration } from "../../../types";

// Sound synthesis helper via Web Audio API (no external mp3 files needed)
function playSound(type: "success" | "warning" | "error") {
  if (typeof window === "undefined") return;
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    if (type === "success") {
      // High pleasant two-tone chime
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc1.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

      osc1.connect(gain);
      gain.connect(ctx.destination);
      osc1.start();
      osc1.stop(ctx.currentTime + 0.35);
    } else if (type === "warning") {
      // Low buzzing double tone
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      osc.frequency.setValueAtTime(196, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } else {
      // Error descending buzz
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.setValueAtTime(150, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    }
  } catch (e) {
    // Audio context may be restricted before user gesture
  }
}

interface ScanResult {
  status: "success" | "already_checked_in" | "error";
  message: string;
  registration?: Registration;
  timestamp: string;
}

export default function AdminCheckinPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [manualToken, setManualToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [recentCheckins, setRecentCheckins] = useState<
    { name: string; number: string; tshirt: string; time: string }[]
  >([]);

  const manualInputRef = useRef<HTMLInputElement>(null);

  // Load events and registrations
  useEffect(() => {
    async function loadEvents() {
      try {
        setLoading(true);
        const [eventsRes, regsRes] = await Promise.all([
          api.listEvents({ limit: 50 }),
          api.adminListRegistrations({ limit: 300 }),
        ]);

        const evList = eventsRes.events || [];
        setEvents(evList);
        setRegistrations(regsRes.registrations || []);

        if (evList.length > 0) {
          // Select the first live or published event
          const active = evList.find((e) =>
            ["REGISTRATION_OPEN", "REGISTRATION_CLOSED", "PUBLISHED"].includes(e.status)
          );
          setSelectedEventId(active ? active.id : evList[0].id);
        }
      } catch (err) {
        console.error("Check-in station load error:", err);
      } finally {
        setLoading(false);
      }
    }
    loadEvents();
  }, []);

  const handleProcessScan = async (tokenOrId: string) => {
    const raw = tokenOrId.trim();
    if (!raw || processing) return;

    setProcessing(true);
    setManualToken("");

    try {
      // Find matching registration in local cache or by token/id
      const reg = registrations.find(
        (r) =>
          r.id === raw ||
          r.registration_number?.toLowerCase() === raw.toLowerCase() ||
          r.email?.toLowerCase() === raw.toLowerCase()
      );

      const eventIdToUse = reg?.event_id || selectedEventId;
      const regIdToUse = reg?.id || raw;

      const res = await api.checkIn({
        eventId: eventIdToUse,
        registrationId: regIdToUse,
        qrToken: raw,
      });

      if (soundEnabled) playSound("success");

      const scannedReg = reg || {
        id: regIdToUse,
        registration_number: raw.slice(0, 8),
        full_name: "Verified Participant",
        email: "",
        phone: "",
        tshirt_size: "Standard",
        gender: "",
        emergency_contact_name: "",
        emergency_contact_phone: "",
        status: "CONFIRMED" as any,
        event_id: eventIdToUse,
        event_category_id: "",
        user_id: "",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      setLastResult({
        status: "success",
        message: "Check-in successful! Participant verified.",
        registration: scannedReg,
        timestamp: new Date().toLocaleTimeString(),
      });

      setRecentCheckins((prev) => [
        {
          name: scannedReg.full_name || "Runner",
          number: scannedReg.registration_number || scannedReg.id.slice(0, 8),
          tshirt: scannedReg.tshirt_size || "M",
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
        ...prev.slice(0, 14),
      ]);
    } catch (err: any) {
      console.warn("Check-in issue:", err);
      const isAlready =
        err?.message?.includes("already") || err?.code === "already_checked_in";

      if (isAlready) {
        if (soundEnabled) playSound("warning");
        setLastResult({
          status: "already_checked_in",
          message: "Participant has ALREADY been checked in previously.",
          timestamp: new Date().toLocaleTimeString(),
        });
      } else {
        if (soundEnabled) playSound("error");
        setLastResult({
          status: "error",
          message: err?.message || "Invalid ticket token or registration not found.",
          timestamp: new Date().toLocaleTimeString(),
        });
      }
    } finally {
      setProcessing(false);
      // Re-focus manual input for continuous USB scanner typing
      if (manualInputRef.current) {
        manualInputRef.current.focus();
      }
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualToken) {
      handleProcessScan(manualToken);
    }
  };

  // Compute checked-in counts for current event
  const currentEvent = events.find((e) => e.id === selectedEventId);
  const currentEventRegs = registrations.filter((r) => r.event_id === selectedEventId);
  const checkedInCount = recentCheckins.length; // Live count
  const totalCount = currentEventRegs.length || 1;
  const progressPercent = Math.min(100, Math.round((checkedInCount / totalCount) * 100));

  return (
    <AdminLayout
      title="Race-Day Check-in Station"
      subtitle="Fast participant check-in, QR ticket scanner, and kit pickup verification"
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              soundEnabled
                ? "bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200"
                : "bg-rose-50 border-rose-200 text-rose-700"
            }`}
            title={soundEnabled ? "Audio chime enabled" : "Audio muted"}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            <span className="hidden sm:inline">{soundEnabled ? "Sound ON" : "Sound Muted"}</span>
          </button>
        </div>
      }
    >
      {/* Top Controls & Event Selector Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Active Event for Check-in
          </label>
          <select
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            className="w-full md:w-80 px-3.5 py-2 text-sm font-bold bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 text-slate-900"
          >
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name} ({ev.status})
              </option>
            ))}
          </select>
        </div>

        {/* Live Check-in Progress Bar */}
        <div className="flex-1 max-w-sm">
          <div className="flex justify-between text-xs font-medium mb-1">
            <span className="text-slate-600 font-semibold">Today's Check-in Progress</span>
            <span className="text-orange-600 font-bold">
              {checkedInCount} checked in
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-gradient-to-r from-orange-500 to-amber-500 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${Math.max(5, progressPercent)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Main Grid: Scanner + Result Banner on Left, Live Feed on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Scanner & Input (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Result Alert Card */}
          {lastResult && (
            <div
              className={`rounded-2xl p-5 border shadow-sm transition-all animate-fadeIn ${
                lastResult.status === "success"
                  ? "bg-emerald-50 border-emerald-300 text-emerald-950"
                  : lastResult.status === "already_checked_in"
                  ? "bg-amber-50 border-amber-300 text-amber-950"
                  : "bg-rose-50 border-rose-300 text-rose-950"
              }`}
            >
              <div className="flex items-start gap-3.5">
                {lastResult.status === "success" && (
                  <CheckCircle className="w-7 h-7 text-emerald-600 flex-shrink-0 mt-0.5" />
                )}
                {lastResult.status === "already_checked_in" && (
                  <AlertTriangle className="w-7 h-7 text-amber-600 flex-shrink-0 mt-0.5" />
                )}
                {lastResult.status === "error" && (
                  <AlertCircle className="w-7 h-7 text-rose-600 flex-shrink-0 mt-0.5" />
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-base">
                      {lastResult.status === "success"
                        ? "CHECK-IN CONFIRMED"
                        : lastResult.status === "already_checked_in"
                        ? "ALREADY CHECKED IN"
                        : "CHECK-IN FAILED"}
                    </h4>
                    <span className="text-xs opacity-75 font-mono">{lastResult.timestamp}</span>
                  </div>
                  <p className="text-xs mt-1 font-medium">{lastResult.message}</p>

                  {lastResult.registration && (
                    <div className="mt-4 pt-3 border-t border-black/10 grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-slate-500 block text-[11px]">Runner Name</span>
                        <span className="font-bold text-sm text-slate-900 truncate block">
                          {lastResult.registration.full_name}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[11px]">Race Ref / Bib</span>
                        <span className="font-mono font-bold text-sm text-slate-900 block">
                          #{lastResult.registration.registration_number || lastResult.registration.id.slice(0, 8)}
                        </span>
                      </div>
                      <div className="col-span-2 p-2.5 rounded-xl bg-white/70 border border-black/5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Shirt className="w-4 h-4 text-orange-600" />
                          <span className="font-bold text-xs text-slate-900">
                            Kit / T-shirt Size:
                          </span>
                        </div>
                        <span className="text-sm font-black px-3 py-1 bg-orange-600 text-white rounded-lg shadow-sm">
                          {lastResult.registration.tshirt_size || "L"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Camera Scanner Box */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <QrCode className="w-4 h-4 text-orange-600" />
                <span>Live Camera Scanner</span>
              </h3>
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Active
              </span>
            </div>

            <QRCodeScanner onScan={handleProcessScan} />

            {/* Manual Lookup / Handheld Scanner Input */}
            <form onSubmit={handleManualSubmit} className="mt-4 flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  ref={manualInputRef}
                  type="text"
                  placeholder="Scan QR or type Reg # / Email..."
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono"
                />
              </div>
              <button
                type="submit"
                disabled={processing || !manualToken}
                className="px-4 py-2.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors"
              >
                {processing ? "Verifying..." : "Verify"}
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Live Check-in Feed (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col h-full min-h-[420px]">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-sm text-slate-900">Recent Check-in Feed</h3>
              <p className="text-xs text-slate-500">Live verified participants</p>
            </div>
            <span className="text-xs font-bold px-2 py-1 bg-orange-50 text-orange-700 rounded-lg">
              {recentCheckins.length} Total
            </span>
          </div>

          {recentCheckins.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-400 text-xs">
              <Users className="w-10 h-10 opacity-30 mb-2" />
              <p className="font-medium">No check-ins recorded yet today.</p>
              <p className="text-slate-400 mt-1">Scanned participants will stream live into this feed.</p>
            </div>
          ) : (
            <div className="flex-1 space-y-2.5 overflow-y-auto max-h-[500px] pr-1">
              {recentCheckins.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl border border-slate-100 bg-slate-50/70 hover:bg-slate-50 flex items-center justify-between text-xs"
                >
                  <div className="min-w-0 flex-1 mr-2">
                    <h5 className="font-bold text-slate-900 truncate">{item.name}</h5>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                      Bib #{item.number}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="px-2 py-0.5 bg-orange-100 text-orange-800 font-bold rounded text-[11px]">
                      Size {item.tshirt}
                    </span>
                    <span className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                      <Clock className="w-3 h-3" />
                      {item.time}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
