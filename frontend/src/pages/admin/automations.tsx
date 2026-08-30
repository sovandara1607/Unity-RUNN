import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle, BellRing, Check, CheckCircle2, Clock3, Radio,
  RefreshCw, RotateCcw, Send, TicketCheck, UserRoundCheck, Workflow, XCircle,
} from "lucide-react";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { AlertBanner, useAlerts } from "../../components/alerts/AlertSystem";
import { Skeleton } from "../../components/Skeleton";
import { api } from "../../lib/api";
import type { AdminAutomationDelivery, AdminAutomationSnapshot, TelegramDelivery } from "../../types";

const typeLabels: Record<TelegramDelivery["type"], string> = {
  REGISTRATION_CONFIRMATION: "Ticket issued",
  PAYMENT_CONFIRMATION: "Payment confirmed",
  EVENT_REMINDER: "Race reminder",
  EVENT_UPDATE: "Event updated",
  EVENT_ANNOUNCEMENT: "Event announcement",
  CANCELLATION: "Entry cancelled",
};

const typeIcons: Record<TelegramDelivery["type"], typeof Send> = {
  REGISTRATION_CONFIRMATION: TicketCheck,
  PAYMENT_CONFIRMATION: CheckCircle2,
  EVENT_REMINDER: BellRing,
  EVENT_UPDATE: Radio,
  EVENT_ANNOUNCEMENT: Radio,
  CANCELLATION: XCircle,
};

