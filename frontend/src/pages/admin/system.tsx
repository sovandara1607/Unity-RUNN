import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Activity, Boxes, Cloud, Database, HardDrive, KeyRound, Mail, Radio,
  RefreshCw, ServerCog, ShieldCheck, TriangleAlert, WalletCards, Workflow,
} from "lucide-react";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { AlertBanner } from "../../components/alerts/AlertSystem";
import { Skeleton } from "../../components/Skeleton";
import { api } from "../../lib/api";
import type { SystemIntegrationStatus, SystemServiceItem, SystemState, SystemStatusSnapshot } from "../../types";

const stateStyle: Record<SystemState, string> = {
  operational: "border-emerald-300 bg-emerald-50 text-emerald-700",
  configured: "border-blue-200 bg-blue-50 text-blue-700",
  attention: "border-amber-300 bg-amber-50 text-amber-800",
  unavailable: "border-rose-300 bg-rose-50 text-rose-700",
  disabled: "border-black/10 bg-black/[0.04] text-black/45",
};

export default function AdminSystemPage() {
  const [snapshot, setSnapshot] = useState<SystemStatusSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    try {
      if (quiet) setRefreshing(true); else setLoading(true);
      setError(null);
      setSnapshot(await api.adminGetSystemStatus());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "System diagnostics could not be loaded.");
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  return (
    <AdminLayout
      title="System"
      subtitle="Runtime configuration, data stores, integrations and operational health"
      minRole="SUPER_ADMIN"
      actions={<button type="button" onClick={() => void load(true)} disabled={refreshing || loading} className="inline-flex items-center gap-2 rounded-full border border-black/15 bg-white px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.1em] transition hover:border-black disabled:opacity-40"><RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />Refresh</button>}
    >
      {error && <AlertBanner tone="error" title="Diagnostics interrupted" className="mb-5" onDismiss={() => setError(null)}>{error}</AlertBanner>}
      {loading && !snapshot ? <SystemSkeleton /> : snapshot ? <SystemBoard snapshot={snapshot} /> : <EmptySystem onRetry={() => void load()} />}
    </AdminLayout>
  );
}

