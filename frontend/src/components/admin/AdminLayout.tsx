import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/router";
import { Activity, CalendarDays, ExternalLink, FileClock, Gauge, LogOut, Menu, MonitorUp, QrCode, ServerCog, ShieldCheck, UsersRound, Workflow, X } from "lucide-react";
import { api } from "../../lib/api";
import type { MeResponse, Role } from "../../types";

interface AdminLayoutProps { children: React.ReactNode; title?: string; subtitle?: string; actions?: React.ReactNode; minRole?: Role; }

const roleHierarchy: Record<Role, number> = { USER: 0, STAFF: 1, ADMIN: 2, SUPER_ADMIN: 3 };
const navigationItems = [
  { label: "Control room", short: "Overview", href: "/admin", icon: Gauge, minRank: 1 },
  { label: "Check-in station", short: "Race day", href: "/admin/checkin", icon: QrCode, minRank: 1 },
  { label: "Event calendar", short: "Plan races", href: "/admin/events", icon: CalendarDays, minRank: 2 },
  { label: "Public site", short: "Brand & homepage", href: "/admin/public-site", icon: MonitorUp, minRank: 2 },
  { label: "Runner roster", short: "Entries", href: "/admin/registrations", icon: UsersRound, minRank: 1 },
  { label: "Activity log", short: "Audit", href: "/admin/audit-logs", icon: FileClock, minRank: 2 },
  { label: "Automations", short: "Message control", href: "/admin/automations", icon: Workflow, minRank: 2 },
  { label: "Team access", short: "Roles", href: "/admin/users", icon: ShieldCheck, minRank: 3 },
  { label: "System", short: "Config & health", href: "/admin/system", icon: ServerCog, minRank: 3 },
];

