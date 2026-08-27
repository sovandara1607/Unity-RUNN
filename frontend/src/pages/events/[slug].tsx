import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowUpRight, CalendarDays, Check, Clock3, MapPin, Ticket } from "lucide-react";
import { api } from "../../lib/api";
import { withMinSkeleton } from "../../lib/withMinSkeleton";
import { SportFooter, SportHeader } from "../../components/SportHeader";
import { EventArtwork } from "../../components/EventArtwork";
import { Skeleton, SkeletonText } from "../../components/Skeleton";
import { useSiteConfig } from "../../components/site/SiteConfigProvider";
import type { EventCategory, EventDetail } from "../../types";

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
}

function formatPrice(cents: number) {
  return cents === 0 ? "Free" : `$${(cents / 100).toFixed(2)}`;
}

const statusMeta: Record<string, { label: string; tone: string }> = {
  REGISTRATION_OPEN: { label: "Registration open", tone: "bg-emerald-400/20 text-emerald-300" },
  REGISTRATION_CLOSED: { label: "Registration closed", tone: "bg-amber-400/20 text-amber-300" },
  PUBLISHED: { label: "Registration opens soon", tone: "bg-white/10 text-white/65" },
  COMPLETED: { label: "Event completed", tone: "bg-white/10 text-white/65" },
  CANCELLED: { label: "Event cancelled", tone: "bg-rose-400/20 text-rose-300" },
};

export default function EventDetailPage() {
  const { config } = useSiteConfig();
  const acid = config.primary_color;
  const { slug } = useParams() || {};
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof slug !== "string") return;
    withMinSkeleton(() => api.getEvent(slug))
      .then(setEvent)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load event");
      });
  }, [slug]);

  if (error) {
    return <NotFound />;
  }

  if (!event) {
    return (
      <div className="min-h-screen text-white" style={{ backgroundColor: config.background_color }}>
        <SportHeader active="events" />
        {/* Hero placeholder */}
        <div className="relative border-b border-white/10">
          <div className="topo-surface h-[280px] w-full opacity-40 sm:h-[380px]" />
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="relative -mt-24 pb-8 sm:-mt-28">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-4 h-6 w-32 rounded-md" />
              <Skeleton className="mt-3 h-14 w-full max-w-2xl rounded-xl" />
            </div>
          </div>
        </div>
        <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
          {/* Facts placeholders */}
          <div className="grid gap-4 border-b border-white/10 pb-10 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-lg border border-white/10 p-4">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="mt-3 h-5 w-36" />
              </div>
            ))}
          </div>
          <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.7fr)] lg:items-start">
            <div className="space-y-10">
              <SkeletonText lines={4} />
              <div className="space-y-3">
                <Skeleton className="h-8 w-40" />
                {[0, 1].map((i) => (
                  <Skeleton key={i} className="h-28 rounded-xl" />
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <Skeleton className="h-8 w-32" />
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-20 rounded-lg" />
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }

  const canRegister = event.status === "REGISTRATION_OPEN";
  const categories = event.categories?.filter((category) => category.status === "OPEN") || [];
  const status = statusMeta[event.status] || { label: event.status, tone: "bg-white/10 text-white/65" };

  return (
    <div className="min-h-screen text-white" style={{ backgroundColor: config.background_color }}>
      <SportHeader active="events" />

      {/* Hero */}
      <div className="relative border-b border-white/10">
        <div className="relative h-[280px] w-full overflow-hidden sm:h-[380px]">
          <EventArtwork coverImage={event.cover_image} eventName={event.name} imageClassName="h-full w-full object-cover opacity-75" />
          <div className="absolute inset-0" style={{ background: `linear-gradient(to top, ${config.background_color}, ${config.background_color}66 42%, transparent)` }} />
        </div>
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <div className="relative -mt-24 pb-8 sm:-mt-28">
            <Link href="/events" className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-[0.1em] text-white/60 transition hover:text-white">← All events</Link>
            <span className={`mt-4 inline-flex w-fit rounded px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${status.tone}`}>{status.label}</span>
            <h1 className="sport-display mt-3 max-w-3xl text-5xl uppercase leading-[0.88] tracking-[-0.045em] sm:text-7xl">{event.name}</h1>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        {/* Facts */}
        <div className="grid gap-4 border-b border-white/10 pb-10 sm:grid-cols-3">
          <Fact icon={<CalendarDays className="h-4 w-4" />} label="Date" value={formatDate(event.event_date)} />
          <Fact icon={<Clock3 className="h-4 w-4" />} label="Start" value={event.start_time ? event.start_time.slice(11, 16) : "To be confirmed"} />
          <Fact icon={<MapPin className="h-4 w-4" />} label="Meet" value={event.location || "Location to be confirmed"} />
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.7fr)] lg:items-start">
          <div className="space-y-14">
            {event.description && (
              <p className="max-w-2xl text-lg leading-8 text-white/75">{event.description}</p>
            )}
            {event.schedule?.length ? <Schedule event={event} /> : null}
            {event.faqs?.length ? <FAQ event={event} /> : null}
            {event.rules?.length ? <Rules event={event} primary={acid} /> : null}
          </div>

          {/* Registration card */}
          <aside className="h-fit border border-white/10 bg-[#1a1a1a] p-6 lg:sticky lg:top-8">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-white/50"><Ticket className="h-4 w-4" style={{ color: acid }} />Join the run</p>
            {canRegister && categories.length > 0 ? (
              <div className="mt-5 space-y-3">
                {categories.map((category) => <Category key={category.id} category={category} slug={event.slug} primary={acid} />)}
              </div>
            ) : (
              <p className="mt-4 text-sm leading-6 text-white/60">
                {event.status === "REGISTRATION_CLOSED" ? "Registration has closed for this event." :
                 event.status === "PUBLISHED" ? "Registration opens soon — check back here for the exact date." :
                 "Follow Unity Runn Club for the next update on this event."}
              </p>
            )}
          </aside>
        </div>
      </main>
      <SportFooter />
    </div>
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 text-white/60">{icon}</span>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">{label}</p>
        <p className="mt-1 text-sm font-medium text-white">{value}</p>
      </div>
    </div>
  );
}

