import React from "react";
import Link from "next/link";
import { ArrowUpRight, Compass, Flag, Handshake, ShieldCheck, UserRound, Users } from "lucide-react";
import { SportFooter, SportHeader } from "../components/SportHeader";
import { AboutCarousel } from "../components/AboutCarousel";
import { useSiteConfig } from "../components/site/SiteConfigProvider";
import type { LucideIcon } from "lucide-react";

const organizerTeam: { role: string; blurb: string; icon: LucideIcon }[] = [
  {
    role: "Race Director",
    blurb: "Owns the race-day plan end to end — course design, run-of-show, and the call on go/no-go.",
    icon: Flag,
  },
  {
    role: "Community & Partnerships",
    blurb: "Builds relationships with venues, sponsors, and the local running crews that show up every season.",
    icon: Handshake,
  },
  {
    role: "Logistics & Safety",
    blurb: "Owns the course marshalling plan, medical coverage, and the safety briefing before every start gun.",
    icon: ShieldCheck,
  },
  {
    role: "Volunteer Coordinator",
    blurb: "Recruits and schedules the volunteers stationed at bib pickup, aid stations, and the finish line.",
    icon: Users,
  },
];

export default function AboutPage() {
  const { config } = useSiteConfig();
  const acid = config.primary_color;

  return (
    <div className="min-h-screen text-white" style={{ backgroundColor: config.background_color }}>
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
            <Link href="/events" className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-[11px] font-black uppercase tracking-[0.1em] text-black transition hover:-translate-y-0.5" style={{ backgroundColor: acid }}>
              See the race calendar <ArrowUpRight className="h-4 w-4" />
            </Link>
            <span className="font-mono text-[9px] font-black uppercase tracking-[0.14em] text-white/35">{config.location_label}</span>
          </div>
        </section>

        <AboutCarousel slides={config.hero_slides} accent={acid} />

        {/* Values marquee, matching the homepage treatment */}
        <section className="topo-surface relative overflow-hidden border-y border-white/10 py-14 sm:py-20">
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-x-10 gap-y-6 px-5 sm:px-8">
            {config.value_messages.map((word) => (
              <p key={word} className="sport-display text-4xl uppercase leading-none tracking-[-0.03em] sm:text-6xl" style={{ color: acid }}>{word}</p>
            ))}
          </div>
        </section>

        {/* Organizer team */}
        <section className="px-5 py-16 sm:px-8 sm:py-24" aria-labelledby="team-heading">
          <div className="mx-auto max-w-[1200px]">
            <div className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between lg:mb-14">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: acid }}>The crew</p>
                <h2 id="team-heading" className="sport-display mt-3 text-4xl uppercase leading-[0.86] tracking-[-0.035em] sm:text-5xl lg:text-6xl">
                  Meet the organizers.
                </h2>
              </div>
              <p className="max-w-sm text-sm leading-6 text-white/50 sm:text-right">
                Individual profiles are on the way. For now, here&apos;s the team structure that plans, runs, and
                marshals every Unity Runn Club event.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {organizerTeam.map(({ role, blurb, icon: Icon }) => (
                <article key={role} className="topo-surface flex flex-col gap-4 border border-white/10 p-6">
                  <div className="flex items-center justify-between">
                    <span className="grid h-12 w-12 place-items-center rounded-full border border-white/15 bg-black/30">
                      <Icon className="h-5 w-5 text-white/70" />
                    </span>
                    <span className="rounded-full border border-white/15 bg-black/30 px-2.5 py-1 font-mono text-[8px] font-black uppercase tracking-[0.14em] text-white/40">
                      Profile pending
                    </span>
                  </div>
                  <div>
                    <p className="flex items-center gap-1.5 font-mono text-[9px] font-black uppercase tracking-[0.14em] text-white/35">
                      <UserRound className="h-3 w-3" /> Name coming soon
                    </p>
                    <h3 className="sport-display mt-2 text-2xl uppercase leading-none tracking-[-0.02em]">{role}</h3>
                    <p className="mt-3 text-xs leading-5 text-white/55">{blurb}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="border-t border-white/10 px-5 py-16 sm:px-8 sm:py-20" style={{ backgroundColor: acid }}>
          <div className="mx-auto flex max-w-[1200px] flex-col items-start justify-between gap-6 text-black sm:flex-row sm:items-center">
            <div>
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-black/60"><Compass className="h-3.5 w-3.5" /> Want to help build a race?</p>
              <h2 className="sport-display mt-3 text-3xl uppercase leading-[0.9] tracking-[-0.03em] sm:text-4xl">We&apos;re always looking for hands on deck.</h2>
            </div>
            <Link href={config.primary_cta_href} className="inline-flex shrink-0 items-center gap-2 rounded-full bg-black px-5 py-3 text-[11px] font-black uppercase tracking-[0.1em] text-white transition hover:-translate-y-0.5">
              {config.primary_cta_label} <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <SportFooter />
    </div>
  );
}
