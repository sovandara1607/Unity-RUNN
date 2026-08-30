import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, MapPin, Search, SlidersHorizontal, X } from "lucide-react";
import { api } from "../lib/api";
import { withMinSkeleton } from "../lib/withMinSkeleton";
import { SportFooter, SportHeader } from "../components/SportHeader";
import { EventArtwork } from "../components/EventArtwork";
import { useSiteConfig } from "../components/site/SiteConfigProvider";
import type { Event, EventStatus } from "../types";

const filterTabs: { label: string; value: "ALL" | EventStatus }[] = [
  { label: "All", value: "ALL" },
  { label: "Open for entry", value: "REGISTRATION_OPEN" },
  { label: "Coming soon", value: "PUBLISHED" },
  { label: "Closed", value: "REGISTRATION_CLOSED" },
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function statusLabel(status: Event["status"]) {
  if (status === "REGISTRATION_OPEN") return "Register now";
  if (status === "REGISTRATION_CLOSED") return "Entries closed";
  return "Coming up";
}

export default function EventsPage() {
  const { config } = useSiteConfig();
  const acid = config.primary_color;
  const [events, setEvents] = useState<Event[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"ALL" | EventStatus>("ALL");
  const [month, setMonth] = useState("ALL");
  const [location, setLocation] = useState("ALL");

  useEffect(() => {
    withMinSkeleton(() =>
      api.listEvents({ limit: 100, statuses: ["PUBLISHED", "REGISTRATION_OPEN", "REGISTRATION_CLOSED"] })
    )
      .then((response) => setEvents([...response.events].sort((a, b) => a.event_date.localeCompare(b.event_date))))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load events"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return events.filter((event) => {
      if (tab !== "ALL" && event.status !== tab) return false;
      if (month !== "ALL" && event.event_date.slice(0, 7) !== month) return false;
      if (location !== "ALL" && event.location !== location) return false;
      if (!query.trim()) return true;
      const q = query.trim().toLowerCase();
      return event.name.toLowerCase().includes(q) || (event.location || "").toLowerCase().includes(q);
    });
  }, [events, tab, month, location, query]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { ALL: events.length };
    for (const event of events) map[event.status] = (map[event.status] || 0) + 1;
    return map;
  }, [events]);

  const monthOptions = useMemo(() => Array.from(new Set(events.map((event) => event.event_date.slice(0, 7))))
    .filter(Boolean)
    .sort()
    .map((value) => ({
      value,
      label: new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}-01T00:00:00Z`)),
    })), [events]);

  const locationOptions = useMemo(() => Array.from(new Set(events.map((event) => event.location.trim()).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b)), [events]);
  const hasFilters = tab !== "ALL" || month !== "ALL" || location !== "ALL" || Boolean(query.trim());
  const clearFilters = () => {
    setTab("ALL");
    setMonth("ALL");
    setLocation("ALL");
    setQuery("");
  };

  return (
    <div className="min-h-screen text-white" style={{ backgroundColor: config.background_color }}>
      <SportHeader active="events" />
      <main className="mx-auto max-w-[1200px] px-5 py-10 sm:px-8 sm:py-14">
        <div className="mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.22em]" style={{ color: acid }}>Race calendar</p>
          <h1 className="sport-display mt-3 text-4xl uppercase leading-[0.9] tracking-[-0.04em] sm:text-5xl">Find your next race.</h1>
          <p className="mt-3 max-w-lg text-sm leading-6 text-white/65">Browse every Unity Runn Club event — search by name, then narrow the board by entry status, month, or start location.</p>
        </div>

        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorState error={error} />
        ) : events.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* Search + filters */}
            <div className="flex flex-col gap-3 border-y border-white/15 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                {filterTabs.map((filterTab) => (
                  <button
                    key={filterTab.value}
                    onClick={() => setTab(filterTab.value)}
                    style={tab === filterTab.value ? { backgroundColor: acid } : undefined}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.06em] transition-colors ${
                      tab === filterTab.value ? "text-black" : "bg-white/10 text-white/70 hover:bg-white/15 hover:text-white"
                    }`}
                  >
                    {filterTab.label}
                    {counts[filterTab.value] ? <span className="ml-1.5 opacity-70">{counts[filterTab.value]}</span> : null}
                  </button>
                ))}
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name or location"
                  className="w-full rounded-full border border-white/15 bg-white/5 py-2 pl-9 pr-3.5 text-sm text-white placeholder-white/40 outline-none transition focus:border-[#d9ff00]"
                />
              </div>
            </div>

            <div className="flex flex-col gap-4 border-b border-white/15 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <p className="flex shrink-0 items-center gap-2 font-mono text-[9px] font-black uppercase tracking-[0.16em] text-white/35"><SlidersHorizontal className="h-3.5 w-3.5" /> Refine the board</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="relative">
                    <span className="sr-only">Race month</span>
                    <select value={month} onChange={(event) => setMonth(event.target.value)} className="h-10 min-w-48 appearance-none rounded-full border border-white/15 bg-white/[0.06] pl-4 pr-10 text-[10px] font-black uppercase tracking-[0.09em] text-white outline-none transition hover:border-white/30 focus:border-white">
                      <option value="ALL" className="text-black">Any month</option>
                      {monthOptions.map((option) => <option key={option.value} value={option.value} className="text-black">{option.label}</option>)}
                    </select>
                    <CalendarDays className="pointer-events-none absolute right-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
                  </label>
                  <label className="relative">
                    <span className="sr-only">Start location</span>
                    <select value={location} onChange={(event) => setLocation(event.target.value)} className="h-10 min-w-48 appearance-none rounded-full border border-white/15 bg-white/[0.06] pl-4 pr-10 text-[10px] font-black uppercase tracking-[0.09em] text-white outline-none transition hover:border-white/30 focus:border-white">
                      <option value="ALL" className="text-black">Any location</option>
                      {locationOptions.map((option) => <option key={option} value={option} className="text-black">{option}</option>)}
                    </select>
                    <MapPin className="pointer-events-none absolute right-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
                  </label>
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 lg:justify-end">
                <p role="status" className="font-mono text-[9px] font-black uppercase tracking-[0.14em] text-white/35"><span className="text-white">{filtered.length}</span> {filtered.length === 1 ? "start" : "starts"} on the board</p>
                {hasFilters && <button type="button" onClick={clearFilters} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/15 px-3 py-2 text-[9px] font-black uppercase tracking-[0.1em] text-white/55 transition hover:border-white/40 hover:text-white"><X className="h-3 w-3" /> Clear all</button>}
              </div>
            </div>

            {/* Results */}
            {filtered.length === 0 ? (
              <div className="border-b border-white/15 py-16 text-center text-sm text-white/50">
                <p>No events match {query ? `"${query}"` : "these filters"}. Try a different search or filter.</p>
                {hasFilters && <button type="button" onClick={clearFilters} className="mx-auto mt-4 block border-b border-white/35 pb-1 text-[10px] font-black uppercase tracking-[0.12em] text-white">Show every race</button>}
              </div>
            ) : (
              <div className="grid gap-4 py-8 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((event) => <EventCard key={event.id} event={event} primary={acid} />)}
              </div>
            )}

            <div className="mt-4 flex min-h-[200px] flex-col justify-between gap-6 p-7 text-black sm:flex-row sm:items-center sm:p-10" style={{ backgroundColor: acid }}>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em]">What we move for</p>
                <p className="sport-display mt-2 max-w-md text-3xl uppercase leading-[0.9] tracking-[-0.04em] sm:text-4xl">More runners. More together.</p>
              </div>
              <Link href="/" className="inline-flex w-fit items-center gap-2 border-b border-black pb-1 text-xs font-bold uppercase tracking-[0.12em]">Meet the club <ArrowUpRight className="h-4 w-4" /></Link>
            </div>
          </>
        )}
      </main>
      <SportFooter />
    </div>
  );
}