function SystemBoard({ snapshot }: { snapshot: SystemStatusSnapshot }) {
  const degraded = snapshot.overall === "degraded";
  return <div className="space-y-6">
    <section className="overflow-hidden rounded-[28px] border border-black/10 bg-[#151515] text-white shadow-[0_28px_70px_-48px_rgba(0,0,0,.95)]">
      <div className="grid gap-8 p-6 sm:p-9 xl:grid-cols-[1fr_360px] xl:p-11">
        <div>
          <p className={`flex items-center gap-2 font-mono text-[9px] font-black uppercase tracking-[0.2em] ${degraded ? "text-rose-400" : "text-[#d9ff00]"}`}><span className={`h-2 w-2 rounded-full ${degraded ? "bg-rose-400" : "animate-pulse bg-[#d9ff00]"}`} />Live infrastructure report</p>
          <h2 className="sport-display mt-6 max-w-4xl text-[clamp(46px,14vw,118px)] uppercase leading-[0.76] tracking-[-0.045em]">{degraded ? "System needs attention." : "All lanes operational."}</h2>
          <p className="mt-7 max-w-2xl text-sm font-semibold leading-6 text-white/50">A sanitized view of the services that keep registration, payments, media, email and race-day operations moving.</p>
        </div>
        <div className="grid content-end gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-3 xl:grid-cols-1">
          <HeroDatum label="Operational" value={snapshot.summary.operational} tone="text-[#d9ff00]" />
          <HeroDatum label="Attention" value={snapshot.summary.attention} tone="text-amber-300" />
          <HeroDatum label="Unavailable" value={snapshot.summary.unavailable} tone="text-rose-400" />
        </div>
      </div>
      <div className="grid border-t border-white/10 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">{snapshot.services.map((service) => <ServiceLane key={service.name} service={service} />)}</div>
    </section>

    <div className="grid gap-6 2xl:grid-cols-[1.15fr_.85fr]">
      <section className="overflow-hidden rounded-[24px] border border-black/10 bg-white">
        <PanelHeader icon={<Database />} eyebrow="Authoritative and ephemeral" title="Data stores" note="Connection and capacity readings are collected when this page refreshes." />
        <div className="grid lg:grid-cols-3">
          <StoreBay title="PostgreSQL" role="Business source of truth" status={snapshot.data_stores.postgres.status} detail={snapshot.data_stores.postgres.detail} icon={<Database />}>
            <DataRow label="Endpoint" value={snapshot.data_stores.postgres.endpoint} />
            <DataRow label="Database" value={snapshot.data_stores.postgres.database} />
            <DataRow label="Stored data" value={formatBytes(snapshot.data_stores.postgres.size_bytes)} />
            <DataRow label="Schema" value={`${snapshot.data_stores.postgres.table_count} tables · migration ${snapshot.data_stores.postgres.migration}`} />
            <DataRow label="Pool" value={`${snapshot.data_stores.postgres.active_connections} active · ${snapshot.data_stores.postgres.idle_connections} idle · ${snapshot.data_stores.postgres.max_connections} max`} />
            <DataRow label="Probe" value={`${snapshot.data_stores.postgres.latency_ms} ms`} />
          </StoreBay>
          <StoreBay title="Redis" role="Queue, cache and race locks" status={snapshot.data_stores.redis.status} detail={snapshot.data_stores.redis.detail} icon={<Boxes />}>
            <DataRow label="Endpoint" value={snapshot.data_stores.redis.endpoint} />
            <DataRow label="Logical database" value={String(snapshot.data_stores.redis.database)} />
            <DataRow label="Memory" value={formatBytes(snapshot.data_stores.redis.used_memory_bytes)} />
            <DataRow label="Connections" value={`${snapshot.data_stores.redis.total_connections} total · ${snapshot.data_stores.redis.idle_connections} idle`} />
            <DataRow label="Email queue" value={`${snapshot.data_stores.redis.queue_depth} waiting`} />
            <DataRow label="Probe" value={`${snapshot.data_stores.redis.latency_ms} ms`} />
          </StoreBay>
          <StoreBay title={snapshot.data_stores.storage.provider.toUpperCase()} role="Posters and public media" status={snapshot.data_stores.storage.status} detail={snapshot.data_stores.storage.detail} icon={snapshot.data_stores.storage.provider === "r2" ? <Cloud /> : <HardDrive />}>
            <DataRow label="Provider" value={snapshot.data_stores.storage.provider} />
            <DataRow label="Endpoint" value={snapshot.data_stores.storage.endpoint} />
            <DataRow label="Bucket" value={snapshot.data_stores.storage.bucket || "Local volume"} />
            <DataRow label="Delivery" value={snapshot.data_stores.storage.delivery || "API media proxy"} />
            <DataRow label="Probe" value={`${snapshot.data_stores.storage.latency_ms} ms`} />
          </StoreBay>
        </div>
      </section>

      <Panel icon={<ServerCog />} eyebrow="Process identity" title="Runtime">
        <div className="grid gap-x-6 sm:grid-cols-2">
          <DataRow label="Environment" value={snapshot.application.environment} />
          <DataRow label="Log level" value={snapshot.application.log_level} />
          <DataRow label="API version" value={snapshot.application.version} />
          <DataRow label="Go runtime" value={snapshot.application.go_version} />
          <DataRow label="Commit" value={snapshot.application.commit} />
          <DataRow label="Build time" value={formatBuildTime(snapshot.application.build_time)} />
          <DataRow label="Uptime" value={formatUptime(snapshot.application.uptime_seconds)} />
          <DataRow label="Public origin" value={snapshot.application.public_app_url} />
        </div>
        <div className="mt-5 rounded-2xl border border-black/10 bg-[#f4f3ee] p-4"><p className="font-mono text-[8px] font-black uppercase tracking-[0.15em] text-black/40">Allowed browser origins</p><div className="mt-3 flex flex-wrap gap-2">{snapshot.application.allowed_origins.map((origin) => <code key={origin} className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-[9px] font-bold">{origin}</code>)}</div></div>
      </Panel>
    </div>

    <div className="grid gap-6 xl:grid-cols-2">
      <Panel icon={<Workflow />} eyebrow="External services" title="Integrations">
        <div className="grid gap-3 sm:grid-cols-2">
          <IntegrationCard title="Live updates" icon={<Radio />} integration={snapshot.integrations.realtime} />
          <IntegrationCard title="Runner email" icon={<Mail />} integration={snapshot.integrations.email} />
          <IntegrationCard title="Google sign-in" icon={<KeyRound />} integration={snapshot.integrations.oauth} />
          <IntegrationCard title="Ticket payments" icon={<WalletCards />} integration={snapshot.integrations.payments} />
        </div>
      </Panel>

      <Panel icon={<ShieldCheck />} eyebrow="Secrets stay server-side" title="Security posture">
        <div className="grid gap-3 sm:grid-cols-2">
          <SecretCard label="JWT signing key" configured={snapshot.security.jwt_secret_configured} note={`${snapshot.security.access_token_ttl} access · ${snapshot.security.refresh_token_ttl} refresh`} />
          <SecretCard label="Password hashing" configured note={`Bcrypt cost ${snapshot.security.bcrypt_cost}`} />
          <SecretCard label="Google OAuth secret" configured={snapshot.security.oauth_secret_configured} />
          <SecretCard label="Storage secret" configured={snapshot.security.storage_secret_configured} />
          <SecretCard label="SMTP app password" configured={snapshot.security.smtp_secret_configured} />
          <SecretCard label="Payment API token" configured={snapshot.security.payment_secret_configured} />
        </div>
        <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-black/10 bg-[#151515] p-4 text-white"><div><p className="text-xs font-black">Secure session cookies</p><p className="mt-1 text-[10px] font-semibold text-white/45">Enabled automatically outside development.</p></div><StateBadge state={snapshot.security.secure_cookies ? "operational" : "attention"} label={snapshot.security.secure_cookies ? "Enabled" : "Development mode"} /></div>
      </Panel>
    </div>

    <div className="grid gap-6 xl:grid-cols-[.9fr_1.1fr]">
      <Panel icon={<Activity />} eyebrow="Email and reminders" title="Background workers">
        <div className="mb-4 flex items-start justify-between gap-4 rounded-2xl border border-black/10 bg-[#151515] p-4 text-white"><div><p className="text-xs font-black">Notification delivery worker</p><p className="mt-1 text-[10px] font-semibold leading-4 text-white/45">{snapshot.workers.notification_detail}</p></div><StateBadge state={snapshot.workers.notification_status} label={snapshot.workers.notification_status === "operational" ? "Live" : undefined} /></div>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-black/10 bg-black/10">
          <WorkerDatum label="Queue" value={snapshot.workers.notification_queue_depth} note="waiting" />
          <WorkerDatum label="Pending" value={snapshot.workers.notifications_pending} note="database" />
          <WorkerDatum label="Failed" value={snapshot.workers.notifications_failed} note="needs review" />
          <WorkerDatum label="Attempts" value={snapshot.workers.notification_max_attempts} note="maximum" />
        </div>
        <div className="mt-4 grid gap-x-6 sm:grid-cols-2"><DataRow label="Last heartbeat" value={snapshot.workers.notification_last_seen ? `${snapshot.workers.notification_heartbeat_age_seconds}s ago` : "Not observed"} /><DataRow label="Recovery sweep" value={snapshot.workers.notification_sweep} /><DataRow label="Reminder poll" value={snapshot.workers.reminder_poll} /><DataRow label="Reminder window" value={snapshot.workers.reminder_window} /></div>
      </Panel>

      <Panel icon={<TriangleAlert />} eyebrow="Recovery readiness" title="Resilience">
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5"><div className="flex items-start gap-3"><TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-black">Automated backups are not configured</p><StateBadge state="attention" label="Action needed" /></div><p className="mt-2 text-xs font-semibold leading-5 text-amber-900/60">{snapshot.resilience.backup_detail}</p></div></div></div>
        <div className="mt-4 space-y-3"><RoleRow label="PostgreSQL" value={snapshot.resilience.database_role} /><RoleRow label="Redis" value={snapshot.resilience.redis_role} /><RoleRow label="Media" value={snapshot.resilience.media_role} /></div>
      </Panel>
    </div>

    <p className="px-1 text-right font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-black/35">Snapshot generated {formatDateTime(snapshot.generated_at)} · refreshes every 60 seconds</p>
  </div>;
}

function HeroDatum({ label, value, tone }: { label: string; value: number; tone: string }) { return <div className="bg-[#1d1d1d] p-5 sm:p-6"><p className="font-mono text-[8px] font-black uppercase tracking-[0.18em] text-white/35">{label}</p><p className={`sport-display mt-3 text-5xl leading-none ${tone}`}>{String(value).padStart(2, "0")}</p></div>; }
function ServiceLane({ service }: { service: SystemServiceItem }) { const live = service.status === "operational" || service.status === "configured"; return <div className="border-b border-white/10 p-4 last:border-b-0 sm:border-r xl:border-b-0"><div className="flex items-center justify-between gap-2"><span className={`h-2 w-2 rounded-full ${live ? "bg-[#d9ff00]" : service.status === "unavailable" ? "bg-rose-400" : "bg-amber-300"}`} /><span className="font-mono text-[8px] font-bold text-white/25">{service.latency_ms ? `${service.latency_ms}ms` : "—"}</span></div><p className="mt-5 text-xs font-black">{service.name}</p><p className="mt-1 min-h-7 text-[9px] font-semibold leading-3.5 text-white/35">{service.role}</p></div>; }
function PanelHeader({ icon, eyebrow, title, note }: { icon: ReactNode; eyebrow: string; title: string; note?: string }) { return <header className="flex items-start justify-between gap-4 border-b border-black/10 px-5 py-5 sm:px-7"><div><p className="flex items-center gap-2 font-mono text-[8px] font-black uppercase tracking-[0.18em] text-[#3155ff]"><span className="[&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>{eyebrow}</p><h3 className="mt-2 text-lg font-black tracking-[-0.025em]">{title}</h3>{note && <p className="mt-1 text-[10px] font-semibold text-black/40">{note}</p>}</div></header>; }
function Panel({ icon, eyebrow, title, children }: { icon: ReactNode; eyebrow: string; title: string; children: ReactNode }) { return <section className="overflow-hidden rounded-[24px] border border-black/10 bg-white"><PanelHeader icon={icon} eyebrow={eyebrow} title={title} /><div className="p-5 sm:p-7">{children}</div></section>; }
function StoreBay({ title, role, status, detail, icon, children }: { title: string; role: string; status: SystemState; detail: string; icon: ReactNode; children: ReactNode }) { return <article className="border-t border-black/10 p-5 first:border-t-0 lg:border-l lg:border-t-0 lg:first:border-l-0 sm:p-6"><div className="flex items-center justify-between"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#151515] text-white [&_svg]:h-4 [&_svg]:w-4">{icon}</span><StateBadge state={status} /></div><h4 className="mt-5 text-sm font-black">{title}</h4><p className="mt-1 font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-black/35">{role}</p><p className="mt-3 min-h-10 text-[10px] font-semibold leading-4 text-black/45">{detail}</p><dl className="mt-5 border-t border-black/10">{children}</dl></article>; }
function DataRow({ label, value }: { label: string; value: ReactNode }) { return <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 border-b border-black/[0.07] py-3 last:border-b-0"><dt className="font-mono text-[8px] font-black uppercase tracking-[0.12em] text-black/35">{label}</dt><dd className="min-w-0 break-words text-right text-[10px] font-bold text-black/70">{value || "—"}</dd></div>; }
function StateBadge({ state, label }: { state: SystemState; label?: string }) { return <span className={`inline-flex rounded-full border px-2.5 py-1 font-mono text-[8px] font-black uppercase tracking-[0.11em] ${stateStyle[state]}`}>{label || state}</span>; }
function IntegrationCard({ title, icon, integration }: { title: string; icon: ReactNode; integration: SystemIntegrationStatus }) { return <article className="rounded-2xl border border-black/10 bg-[#f6f5f0] p-4"><div className="flex items-center justify-between"><span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-[#3155ff] shadow-sm [&_svg]:h-4 [&_svg]:w-4">{icon}</span><StateBadge state={integration.status} /></div><p className="mt-4 text-xs font-black">{title}</p><p className="mt-1 font-mono text-[8px] font-black uppercase tracking-[0.12em] text-black/35">{integration.provider}</p><p className="mt-3 min-h-10 text-[10px] font-semibold leading-4 text-black/50">{integration.detail}</p>{(integration.endpoint || integration.identity) && <div className="mt-3 border-t border-black/10 pt-3 font-mono text-[8px] font-bold leading-4 text-black/35"><p className="break-all">{integration.endpoint}</p>{integration.identity && <p>{integration.identity}</p>}</div>}</article>; }
function SecretCard({ label, configured, note }: { label: string; configured: boolean; note?: string }) { return <div className="flex items-center justify-between gap-3 rounded-2xl border border-black/10 p-4"><div><p className="text-xs font-black">{label}</p><p className="mt-1 text-[9px] font-semibold text-black/40">{note || "Value is never exposed to the browser."}</p></div><StateBadge state={configured ? "configured" : "attention"} label={configured ? "Set" : "Missing"} /></div>; }
function WorkerDatum({ label, value, note }: { label: string; value: number; note: string }) { return <div className="bg-[#f7f6f1] p-5"><p className="font-mono text-[8px] font-black uppercase tracking-[0.15em] text-black/35">{label}</p><p className="sport-display mt-3 text-4xl leading-none">{String(value).padStart(2, "0")}</p><p className="mt-1 text-[9px] font-bold text-black/35">{note}</p></div>; }
function RoleRow({ label, value }: { label: string; value: string }) { return <div className="grid gap-1 rounded-xl border border-black/10 px-4 py-3 sm:grid-cols-[100px_1fr]"><p className="font-mono text-[8px] font-black uppercase tracking-[0.12em] text-black/35">{label}</p><p className="text-[10px] font-bold text-black/60">{value}</p></div>; }
function SystemSkeleton() { return <div className="space-y-6"><Skeleton className="h-[430px] rounded-[28px]" /><div className="grid gap-6 xl:grid-cols-2"><Skeleton tone="light" className="h-[520px] rounded-[24px]" /><Skeleton tone="light" className="h-[520px] rounded-[24px]" /></div></div>; }
function EmptySystem({ onRetry }: { onRetry: () => void }) { return <div className="grid min-h-[480px] place-items-center rounded-[26px] border border-black/10 bg-white p-8 text-center"><div><ServerCog className="mx-auto h-10 w-10 text-black/20" /><h2 className="mt-4 text-xl font-black">No system snapshot available</h2><p className="mt-2 text-xs font-semibold text-black/45">Check the API connection and try loading diagnostics again.</p><button type="button" onClick={onRetry} className="mt-5 rounded-full bg-[#151515] px-5 py-3 text-[10px] font-black uppercase tracking-[0.1em] text-white">Try again</button></div></div>; }
function formatBytes(bytes: number) { if (!bytes) return "0 B"; const units = ["B", "KB", "MB", "GB", "TB"]; const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1); return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`; }
function formatUptime(seconds: number) { const days = Math.floor(seconds / 86400); const hours = Math.floor((seconds % 86400) / 3600); const minutes = Math.floor((seconds % 3600) / 60); return [days && `${days}d`, (days || hours) && `${hours}h`, `${minutes}m`].filter(Boolean).join(" "); }
function formatDateTime(value: string) { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" }).format(new Date(value)); }
function formatBuildTime(value: string) { return value === "not embedded" ? value : formatDateTime(value); }
