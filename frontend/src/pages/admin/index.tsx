import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, CircleDollarSign, QrCode, Radio, Route, ScanLine, UsersRound } from "lucide-react";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { EventStatusBadge } from "../../components/admin/EventStatusBadge";
import { RegistrationStatusBadge } from "../../components/admin/RegistrationStatusBadge";
import { AlertBanner } from "../../components/alerts/AlertSystem";
import { Skeleton } from "../../components/Skeleton";
import { withMinSkeleton } from "../../lib/withMinSkeleton";
import { api } from "../../lib/api";
import type { AdminMetrics, Event, Registration } from "../../types";

function formatDate(value?: string | null) {
  if (!value) return "Date pending";
  return new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

export default function AdminDashboardPage() {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [recentRegistrations, setRecentRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDashboardData() {
      try {
        setLoading(true);
        const [eventsRes, regsRes, metricsData] = await withMinSkeleton(() => Promise.all([
          api.listEvents({ limit: 10 }), api.adminListRegistrations({ limit: 8 }), api.adminGetMetrics(),
        ]));
        setEvents(eventsRes.events || []); setRecentRegistrations(regsRes.registrations || []); setMetrics(metricsData);
      } catch (caught: unknown) {
        setError(caught instanceof Error ? caught.message : "Could not load live operations data");
      } finally { setLoading(false); }
    }
    loadDashboardData();
  }, []);

  const nextEvent = useMemo(() => events.filter((event) => event.event_date && !["COMPLETED", "CANCELLED", "ARCHIVED"].includes(event.status)).sort((a, b) => +new Date(a.event_date) - +new Date(b.event_date))[0], [events]);
  const today = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const score = [
    { label: "Events", value: metrics?.total_events ?? events.length, note: `${metrics?.active_events ?? 0} accepting entries`, icon: CalendarDays },
    { label: "Runners", value: metrics?.total_registrations ?? recentRegistrations.length, note: `${metrics?.confirmed_registrations ?? 0} confirmed`, icon: UsersRound },
    { label: "Checked in", value: metrics?.total_checked_in ?? 0, note: "Across all race days", icon: ScanLine },
    { label: "Revenue", value: `$${((metrics?.total_revenue_cents ?? 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, note: "Verified payments", icon: CircleDollarSign },
  ];

  return (
    <AdminLayout title="Club operations" subtitle="Entries, check-in and event readiness in one live view">
      <section className="overflow-hidden rounded-[26px] border border-black/10 bg-[#151515] text-white shadow-[0_22px_60px_-40px_rgba(0,0,0,.8)]">
        <div className="grid lg:grid-cols-[1.35fr_.65fr]">
          <div className="relative overflow-hidden p-6 sm:p-9 lg:p-11">
            <div aria-hidden className="absolute inset-y-0 right-0 hidden w-28 opacity-15 lg:block [background:repeating-linear-gradient(90deg,transparent_0_22px,#fff_22px_24px)]" />
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#d9ff00]">{today} · Operations briefing</p>
            <h2 className="sport-display mt-5 max-w-3xl text-[clamp(54px,8vw,108px)] uppercase leading-[0.78] tracking-[-0.045em]">Keep every runner moving.</h2>
            <p className="mt-7 max-w-xl text-sm font-medium leading-6 text-white/50">Monitor race entries, prepare check-in, and catch operational gaps before the start horn.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/admin/checkin" className="inline-flex items-center gap-2 rounded-full bg-[#d9ff00] px-5 py-3 text-[10px] font-black uppercase tracking-[0.11em] text-black transition hover:-translate-y-0.5"><QrCode className="h-4 w-4" /> Open check-in</Link>
              <Link href="/admin/registrations" className="inline-flex items-center gap-2 rounded-full border border-white/20 px-5 py-3 text-[10px] font-black uppercase tracking-[0.11em] transition hover:border-white"><UsersRound className="h-4 w-4" /> View roster</Link>
            </div>
          </div>
          <div className="border-t border-white/10 bg-[#3155ff] p-6 sm:p-8 lg:border-l lg:border-t-0 lg:p-9">
            <div className="flex items-center justify-between"><p className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-white/60">Next on course</p><Radio className="h-4 w-4 animate-pulse text-[#d9ff00]" /></div>
            {nextEvent ? <div className="mt-12 lg:mt-24"><p className="sport-display text-5xl uppercase leading-[0.86] tracking-[-0.03em]">{nextEvent.name}</p><dl className="mt-7 space-y-3 border-t border-white/20 pt-5 font-mono text-[10px]"><div className="flex justify-between gap-4"><dt className="uppercase text-white/50">Race date</dt><dd className="font-bold">{formatDate(nextEvent.event_date)}</dd></div><div className="flex justify-between gap-4"><dt className="uppercase text-white/50">Location</dt><dd className="max-w-[180px] truncate font-bold">{nextEvent.location || "TBD"}</dd></div><div className="flex justify-between gap-4"><dt className="uppercase text-white/50">State</dt><dd className="font-bold">{nextEvent.status.replaceAll("_", " ")}</dd></div></dl><Link href={`/events/${nextEvent.slug}`} target="_blank" className="mt-7 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] underline decoration-white/30 underline-offset-4">View event page <ArrowUpRight className="h-3.5 w-3.5" /></Link></div> : <div className="mt-16"><Route className="h-10 w-10 text-white/30" /><p className="mt-4 text-sm font-bold">No upcoming event scheduled.</p></div>}
          </div>
        </div>
      </section>

      {error && <AlertBanner tone="error" title="Live data interrupted" className="mt-5" onDismiss={() => setError(null)}>{error}</AlertBanner>}

      <section className="mt-6 overflow-hidden rounded-[22px] border border-black/10 bg-white">
        <div className="flex items-center justify-between border-b border-black/10 px-5 py-4 sm:px-7"><div><p className="font-mono text-[9px] font-black uppercase tracking-[0.2em] text-[#3155ff]">Live scoreboard</p><h3 className="mt-1 text-sm font-black">Club totals</h3></div><span className="flex items-center gap-2 font-mono text-[8px] font-bold uppercase tracking-[0.15em] text-black/35"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Synced</span></div>
        <div className="grid sm:grid-cols-2 xl:grid-cols-4">{score.map((item, index) => { const Icon = item.icon; return <div key={item.label} className={`relative p-6 sm:p-7 ${index > 0 ? "border-t border-black/10 sm:border-l" : ""} ${index === 2 ? "sm:border-l-0 xl:border-l" : ""}`}><div className="flex items-start justify-between"><p className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-black/40">{item.label}</p><Icon className="h-4 w-4 text-[#3155ff]" /></div>{loading ? <Skeleton tone="light" className="mt-4 h-12 w-28" /> : <p className="sport-display mt-4 text-5xl uppercase leading-none tracking-[-0.03em]">{item.value}</p>}<p className="mt-2 text-[10px] font-bold text-black/40">{item.note}</p></div>; })}</div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_.95fr]">
        <OperationsList title="Event board" eyebrow="Course schedule" href="/admin/events" linkLabel="Manage events">
          {loading ? <ListSkeleton /> : events.length === 0 ? <Empty icon={<CalendarDays />} text="No events are on the calendar." /> : events.slice(0, 5).map((event) => <div key={event.id} className="grid grid-cols-[70px_minmax(0,1fr)_auto] items-center gap-4 border-t border-black/10 px-5 py-4 first:border-t-0 sm:px-6"><div className="font-mono"><p className="text-lg font-black leading-none">{event.event_date ? new Date(event.event_date).getDate().toString().padStart(2, "0") : "--"}</p><p className="mt-1 text-[8px] font-bold uppercase tracking-[0.15em] text-black/35">{event.event_date ? new Intl.DateTimeFormat(undefined, { month: "short" }).format(new Date(event.event_date)) : "TBD"}</p></div><div className="min-w-0"><p className="truncate text-xs font-black">{event.name}</p><p className="mt-1 truncate text-[10px] font-medium text-black/40">{event.location || "Location pending"}</p></div><EventStatusBadge status={event.status} /></div>)}
        </OperationsList>
        <OperationsList title="Runner feed" eyebrow="Latest entries" href="/admin/registrations" linkLabel="Open roster">
          {loading ? <ListSkeleton /> : recentRegistrations.length === 0 ? <Empty icon={<UsersRound />} text="New registrations will appear here." /> : recentRegistrations.slice(0, 5).map((reg) => <div key={reg.id} className="grid grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-3 border-t border-black/10 px-5 py-4 first:border-t-0 sm:px-6"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#151515] font-mono text-[10px] font-black text-white">{(reg.full_name || "R").charAt(0)}</span><div className="min-w-0"><p className="truncate text-xs font-black">{reg.full_name || "Unnamed runner"}</p><p className="mt-1 truncate font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-black/35">{reg.registration_number || reg.id.slice(0, 8)} · Tee {reg.tshirt_size || "—"}</p></div><RegistrationStatusBadge status={reg.status} /></div>)}
        </OperationsList>
      </section>
    </AdminLayout>
  );
}

function OperationsList({ title, eyebrow, href, linkLabel, children }: { title: string; eyebrow: string; href: string; linkLabel: string; children: React.ReactNode }) {
  return <article className="overflow-hidden rounded-[22px] border border-black/10 bg-white"><header className="flex items-end justify-between gap-4 border-b border-black/10 px-5 py-5 sm:px-6"><div><p className="font-mono text-[8px] font-black uppercase tracking-[0.2em] text-[#3155ff]">{eyebrow}</p><h3 className="mt-1 text-base font-black tracking-[-0.02em]">{title}</h3></div><Link href={href} className="inline-flex items-center gap-1 font-mono text-[8px] font-black uppercase tracking-[0.12em] text-black/45 hover:text-black">{linkLabel}<ArrowUpRight className="h-3 w-3" /></Link></header><div>{children}</div></article>;
}
function ListSkeleton() { return <div className="space-y-px">{[0,1,2,3].map((item) => <div key={item} className="border-t border-black/10 p-5 first:border-t-0"><Skeleton tone="light" className="h-9 w-full rounded-lg" /></div>)}</div>; }
function Empty({ icon, text }: { icon: React.ReactNode; text: string }) { return <div className="grid place-items-center px-6 py-16 text-center text-black/25"><span className="[&_svg]:h-8 [&_svg]:w-8">{icon}</span><p className="mt-3 text-xs font-bold text-black/40">{text}</p></div>; }