function EventCard({ event, primary }: { event: Event; primary: string }) {
  const statusColor = event.status === "REGISTRATION_OPEN"
    ? "#65d69e"
    : event.status === "REGISTRATION_CLOSED"
      ? "#f1b84b"
      : primary;
  return (
    <Link href={`/events/${event.slug}`} className="group flex flex-col overflow-hidden border border-white/10 bg-[#1a1a1a] transition hover:border-white/30">
      <div className="relative h-56 w-full overflow-hidden bg-[#252525] sm:h-64">
        <EventArtwork coverImage={event.cover_image} eventName={event.name} variant="card" />
        <span
          className="absolute left-0 top-4 border-y border-r border-white/20 border-l-[5px] bg-black/90 px-3 py-2 font-mono text-[9px] font-black uppercase tracking-[0.16em] text-white"
          style={{ borderLeftColor: statusColor }}
        >
          {statusLabel(event.status)}
        </span>
      </div>
      <div className="flex flex-1 flex-col justify-between p-5">
        <h2 className="sport-display text-2xl uppercase leading-[0.95] tracking-[-0.03em] transition-colors group-hover:text-white" style={{ color: primary }}>{event.name}</h2>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-bold uppercase tracking-[0.06em] text-white/55">
          <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{formatDate(event.event_date)}</span>
          {event.location && <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{event.location}</span>}
        </div>
      </div>
    </Link>
  );
}

function Loading() {
  return (
    <>
      {/* Filter bar placeholder */}
      <div className="flex items-center justify-between border-y border-white/15 py-4" aria-hidden>
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => <div key={i} className="h-7 w-20 animate-pulse rounded-full bg-white/10" />)}
        </div>
        <div className="hidden h-9 w-64 animate-pulse rounded-lg bg-white/10 sm:block" />
      </div>
      {/* Event cards */}
      <div className="grid gap-4 py-8 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((item) => (
          <div key={item} className="rounded-xl border border-white/10 p-5">
            <div className="h-56 w-full animate-pulse rounded-lg bg-white/10 sm:h-64" />
            <div className="mt-4 h-6 w-3/4 animate-pulse rounded bg-white/10" />
            <div className="mt-3 h-3.5 w-1/2 animate-pulse rounded bg-white/10" />
          </div>
        ))}
      </div>
    </>
  );
}
function ErrorState({ error }: { error: string }) { const { config } = useSiteConfig(); return <div className="topo-surface flex min-h-[320px] items-center justify-center border border-white/10 p-8 text-center"><div><p className="sport-display text-4xl uppercase" style={{ color: config.primary_color }}>No signal.</p><p className="mt-4 text-sm text-white/65">Events could not load. Refresh to try again.</p><p className="mt-2 text-xs text-white/40">{error}</p></div></div>; }
function EmptyState() { const { config } = useSiteConfig(); return <div className="topo-surface flex min-h-[320px] items-center justify-center border border-white/10 p-8 text-center"><div><p className="sport-display text-4xl uppercase" style={{ color: config.primary_color }}>No starts yet.</p><p className="mt-4 text-sm text-white/65">The next {config.club_name} event is in the works.</p></div></div>; }
