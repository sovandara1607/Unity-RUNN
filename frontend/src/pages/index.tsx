import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, CalendarDays, Clock3, MapPin, Ticket } from "lucide-react";
import { api } from "../lib/api";
import { withMinSkeleton } from "../lib/withMinSkeleton";
import { ClubCarousel } from "../components/ClubCarousel";
import { EventArtwork } from "../components/EventArtwork";
import { SportFooter, SportHeader } from "../components/SportHeader";
import { useSiteConfig } from "../components/site/SiteConfigProvider";
import { publicEventDescription } from "../lib/eventCopy";
import type { ClubStats, Event, MeResponse } from "../types";

const publicEventStatuses = ["PUBLISHED", "REGISTRATION_OPEN", "REGISTRATION_CLOSED"];

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function formatEventTime(value?: string | null) {
  if (!value) return "Time TBC";
  const time = value.includes("T") ? value.slice(11, 16) : value.slice(0, 5);
  const [hours, minutes] = time.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return time;
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(2026, 0, 1, hours, minutes));
}

function calendarParts(value: string) {
  const date = new Date(value);
  return {
    day: new Intl.DateTimeFormat(undefined, { day: "2-digit" }).format(date),
    month: new Intl.DateTimeFormat(undefined, { month: "short" }).format(date),
    weekday: new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date),
  };
}