export default function AdminAutomationsPage() {
  const alerts = useAlerts();
  const [snapshot, setSnapshot] = useState<AdminAutomationSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true); else setLoading(true);
    try {
      setError(null);
      setSnapshot(await api.adminGetAutomations());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Automation activity could not be loaded.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 20_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const retry = async (delivery: AdminAutomationDelivery) => {
    if (retryingId) return;
    setRetryingId(delivery.id);
    setError(null);
    try {
      await api.adminRetryAutomationDelivery(delivery.id);
      setSnapshot((current) => current ? {
        ...current,
        counts: { ...current.counts, failed: Math.max(0, current.counts.failed - 1), pending: current.counts.pending + 1 },
        recent: current.recent.map((item) => item.id === delivery.id
          ? { ...item, status: "PENDING", attempts: 0, failure_reason: undefined, updated_at: new Date().toISOString() }
          : item),
      } : current);
      alerts.notify({ tone: "success", title: "Retry queued", message: `${delivery.runner_name}'s Telegram message is back in the delivery lane.` });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The failed delivery could not be retried.");
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <AdminLayout
      title="Automations"
      subtitle="Telegram reach, message flow and failed-delivery recovery"
      minRole="ADMIN"
      actions={<button type="button" onClick={() => void load(true)} disabled={refreshing || loading} className="inline-flex items-center gap-2 rounded-full border border-black/15 bg-white px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.1em] transition hover:border-black disabled:opacity-40"><RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />Refresh</button>}
    >
      {error && <AlertBanner tone="error" title="Signal desk interrupted" className="mb-5" onDismiss={() => setError(null)}>{error}</AlertBanner>}
      {loading && !snapshot ? <AutomationSkeleton /> : snapshot ? <AutomationBoard snapshot={snapshot} retryingId={retryingId} onRetry={retry} /> : <EmptyState onRetry={() => void load()} />}
    </AdminLayout>
  );
}

function AutomationBoard({ snapshot, retryingId, onRetry }: { snapshot: AdminAutomationSnapshot; retryingId: string | null; onRetry: (delivery: AdminAutomationDelivery) => void }) {
  const successPercent = Math.round(snapshot.success_rate * 1000) / 10;
  const completed = snapshot.counts.sent + snapshot.counts.failed;
  return <div className="space-y-6">
    <section className="relative overflow-hidden rounded-[28px] border border-black/10 bg-[#151515] text-white shadow-[0_28px_70px_-48px_rgba(0,0,0,.95)]">
      <div aria-hidden className="absolute inset-x-0 top-0 h-1 bg-[#3155ff]"><span className={`block h-full bg-[#d9ff00] transition-[width] duration-700 motion-reduce:transition-none ${snapshot.configured ? "w-full" : "w-0"}`} /></div>
      <div className="grid gap-8 p-6 sm:p-9 xl:grid-cols-[1fr_390px] xl:p-11">
        <div>
          <p className={`flex items-center gap-2 font-mono text-[9px] font-black uppercase tracking-[0.2em] ${snapshot.configured ? "text-[#d9ff00]" : "text-amber-300"}`}><span className={`h-2 w-2 rounded-full ${snapshot.configured ? "animate-pulse bg-[#d9ff00] motion-reduce:animate-none" : "bg-amber-300"}`} />{snapshot.configured ? "Telegram channel online" : "Telegram setup required"}</p>
          <h2 className="sport-display mt-6 max-w-4xl text-[clamp(46px,14vw,112px)] uppercase leading-[0.76] tracking-[-0.045em]">Signals in motion.</h2>
          <p className="mt-7 max-w-2xl text-sm font-semibold leading-6 text-white/50">See what left race control, what reached a runner, and which message needs another push.</p>
        </div>
        <div className="self-end overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
          <div className="flex items-end justify-between border-b border-white/10 p-5">
            <div><p className="font-mono text-[8px] font-black uppercase tracking-[0.18em] text-white/35">Completed delivery rate</p><p className="sport-display mt-2 text-6xl leading-none text-[#d9ff00]">{completed ? `${successPercent}%` : "—"}</p></div>
            <Workflow className="h-7 w-7 text-white/20" />
          </div>
          <div className="grid grid-cols-3 divide-x divide-white/10">
            <HeroDatum label="Sent" value={snapshot.counts.sent} tone="text-emerald-300" />
            <HeroDatum label="Moving" value={snapshot.counts.pending} tone="text-[#d9ff00]" />
            <HeroDatum label="Failed" value={snapshot.counts.failed} tone="text-rose-300" />
          </div>
        </div>
      </div>
      <div className="grid border-t border-white/10 sm:grid-cols-2 xl:grid-cols-4">
        <LaneDatum icon={<UserRoundCheck />} label="Connected runners" value={snapshot.connected_runners} note="Can receive Telegram" />
        <LaneDatum icon={<TicketCheck />} label="Ticket reach" value={snapshot.preferences.tickets} note="Tickets and payments enabled" />
        <LaneDatum icon={<BellRing />} label="Reminder reach" value={snapshot.preferences.reminders} note="Race reminders enabled" />
        <LaneDatum icon={<Radio />} label="Update reach" value={snapshot.preferences.event_updates} note="Changes and cancellations enabled" />
      </div>
    </section>

    {!snapshot.configured && <AlertBanner tone="warning" title="Telegram is not configured">Set the bot token, username, and webhook secret on the API before runners can connect. Existing email delivery continues normally.</AlertBanner>}

    <div className="grid gap-6 2xl:grid-cols-[.72fr_1.28fr]">
      <section className="overflow-hidden rounded-[24px] border border-black/10 bg-white">
        <PanelHeader eyebrow={`${snapshot.window_days}-day window`} title="Trigger volume" note={`${snapshot.counts.total} Telegram jobs created`} />
        <div className="divide-y divide-black/10">
          {(Object.keys(typeLabels) as TelegramDelivery["type"][]).map((type) => {
            const Icon = typeIcons[type];
            const count = snapshot.by_type[type] || 0;
            const width = snapshot.counts.total ? Math.max(3, Math.round(count / snapshot.counts.total * 100)) : 0;
            return <div key={type} className="px-5 py-4 sm:px-6">
              <div className="flex items-center justify-between gap-4"><p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.08em]"><Icon className="h-3.5 w-3.5 text-[#3155ff]" />{typeLabels[type]}</p><span className="font-mono text-xs font-black">{count}</span></div>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-black/[0.06]"><div className="h-full bg-[#3155ff]" style={{ width: `${width}%` }} /></div>
            </div>;
          })}
        </div>
        <div className="grid grid-cols-2 border-t border-black/10 bg-[#f4f3ee]">
          <SmallDatum label="Skipped" value={snapshot.counts.skipped} note="No connection or paused" />
          <SmallDatum label="Completed" value={completed} note="Sent or exhausted" />
        </div>
      </section>

      <section className="overflow-hidden rounded-[24px] border border-black/10 bg-white">
        <PanelHeader eyebrow="Latest 40" title="Delivery lane" note="Provider errors are reduced to credential-safe operator messages" />
        {snapshot.recent.length === 0 ? <div className="grid min-h-72 place-items-center p-8 text-center"><div><Send className="mx-auto h-9 w-9 text-black/15" /><p className="mt-4 text-sm font-black">No Telegram jobs yet.</p><p className="mt-1 text-xs font-medium text-black/40">New runner notifications will enter this lane automatically.</p></div></div> : <div className="divide-y divide-black/10">{snapshot.recent.map((delivery) => <DeliveryRow key={delivery.id} delivery={delivery} retrying={retryingId === delivery.id} onRetry={() => onRetry(delivery)} />)}</div>}
      </section>
    </div>
  </div>;
}

function DeliveryRow({ delivery, retrying, onRetry }: { delivery: AdminAutomationDelivery; retrying: boolean; onRetry: () => void }) {
  const Icon = typeIcons[delivery.type];
  const timestamp = delivery.sent_at || delivery.updated_at || delivery.created_at;
  return <article className="grid gap-4 px-5 py-4 sm:grid-cols-[42px_minmax(0,1fr)_auto] sm:items-center sm:px-6">
    <span className={`grid h-10 w-10 place-items-center rounded-xl ${delivery.status === "FAILED" ? "bg-rose-50 text-rose-600" : delivery.status === "SENT" ? "bg-emerald-50 text-emerald-600" : "bg-[#eef0ff] text-[#3155ff]"}`}><Icon className="h-4 w-4" /></span>
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><p className="text-xs font-black">{typeLabels[delivery.type]}</p><DeliveryStatus status={delivery.status} /></div>
      <p className="mt-1 truncate text-[10px] font-semibold text-black/45">{delivery.runner_name} · {delivery.recipient_email}</p>
      <p className="mt-1 font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-black/30">{formatTimestamp(timestamp)}{delivery.attempts ? ` · ${delivery.attempts} attempt${delivery.attempts === 1 ? "" : "s"}` : ""}</p>
      {delivery.failure_reason && <p className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-rose-600"><AlertTriangle className="h-3 w-3 shrink-0" />{delivery.failure_reason}</p>}
    </div>
    {delivery.status === "FAILED" ? <button type="button" onClick={onRetry} disabled={retrying} aria-label={`Retry delivery to ${delivery.runner_name}`} className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-black/15 px-3.5 text-[8px] font-black uppercase tracking-[0.1em] transition hover:border-black disabled:opacity-40"><RotateCcw className={`h-3 w-3 ${retrying ? "animate-spin" : ""}`} />Retry</button> : <span className="hidden font-mono text-[8px] font-black uppercase tracking-[0.1em] text-black/20 sm:inline">{delivery.status === "SENT" ? "Clear" : delivery.status === "SKIPPED" ? "No send" : "In queue"}</span>}
  </article>;
}

function DeliveryStatus({ status }: { status: AdminAutomationDelivery["status"] }) {
  const styles = status === "SENT" ? "bg-emerald-50 text-emerald-700" : status === "FAILED" ? "bg-rose-50 text-rose-700" : status === "SKIPPED" ? "bg-black/[0.05] text-black/45" : "bg-amber-50 text-amber-700";
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 font-mono text-[7px] font-black uppercase tracking-[0.1em] ${styles}`}>{status === "SENT" ? <Check className="h-2.5 w-2.5" /> : status === "FAILED" ? <XCircle className="h-2.5 w-2.5" /> : <Clock3 className="h-2.5 w-2.5" />}{status === "PROCESSING" ? "Sending" : status}</span>;
}

function HeroDatum({ label, value, tone }: { label: string; value: number; tone: string }) { return <div className="p-4 text-center"><p className={`font-mono text-xl font-black ${tone}`}>{value}</p><p className="mt-1 text-[7px] font-black uppercase tracking-[0.15em] text-white/30">{label}</p></div>; }
function LaneDatum({ icon, label, value, note }: { icon: ReactNode; label: string; value: number; note: string }) { return <div className="border-t border-white/10 p-5 first:border-t-0 sm:border-l sm:first:border-l-0 sm:[&:nth-child(2)]:border-t-0 xl:border-t-0"><div className="flex items-center justify-between text-[#d9ff00]"><span className="[&_svg]:h-4 [&_svg]:w-4">{icon}</span><span className="sport-display text-4xl leading-none">{value}</span></div><p className="mt-4 text-[9px] font-black uppercase tracking-[0.1em]">{label}</p><p className="mt-1 text-[9px] font-semibold text-white/30">{note}</p></div>; }
function PanelHeader({ eyebrow, title, note }: { eyebrow: string; title: string; note: string }) { return <header className="flex flex-col gap-2 border-b border-black/10 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6"><div><p className="font-mono text-[8px] font-black uppercase tracking-[0.18em] text-[#3155ff]">{eyebrow}</p><h3 className="mt-1 text-base font-black">{title}</h3></div><p className="max-w-xs text-[10px] font-semibold leading-4 text-black/35">{note}</p></header>; }
function SmallDatum({ label, value, note }: { label: string; value: number; note: string }) { return <div className="border-l border-black/10 p-5 first:border-l-0"><p className="font-mono text-[8px] font-black uppercase tracking-[0.15em] text-black/35">{label}</p><p className="sport-display mt-2 text-4xl leading-none">{value}</p><p className="mt-1 text-[9px] font-semibold text-black/35">{note}</p></div>; }
function formatTimestamp(value: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }

function AutomationSkeleton() { return <div className="space-y-6"><Skeleton tone="light" className="h-[430px] rounded-[28px]" /><div className="grid gap-6 xl:grid-cols-2"><Skeleton tone="light" className="h-[430px] rounded-[24px]" /><Skeleton tone="light" className="h-[430px] rounded-[24px]" /></div></div>; }
function EmptyState({ onRetry }: { onRetry: () => void }) { return <div className="grid min-h-[520px] place-items-center rounded-[28px] border border-black/10 bg-white p-8 text-center"><div><Workflow className="mx-auto h-10 w-10 text-black/20" /><h2 className="mt-5 text-xl font-black">Automation activity is unavailable.</h2><button type="button" onClick={onRetry} className="mt-5 rounded-full bg-[#151515] px-5 py-3 text-[9px] font-black uppercase tracking-[0.1em] text-white">Try again</button></div></div>; }