function Category({ category, slug, primary }: { category: EventCategory; slug: string; primary: string }) {
  return (
    <Link
      href={`/events/${slug}/register?category=${category.id}`}
      className="group block border border-white/10 bg-white/[0.03] p-4 transition hover:border-[#d9ff00]/60 hover:bg-white/[0.06]"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-semibold text-white">{category.name}</p>
        <p className="text-sm font-semibold" style={{ color: primary }}>{formatPrice(category.price_cents)}</p>
      </div>
      <div className="mt-1.5 flex items-center gap-3 text-xs text-white/50">
        <span>{category.distance}</span>
      </div>
      <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-[0.06em] text-white/70 group-hover:text-[#d9ff00]">
        Register <ArrowUpRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  );
}

function Schedule({ event }: { event: EventDetail }) {
  return (
    <section>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/45">The day</p>
      <div className="mt-5 border-t border-white/10">
        {event.schedule.map((item) => (
          <div key={item.id} className="grid grid-cols-[90px_1fr] gap-4 border-b border-white/10 py-4">
            <time className="text-sm text-white/50">{item.time ? item.time.slice(11, 16) : "TBC"}</time>
            <div>
              <h2 className="font-medium text-white">{item.title}</h2>
              {item.description && <p className="mt-1 text-sm leading-6 text-white/60">{item.description}</p>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function FAQ({ event }: { event: EventDetail }) {
  return (
    <section>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/45">Good to know</p>
      <div className="mt-5 space-y-6">
        {event.faqs.map((faq) => (
          <div key={faq.id}>
            <h2 className="font-medium text-white">{faq.question}</h2>
            <p className="mt-1 text-sm leading-6 text-white/60">{faq.answer}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Rules({ event, primary }: { event: EventDetail; primary: string }) {
  return (
    <section>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/45">Run with respect</p>
      <ul className="mt-5 space-y-3">
        {event.rules.map((rule) => (
          <li key={rule.id} className="flex gap-3 text-sm leading-6 text-white/60">
            <Check className="mt-1 h-4 w-4 shrink-0" style={{ color: primary }} />{rule.rule}
          </li>
        ))}
      </ul>
    </section>
  );
}

function NotFound() {
  const { config } = useSiteConfig();
  return (
    <div className="flex min-h-screen flex-col text-white" style={{ backgroundColor: config.background_color }}>
      <SportHeader active="events" />
      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center px-5 sm:px-8">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/45">Event unavailable</p>
          <h1 className="sport-display mt-3 text-5xl uppercase tracking-[-0.055em]">This run isn’t here.</h1>
          <Link href="/events" className="mt-7 inline-flex items-center gap-2 text-sm font-semibold transition" style={{ color: config.primary_color }}>Browse events <ArrowUpRight className="h-4 w-4" /></Link>
        </div>
      </main>
      <SportFooter />
    </div>
  );
}