function eventStatusLabel(status: Event["status"]) {
  if (status === "REGISTRATION_OPEN") return "Entry open";
  if (status === "REGISTRATION_CLOSED") return "Entry closed";
  return "Coming soon";
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// Ticks once a second toward the next event's start (date portion of
// event_date combined with the time-of-day portion of start_time).
function useCountdown(event: Event | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return useMemo(() => {
    if (!event) return null;
    const datePart = event.event_date.slice(0, 10);
    const timePart = event.start_time ? event.start_time.slice(11, 19) : "00:00:00";
    const target = new Date(`${datePart}T${timePart}Z`).getTime();
    const diff = Math.max(0, target - now);
    return {
      live: target <= now,
      days: Math.floor(diff / 86_400_000),
      hours: Math.floor((diff % 86_400_000) / 3_600_000),
      minutes: Math.floor((diff % 3_600_000) / 60_000),
      seconds: Math.floor((diff % 60_000) / 1_000),
    };
  }, [event, now]);
}

export default function HomePage() {
  const { config } = useSiteConfig();
  const acid = config.primary_color;
  const [user, setUser] = useState<MeResponse | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [stats, setStats] = useState<ClubStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  useEffect(() => {
    async function loadHome() {
      const [me, eventsResult, statsResult] = await withMinSkeleton(() => Promise.all([
        api.getMe({ allowUnauthenticated: true }).catch(() => null),
        api.listEvents({ limit: 3, statuses: publicEventStatuses }).catch(() => ({ events: [], total: 0 })),
        api.getClubStats().catch(() => null),
      ]));
      setUser(me);
      setEvents(eventsResult.events);
      setStats(statsResult);
      setLoading(false);
    }
    loadHome();
  }, []);

  useEffect(() => {
    setSelectedEventId((current) => {
      if (events.some((event) => event.id === current)) return current;
      // Lead with a race that has real artwork when one is available. Events
      // without a poster remain selectable and receive the designed fallback.
      return events.find((event) => event.cover_image?.trim())?.id || events[0]?.id || null;
    });
  }, [events]);

  const isStaff = user && ["STAFF", "ADMIN", "SUPER_ADMIN"].includes(user.role);
  const primaryHref = user ? (isStaff ? "/admin" : "/dashboard") : config.primary_cta_href;
  const primaryLabel = user ? (isStaff ? "Open admin" : "My runs") : config.primary_cta_label;
  const nextEvent = events[0];
  const selectedEvent = events.find((event) => event.id === selectedEventId)
    || events.find((event) => event.cover_image?.trim())
    || nextEvent;
  const selectedEventDescription = publicEventDescription(selectedEvent?.description);
  const countdown = useCountdown(nextEvent);

  return (
    <div className="min-h-screen text-white" style={{ backgroundColor: config.background_color }}>
      <SportHeader active="home" accountHref={user ? primaryHref : "/auth/login"} accountLabel={user ? (isStaff ? "Control" : "Account") : "Sign in"} />

      <main>
        <ClubCarousel primaryHref={primaryHref} primaryLabel={primaryLabel} />

        {/* Countdown + mission panel */}
        <section className="grid gap-0 overflow-hidden lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]" style={{ backgroundColor: acid }}>
          <div className="px-5 py-12 text-black sm:px-8 sm:py-16 lg:border-r lg:border-black/15">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-black/60">{config.mission_eyebrow}</p>
            <p className="mt-5 max-w-lg text-xl font-medium leading-8 sm:text-2xl">
              {config.mission_text} <span className="font-normal text-black/60">{config.mission_supporting_text}</span>
            </p>
            {stats && (
              <dl className="mt-10 flex flex-wrap gap-x-10 gap-y-4 border-t border-black/15 pt-6">
                <Stat value={loading ? undefined : stats?.open_events} label="open races" />
                <Stat value={loading ? undefined : stats?.confirmed_runners} label="confirmed runners" />
                <Stat value={loading ? undefined : stats?.locations} label="run locations" />
              </dl>
            )}
            {!stats && loading && (
              <div className="mt-10 flex flex-wrap gap-x-10 gap-y-4 border-t border-black/15 pt-6" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="w-20 space-y-2">
                    <div className="h-9 animate-pulse rounded bg-black/15" />
                    <div className="h-3 w-14 animate-pulse rounded bg-black/10" />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-black/15 px-5 py-12 text-black sm:px-8 sm:py-16 lg:border-t-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-black/60">
              {countdown?.live ? "Happening now" : "Countdown to next race day"}
            </p>
            {nextEvent && countdown ? (
              <>
                <div className="mt-5 flex items-end gap-3 sm:gap-5">
                  <TimeUnit value={countdown.days} label="days" />
                  <span className="pb-1 text-3xl font-black text-black/25 sm:text-4xl">:</span>
                  <TimeUnit value={countdown.hours} label="hrs" />
                  <span className="pb-1 text-3xl font-black text-black/25 sm:text-4xl">:</span>
                  <TimeUnit value={countdown.minutes} label="min" />
                  <span className="pb-1 text-3xl font-black text-black/25 sm:text-4xl">:</span>
                  <TimeUnit value={countdown.seconds} label="sec" />
                </div>
                <Link href={`/events/${nextEvent.slug}`} className="mt-8 inline-flex items-center gap-2 border-b-2 border-black pb-1 text-sm font-bold uppercase tracking-[0.08em]">
                  {nextEvent.name} <ArrowUpRight className="h-4 w-4" />
                </Link>
              </>
            ) : (
              <p className="mt-5 max-w-sm text-sm font-medium leading-6 text-black/60">No race is on the calendar yet — check back soon or explore past events.</p>
            )}
          </div>
        </section>

        {/* Interactive race calendar */}
        <section className="px-5 py-16 sm:px-8 sm:py-24" style={{ backgroundColor: config.background_color }} aria-labelledby="calendar-heading">
          <div className="mx-auto max-w-[1440px]">
            <div className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between lg:mb-12">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: acid }}>Upcoming races</p>
                <h2 id="calendar-heading" className="sport-display mt-3 text-5xl uppercase leading-[0.82] tracking-[-0.035em] sm:text-6xl lg:text-7xl">Choose your<br />next race.</h2>
              </div>
              <div className="sm:text-right">
                <p className="max-w-sm text-sm leading-6 text-white/50">Compare dates and locations, then open a race to see its distances and entry options.</p>
                <Link href="/events" className="mt-4 inline-flex items-center gap-2 border-b border-white/25 pb-1 text-[11px] font-black uppercase tracking-[0.12em] text-white transition hover:border-white">
                  Full race calendar <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>

            {loading ? (
              <CalendarSkeleton />
            ) : events.length === 0 ? (
              <div className="topo-surface grid min-h-[360px] place-items-center border border-white/10 p-8 text-center">
                <div><CalendarDays className="mx-auto h-8 w-8 text-white/25" /><h3 className="sport-display mt-5 text-4xl uppercase">The road is being mapped.</h3><p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-white/50">No public races are scheduled yet. Check back soon for the next start line.</p></div>
              </div>
            ) : selectedEvent ? (
              <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.035] lg:grid lg:min-h-[600px] lg:grid-cols-[minmax(330px,0.72fr)_minmax(0,1.28fr)]">
                <div className="border-b border-white/10 lg:border-b-0 lg:border-r">
                  <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-6">
                    <p className="font-mono text-[9px] font-black uppercase tracking-[0.18em] text-white/40">Upcoming races</p>
                    <p className="font-mono text-[9px] font-black text-white/25">{String(events.length).padStart(2, "0")} races</p>
                  </div>
                  <div aria-label="Upcoming races">
                    {events.map((event, index) => {
                      const selected = event.id === selectedEvent.id;
                      const date = calendarParts(event.event_date);
                      return (
                        <button
                          key={event.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => setSelectedEventId(event.id)}
                          onFocus={() => setSelectedEventId(event.id)}
                          className={`group grid w-full grid-cols-[70px_minmax(0,1fr)_32px] items-center gap-4 border-b border-white/10 px-5 py-5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white sm:px-6 lg:min-h-[164px] ${selected ? "text-black" : "text-white hover:bg-white/[0.04]"}`}
                          style={selected ? { backgroundColor: acid } : undefined}
                        >
                          <span className={`flex h-[74px] flex-col items-center justify-center border ${selected ? "border-black/20" : "border-white/15"}`}>
                            <span className={`font-mono text-[8px] font-black uppercase tracking-[0.15em] ${selected ? "text-black/50" : "text-white/35"}`}>{date.month}</span>
                            <span className="sport-display mt-1 text-4xl leading-none">{date.day}</span>
                            <span className={`mt-1 font-mono text-[8px] font-black uppercase ${selected ? "text-black/45" : "text-white/30"}`}>{date.weekday}</span>
                          </span>
                          <span className="min-w-0">
                            <span className={`font-mono text-[8px] font-black uppercase tracking-[0.15em] ${selected ? "text-black/45" : "text-white/35"}`}>
                              {String(index + 1).padStart(2, "0")} · {eventStatusLabel(event.status)}{!event.cover_image?.trim() ? " · Poster pending" : ""}
                            </span>
                            <span className="sport-display mt-2 block text-2xl uppercase leading-[0.9] tracking-[-0.025em] sm:text-3xl">{event.name}</span>
                            <span className={`mt-3 flex items-center gap-1.5 truncate text-[10px] font-bold uppercase tracking-[0.08em] ${selected ? "text-black/55" : "text-white/40"}`}><MapPin className="h-3 w-3 shrink-0" />{event.location || "Location TBC"}</span>
                          </span>
                          <span className={`grid h-8 w-8 place-items-center rounded-full border transition ${selected ? "border-black bg-black" : "border-white/15 text-white/40 group-hover:border-white/40 group-hover:text-white"}`} style={selected ? { color: acid } : undefined}><ArrowRight className="h-3.5 w-3.5" /></span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <article key={selectedEvent.id} className="relative min-h-[560px] overflow-hidden lg:min-h-full" aria-live="polite">
                  <div className="absolute inset-0"><EventArtwork coverImage={selectedEvent.cover_image} eventName={selectedEvent.name} accentColor={acid} variant="hero" imageClassName="motion-reduce:transition-none" /></div>
                  <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(8,8,8,.08)_0%,rgba(8,8,8,.42)_42%,rgba(8,8,8,.94)_100%)]" />
                  <div className="absolute inset-0 flex flex-col justify-between p-5 sm:p-8 lg:p-10">
                    <div className="flex items-start justify-between gap-4">
                      <span className="border border-white/20 border-l-[5px] bg-black/90 px-3.5 py-2.5 font-mono text-[9px] font-black uppercase tracking-[0.16em] text-white" style={{ borderLeftColor: acid }}>{eventStatusLabel(selectedEvent.status)}</span>
                      <span className="grid h-16 w-16 place-items-center rounded-full text-center text-black sm:h-20 sm:w-20" style={{ backgroundColor: acid }}><span><span className="sport-display block text-3xl leading-none sm:text-4xl">{calendarParts(selectedEvent.event_date).day}</span><span className="font-mono text-[8px] font-black uppercase tracking-[0.12em]">{calendarParts(selectedEvent.event_date).month}</span></span></span>
                    </div>

                    <div>
                      <div className="flex flex-wrap gap-2 text-[9px] font-black uppercase tracking-[0.1em] text-white/70">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/25 px-3 py-2 backdrop-blur-sm"><CalendarDays className="h-3 w-3" />{formatDate(selectedEvent.event_date)}</span>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/25 px-3 py-2 backdrop-blur-sm"><Clock3 className="h-3 w-3" />{formatEventTime(selectedEvent.start_time)}</span>
                        <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/20 bg-black/25 px-3 py-2 backdrop-blur-sm"><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{selectedEvent.location || "Location TBC"}</span></span>
                      </div>
                      <h3 className="sport-display mt-5 max-w-3xl text-5xl uppercase leading-[0.78] tracking-[-0.035em] text-white sm:text-7xl lg:text-[88px]">{selectedEvent.name}</h3>
                      {selectedEventDescription && <p className="mt-5 line-clamp-2 max-w-2xl text-sm font-medium leading-6 text-white/65">{selectedEventDescription}</p>}
                      <div className="mt-7 flex flex-wrap items-center gap-3">
                        <Link href={`/events/${selectedEvent.slug}`} className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-[11px] font-black uppercase tracking-[0.1em] text-black transition hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white" style={{ backgroundColor: acid }}>
                          {selectedEvent.status === "REGISTRATION_OPEN" ? <Ticket className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                          {selectedEvent.status === "REGISTRATION_OPEN" ? "Choose your entry" : "View race details"}
                        </Link>
                      </div>
                    </div>
                  </div>
                </article>
              </div>
            ) : null}
          </div>
        </section>
      </main>

      <SportFooter />
    </div>
  );
}

function Stat({ value, label }: { value?: number; label: string }) {
  return (
    <div>
      <dd className="text-2xl font-black tracking-[-0.03em] sm:text-3xl">{value === undefined ? "—" : value.toLocaleString()}</dd>
      <dt className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-black/55">{label}</dt>
    </div>
  );
}

function CalendarSkeleton() {
  return (
    <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.035] lg:grid lg:min-h-[600px] lg:grid-cols-[minmax(330px,0.72fr)_minmax(0,1.28fr)]" aria-hidden>
      <div className="border-b border-white/10 lg:border-b-0 lg:border-r">
        <div className="h-[57px] border-b border-white/10" />
        {[0, 1, 2].map((item) => (
          <div key={item} className="grid grid-cols-[70px_1fr] gap-4 border-b border-white/10 px-5 py-5 sm:px-6 lg:min-h-[164px]">
            <div className="h-[74px] animate-pulse bg-white/10" />
            <div className="space-y-3 pt-1"><div className="h-2.5 w-20 animate-pulse rounded bg-white/10" /><div className="h-8 w-4/5 animate-pulse rounded bg-white/10" /><div className="h-2.5 w-32 animate-pulse rounded bg-white/10" /></div>
          </div>
        ))}
      </div>
      <div className="relative min-h-[560px] overflow-hidden bg-white/[0.04]"><div className="absolute inset-0 animate-pulse bg-gradient-to-t from-white/[0.06] to-transparent" /><div className="absolute bottom-10 left-8 right-8 space-y-4"><div className="h-3 w-40 rounded bg-white/10" /><div className="h-20 max-w-xl rounded bg-white/10" /><div className="h-11 w-44 rounded-full bg-white/10" /></div></div>
    </div>
  );
}

function TimeUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-4xl font-black tracking-[-0.02em] sm:text-6xl">{pad(value)}</span>
      <span className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-black/55">{label}</span>
    </div>
  );
}
