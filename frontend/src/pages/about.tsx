import React from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { SportFooter, SportHeader } from "../components/SportHeader";
import { AboutCarousel } from "../components/AboutCarousel";
import { useSiteConfig } from "../components/site/SiteConfigProvider";

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
              Browse upcoming races <ArrowUpRight className="h-4 w-4" />
            </Link>
            <span className="font-mono text-[9px] font-black uppercase tracking-[0.14em] text-white/35">{config.location_label}</span>
          </div>
        </section>

        <AboutCarousel slides={config.hero_slides} accent={acid} />

      </main>

      <SportFooter />
    </div>
  );
}
