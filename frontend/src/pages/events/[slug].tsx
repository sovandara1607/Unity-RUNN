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
import { formatMoney } from "../../lib/money";
import { eventMapURL } from "../../lib/eventLocation";

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
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
        <div className="border-b border-white/10">
          <div className="mx-auto grid max-w-[1440px] lg:min-h-[680px] lg:grid-cols-[minmax(360px,0.88fr)_minmax(0,1.12fr)]">
            <Skeleton className="min-h-[440px] rounded-none lg:min-h-full" />
            <div className="flex flex-col justify-center px-5 py-10 sm:px-10 lg:px-14">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-7 h-6 w-40 rounded-none" />
              <Skeleton className="mt-5 h-32 w-full max-w-3xl rounded-none" />
              <SkeletonText className="mt-7 max-w-xl" lines={3} />
              <div className="mt-10 grid gap-px bg-white/10 sm:grid-cols-3">
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-none" />)}
              </div>
            </div>
          </div>
        </div>
        <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.7fr)] lg:items-start">
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

      <section className="overflow-hidden border-b border-white/10 bg-[#101010]">
        <div className="mx-auto grid max-w-[1440px] lg:min-h-[680px] lg:grid-cols-[minmax(360px,0.88fr)_minmax(0,1.12fr)]">
          <div className="relative min-h-[460px] overflow-hidden border-b border-white/10 bg-[#17202c] lg:min-h-full lg:border-b-0 lg:border-r">
            <EventArtwork coverImage={event.cover_image} eventName={event.name} variant="hero" />
            <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/10" />
            <span className="pointer-events-none absolute left-5 top-5 h-12 w-12 border-l-2 border-t-2" style={{ borderColor: acid }} />
            <span className="pointer-events-none absolute bottom-5 right-5 h-12 w-12 border-b-2 border-r-2" style={{ borderColor: acid }} />
            <span className="absolute bottom-5 left-5 bg-black/80 px-3 py-2 font-mono text-[8px] font-black uppercase tracking-[0.18em] text-white/70 backdrop-blur">Official event artwork</span>
          </div>

          <div className="relative flex flex-col overflow-hidden px-5 py-9 sm:px-10 sm:py-12 lg:px-14 lg:py-14">
            <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full border border-white/[0.045]" />
            <div className="pointer-events-none absolute -right-4 top-24 h-36 w-36 rounded-full border border-white/[0.045]" />
            <div className="relative">
              <Link href="/events" className="inline-flex items-center gap-2 border-b border-white/25 pb-1 font-mono text-[9px] font-black uppercase tracking-[0.14em] text-white/50 transition hover:border-white hover:text-white">← Race calendar</Link>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <span className={`inline-flex border border-current px-3 py-2 font-mono text-[9px] font-black uppercase tracking-[0.14em] ${status.tone}`}>{status.label}</span>
                <span className="font-mono text-[9px] font-black uppercase tracking-[0.16em] text-white/30">Unity Runn Club · Official entry</span>
              </div>
              <h1 className="sport-display mt-6 max-w-4xl text-[clamp(3.5rem,7vw,7.5rem)] uppercase leading-[0.78] tracking-[-0.045em] text-white">{event.name}</h1>
              {event.description && <p className="mt-7 max-w-2xl text-base font-medium leading-7 text-white/62 sm:text-lg sm:leading-8">{event.description}</p>}

              {canRegister && categories.length > 0 && (
                <Link href={`/events/${event.slug}/register?category=${categories[0].id}`} className="mt-8 inline-flex items-center gap-3 px-5 py-3.5 text-[11px] font-black uppercase tracking-[0.12em] text-black transition hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white" style={{ backgroundColor: acid }}>
                  <Ticket className="h-4 w-4" />Choose your entry<ArrowUpRight className="h-4 w-4" />
                </Link>
              )}
            </div>

            <div className="relative mt-10 grid gap-px border border-white/10 bg-white/10 sm:grid-cols-3 lg:mt-auto">
              <Fact icon={<CalendarDays className="h-4 w-4" />} label="Race day" value={formatDate(event.event_date)} />
              <Fact icon={<Clock3 className="h-4 w-4" />} label="Start" value={event.start_time ? event.start_time.slice(11, 16) : "To be confirmed"} />
              <Fact icon={<MapPin className="h-4 w-4" />} label="Meet" value={event.location || "Location to be confirmed"} href={event.location ? eventMapURL(event) : undefined} />
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.7fr)] lg:items-start">
          <div className="space-y-14">
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

function Fact({ icon, label, value, href }: { icon: React.ReactNode; label: string; value: string; href?: string }) {
  return (
    <div className="flex min-h-24 items-start gap-3 bg-[#151515] p-4">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-white/15 text-white/60">{icon}</span>
      <div>
        <p className="font-mono text-[8px] font-black uppercase tracking-[0.16em] text-white/40">{label}</p>
        {href ? <a href={href} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1.5 text-[13px] font-bold leading-5 text-white underline decoration-white/25 underline-offset-4 transition hover:decoration-[#d9ff00]"><span>{value}</span><ArrowUpRight className="h-3.5 w-3.5 shrink-0" /></a> : <p className="mt-1.5 text-[13px] font-bold leading-5 text-white">{value}</p>}
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
        <p className="text-sm font-semibold" style={{ color: primary }}>{formatMoney(category.price_cents, category.currency)}</p>
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
