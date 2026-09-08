import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, MapPin } from "lucide-react";
import { SportFooter, SportHeader } from "../components/SportHeader";
import { AboutCarousel } from "../components/AboutCarousel";
import { useSiteConfig } from "../components/site/SiteConfigProvider";
import { Button } from "../components/primitives/Button";
import { PageMeta } from "../components/site/PageMeta";
import { StatusChip } from "../components/primitives/StatusChip";
import { api } from "../lib/api";
import { withMinSkeleton } from "../lib/withMinSkeleton";
import { formatEventDate, eventStatusLabel, eventStatusTone } from "../lib/eventFormat";
import { publicEventDescription } from "../lib/eventCopy";
import type { ClubStats, Event } from "../types";

const publicEventStatuses = ["PUBLISHED", "REGISTRATION_OPEN", "REGISTRATION_CLOSED"];

export default function AboutPage() {
  const { config } = useSiteConfig();
  const acid = config.primary_color;
  const [stats, setStats] = useState<ClubStats | null>(null);
  const [nextRace, setNextRace] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    withMinSkeleton(() => Promise.all([
      api.getClubStats().then((r) => ({ ok: true as const, r }), () => ({ ok: false as const, r: null })),
      api.listEvents({ limit: 1, statuses: publicEventStatuses }).then(
        (r) => ({ ok: true as const, r }),
        () => ({ ok: false as const, r: { events: [] as Event[], total: 0 } }),
      ),
    ])).then(([statsResult, eventsResult]) => {
      if (!active) return;
      setStats(statsResult.r);
      setNextRace(eventsResult.r.events[0] || null);
      setFailed(!statsResult.ok && !eventsResult.ok);
      setLoading(false);
    });
    return () => { active = false; };
  }, [reloadKey]);

  // Admin-authored value statements. They are editable in /admin/public-site and, until now,
  // were rendered nowhere at all -- the club wrote them and the site never showed them.
  const values = (config.value_messages || []).filter((value) => value.trim());

  return (
    <div className="min-h-screen text-white" style={{ backgroundColor: config.background_color }}>
      <PageMeta
        title="About the club"
        description={`${config.mission_text} ${config.mission_supporting_text}`.trim() || `Who we are and how to run with ${config.club_name}.`}
      />
      <SportHeader active="about" />

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 sm:py-24">
          <p className="text-xs font-bold uppercase tracking-[0.22em]" style={{ color: acid }}>About {config.club_name}</p>
          <h1 className="sport-display mt-4 max-w-3xl text-5xl uppercase leading-[0.86] tracking-[-0.04em] sm:text-6xl lg:text-7xl">
            Behind every<br />start line.
          </h1>
          <p className="mt-6 max-w-2xl text-sm leading-6 text-white/65 sm:text-base sm:leading-7">
            {config.mission_text} {config.mission_supporting_text}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button href="/events" className="hover:-translate-y-0.5">
              Browse upcoming races <ArrowUpRight className="h-4 w-4" />
            </Button>
            <span className="inline-flex items-center gap-1.5 font-mono text-[9px] font-black uppercase tracking-[0.14em] text-white/55">
              <MapPin className="h-3 w-3" /> {config.location_label}
            </span>
          </div>
        </section>

        {/* The club in numbers */}
        <section className="border-y border-white/10">
          <div className="mx-auto grid max-w-[1200px] gap-px bg-white/10 px-5 sm:px-8 md:grid-cols-3">
            <ClubNumber label="Open races" value={stats?.open_events} loading={loading} background={config.background_color} />
            <ClubNumber label="Confirmed runners" value={stats?.confirmed_runners} loading={loading} background={config.background_color} />
            <ClubNumber label="Run locations" value={stats?.locations} loading={loading} background={config.background_color} />
          </div>
          {failed && (
            <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-4 px-5 py-5 sm:px-8">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-white/60">Club numbers are unavailable right now.</p>
              <button onClick={() => setReloadKey((key) => key + 1)} className="text-xs font-black uppercase tracking-[0.12em] underline underline-offset-4 transition hover:opacity-70">
                Try again
              </button>
            </div>
          )}
        </section>

        {/* What we stand for */}
        {values.length > 0 && (
          <section className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 sm:py-20">
            <p className="font-mono text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: acid }}>What we stand for</p>
            <ul className="mt-8 grid gap-px bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
              {values.map((value, index) => (
                <li key={value} className="p-6 sm:p-8" style={{ backgroundColor: config.background_color }}>
                  <span className="font-mono text-[10px] font-black tracking-[0.16em] text-white/50">{String(index + 1).padStart(2, "0")}</span>
                  <p className="mt-4 text-base font-bold leading-6">{value}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <AboutCarousel slides={config.hero_slides} accent={acid} />

        {/* Run with us */}
        <section className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 sm:py-24">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
            <div>
              <p className="font-mono text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: acid }}>Run with us</p>
              <h2 className="sport-display mt-4 text-4xl uppercase leading-[0.88] tracking-[-0.035em] sm:text-5xl">
                No trials.<br />No membership.
              </h2>
              <p className="mt-5 max-w-md text-sm leading-6 text-white/65">
                Pick a race, enter online, and turn up. Your ticket and check-in QR live in your account — show it at the desk and you are on the start line.
              </p>
            </div>

            {loading ? (
              <div className="min-h-[210px] animate-pulse rounded-[24px] border border-white/10 bg-white/[0.04]" />
            ) : nextRace ? (
              <Link
                href={`/events/${nextRace.slug}`}
                className="group block rounded-[24px] border border-white/10 bg-white/[0.04] p-7 transition hover:border-white/30 sm:p-8"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-[9px] font-black uppercase tracking-[0.18em] text-white/55">Next on the calendar</p>
                  <StatusChip tone={eventStatusTone(nextRace.status)} variant="pill">{eventStatusLabel(nextRace.status)}</StatusChip>
                </div>
                <p className="sport-display mt-5 text-3xl uppercase leading-[0.92] tracking-[-0.03em] sm:text-4xl">{nextRace.name}</p>
                <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-bold uppercase tracking-[0.1em] text-white/55">
                  <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{formatEventDate(nextRace.event_date, "medium")}</span>
                  {nextRace.location && <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{nextRace.location}</span>}
                </p>
                {publicEventDescription(nextRace.description) && (
                  <p className="mt-4 line-clamp-2 text-sm leading-6 text-white/60">{publicEventDescription(nextRace.description)}</p>
                )}
                <span className="mt-6 inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] transition group-hover:gap-3" style={{ color: acid }}>
                  See the race <ArrowUpRight className="h-3.5 w-3.5" />
                </span>
              </Link>
            ) : (
              <div className="rounded-[24px] border border-dashed border-white/15 p-8 text-center">
                <p className="text-sm font-bold uppercase tracking-[0.12em] text-white/55">No races are on the calendar yet.</p>
                <p className="mt-3 text-sm leading-6 text-white/50">The next start line is being mapped. Check the calendar soon.</p>
              </div>
            )}
          </div>
        </section>
      </main>

      <SportFooter />
    </div>
  );
}

function ClubNumber({ label, value, loading, background }: { label: string; value?: number; loading: boolean; background: string }) {
  return (
    <div className="px-2 py-8 text-center sm:py-10" style={{ backgroundColor: background }}>
      {loading ? (
        <div className="mx-auto h-10 w-20 animate-pulse rounded bg-white/10" />
      ) : (
        <p className="sport-display text-5xl leading-none sm:text-6xl">{value ?? "—"}</p>
      )}
      <p className="mt-3 font-mono text-[9px] font-black uppercase tracking-[0.16em] text-white/55">{label}</p>
    </div>
  );
}