export function AdminLayout({ children, title, subtitle, actions, minRole = "STAFF" }: AdminLayoutProps) {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [clock, setClock] = useState("--:--");

  useEffect(() => {
    const updateClock = () => setClock(new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()));
    updateClock();
    const timer = window.setInterval(updateClock, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [sidebarOpen]);

  useEffect(() => {
    async function checkAuth() {
      try {
        const user = await api.getMe();
        setCurrentUser(user);
        if ((roleHierarchy[user.role] ?? 0) < (roleHierarchy[minRole] ?? 1)) { setAuthorized(false); router.replace("/dashboard"); return; }
        setAuthorized(true);
      } catch {
        setAuthorized(false);
        router.replace("/auth/login?redirect=" + encodeURIComponent(router.asPath));
      } finally { setLoading(false); }
    }
    checkAuth();
  }, [minRole, router]);

  const handleLogout = async () => { await api.logout(); router.push("/auth/login"); };
  const currentRole = currentUser?.role || "STAFF";
  const userRank = roleHierarchy[currentRole] ?? 1;

  if (loading || !authorized) return (
    <div className="admin-shell grid min-h-screen place-items-center bg-[#151515] text-white"><div className="text-center"><div className="mx-auto h-12 w-12 rounded-full border border-white/15 p-1"><div className="h-full w-full animate-spin rounded-full border-2 border-transparent border-t-[#d9ff00]" /></div><p className="mt-4 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">Opening race control</p></div></div>
  );

  return (
    <div className="admin-shell min-h-screen bg-[#efeee8] text-[#151515] lg:flex">
      {sidebarOpen && <button aria-label="Close menu" className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[min(286px,calc(100vw-24px))] flex-col overflow-hidden bg-[#151515] text-white transition-transform duration-300 lg:sticky lg:top-0 lg:h-screen lg:w-[286px] lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div aria-hidden className="absolute bottom-0 left-0 top-0 w-1.5 bg-[#3155ff]" /><div aria-hidden className="absolute left-1.5 top-0 h-24 w-1 bg-[#d9ff00]" />
        <div className="flex h-[88px] items-center justify-between border-b border-white/10 px-7">
          <Link href="/admin" className="flex items-center gap-3" aria-label="Unity Runn Club race control">
            <Image src="/Unity-Logos/logo%20UNTR-02.png" alt="" width={40} height={40} className="h-10 w-10 object-cover" />
            <div><p className="text-[9px] font-black uppercase tracking-[0.24em] text-[#d9ff00]">Unity Runn</p><p className="sport-display text-xl uppercase leading-none tracking-[-0.01em]">Race Control</p></div>
          </Link>
          <button onClick={() => setSidebarOpen(false)} className="rounded-full border border-white/15 p-2 text-white/60 lg:hidden" aria-label="Close navigation"><X className="h-4 w-4" /></button>
        </div>
        <div className="grid grid-cols-2 border-b border-white/10 font-mono">
          <div className="border-r border-white/10 px-7 py-4"><p className="text-[8px] uppercase tracking-[0.2em] text-white/35">Local time</p><p className="mt-1 text-lg font-bold tabular-nums">{clock}</p></div>
          <div className="px-5 py-4"><p className="text-[8px] uppercase tracking-[0.2em] text-white/35">System</p><p className="mt-2 flex items-center gap-2 text-[10px] font-bold uppercase text-[#d9ff00]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#d9ff00]" /> Online</p></div>
        </div>
        <nav className="flex-1 overflow-y-auto px-4 py-5">
          <p className="px-3 pb-3 font-mono text-[8px] font-bold uppercase tracking-[0.24em] text-white/25">Operations</p>
          <div className="space-y-1">{navigationItems.filter((item) => userRank >= item.minRank).map((item) => {
            const active = router.pathname === item.href || (item.href !== "/admin" && router.pathname.startsWith(item.href)); const Icon = item.icon;
            return <Link key={item.href} href={item.href} onClick={() => setSidebarOpen(false)} className={`group relative flex items-center gap-3 rounded-xl px-3 py-3 transition ${active ? "bg-[#3155ff] text-white" : "text-white/55 hover:bg-white/[0.06] hover:text-white"}`}><span className={`grid h-9 w-9 place-items-center rounded-lg ${active ? "bg-white text-[#3155ff]" : "border border-white/10 bg-white/[0.03]"}`}><Icon className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-xs font-bold">{item.label}</span><span className={`mt-0.5 block font-mono text-[8px] uppercase tracking-[0.16em] ${active ? "text-white/65" : "text-white/25"}`}>{item.short}</span></span>{active && <span className="h-2 w-2 rotate-45 bg-[#d9ff00]" />}</Link>;
          })}</div>
        </nav>
        <div className="border-t border-white/10 p-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#d9ff00] font-mono text-sm font-black text-black">{(currentUser?.name || currentUser?.email || "U").charAt(0).toUpperCase()}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{currentUser?.name || currentUser?.email}</p><p className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.15em] text-white/35">Access · {currentRole.replace("_", " ")}</p></div><button onClick={handleLogout} className="rounded-lg p-2 text-white/35 transition hover:bg-white/10 hover:text-white" aria-label="Sign out"><LogOut className="h-4 w-4" /></button></div></div>
          <Link href="/events" target="_blank" className="mt-2 flex items-center justify-between px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-white/35 transition hover:text-white"><span>Open public site</span><ExternalLink className="h-3 w-3" /></Link>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b border-black/10 bg-[#efeee8]/95 backdrop-blur-xl">
          <div className="flex min-h-[76px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:min-h-[88px] sm:flex-nowrap sm:gap-4 sm:px-8 sm:py-0 xl:px-10">
            <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
              <button onClick={() => setSidebarOpen(true)} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#151515] text-white lg:hidden" aria-label="Open navigation"><Menu className="h-4 w-4" /></button>
              <div className="min-w-0"><p className="flex items-center gap-2 font-mono text-[8px] font-bold uppercase tracking-[0.18em] text-black/35"><Activity className="h-3 w-3 text-[#3155ff]" /> Operations desk</p><h1 className="truncate text-base font-black tracking-[-0.02em] sm:text-xl">{title || "Race control"}</h1>{subtitle && <p className="mt-0.5 hidden truncate text-[11px] font-medium text-black/45 md:block">{subtitle}</p>}</div>
            </div>
            <div className={`mobile-scroll-row order-3 w-full shrink-0 items-center gap-2 overflow-x-auto pl-14 [&_a]:shrink-0 [&_a]:whitespace-nowrap [&_button]:shrink-0 [&_button]:whitespace-nowrap sm:order-none sm:flex sm:w-auto sm:overflow-visible sm:pl-0 ${actions ? "flex" : "hidden"}`}>{router.pathname !== "/admin/checkin" && <Link href="/admin/checkin" className="hidden items-center gap-2 rounded-full border border-black/15 bg-white px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.1em] transition hover:border-black sm:inline-flex"><QrCode className="h-3.5 w-3.5 text-[#3155ff]" /> Launch scanner</Link>}{actions}</div>
          </div>
        </header>
        <main className="admin-track-surface mx-auto min-h-[calc(100vh-88px)] w-full max-w-[1600px] p-4 sm:p-8 xl:p-10">{children}</main>
      </div>
    </div>
  );
}
