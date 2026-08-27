import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, Pause, Play } from "lucide-react";
import { useSiteConfig } from "./site/SiteConfigProvider";

interface ClubCarouselProps {
  primaryHref: string;
  primaryLabel: string;
}

export function ClubCarousel({ primaryHref, primaryLabel }: ClubCarouselProps) {
  const { config } = useSiteConfig();
  const slides = config.hero_slides;
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [interacting, setInteracting] = useState(false);
  const touchStart = useRef<number | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => { if (media.matches) setPlaying(false); };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!playing || interacting) return;
    const timer = window.setInterval(() => setActive((current) => (current + 1) % slides.length), 6500);
    return () => window.clearInterval(timer);
  }, [playing, interacting, slides.length]);

  useEffect(() => {
    setActive((current) => Math.min(current, slides.length - 1));
  }, [slides.length]);

  const move = (direction: number) => setActive((current) => (current + direction + slides.length) % slides.length);

  return (
    <section className="relative overflow-hidden border-b border-white/10" style={{ backgroundColor: config.background_color }} aria-roledescription="carousel" aria-label={`${config.club_name} hero`}>
      <div
        className="group relative min-h-[670px] focus:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-[#d9ff00]/70 sm:min-h-[720px] lg:h-[calc(100svh-76px)] lg:min-h-[680px] lg:max-h-[920px]"
        tabIndex={0}
        onKeyDown={(event) => { if (event.key === "ArrowLeft") move(-1); if (event.key === "ArrowRight") move(1); }}
        onMouseEnter={() => setInteracting(true)}
        onMouseLeave={() => setInteracting(false)}
        onFocus={() => setInteracting(true)}
        onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setInteracting(false); }}
        onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientX ?? null; setInteracting(true); }}
        onTouchEnd={(event) => {
          const start = touchStart.current;
          const end = event.changedTouches[0]?.clientX;
          if (start != null && end != null && Math.abs(start - end) > 45) move(start > end ? 1 : -1);
          touchStart.current = null;
          setInteracting(false);
        }}
      >
        <div className="flex h-full min-h-[670px] transition-transform duration-700 ease-[cubic-bezier(.22,.76,.22,1)] motion-reduce:transition-none sm:min-h-[720px] lg:min-h-[680px]" style={{ transform: `translateX(-${active * 100}%)` }}>
          {slides.map((slide, index) => (
            <figure key={`${slide.image_url}-${index}`} className="relative min-w-full" aria-hidden={index !== active}>
              {/* Configured artwork may be served by the API or an external CDN. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={slide.image_url} alt={index === active ? slide.alt : ""} className="absolute inset-0 h-full w-full object-cover" />
            </figure>
          ))}
        </div>

        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(8,8,8,.82)_0%,rgba(8,8,8,.4)_48%,rgba(8,8,8,.08)_78%),linear-gradient(0deg,rgba(8,8,8,.88)_0%,transparent_58%)]" />
        <div className="pointer-events-none absolute inset-0 opacity-25 [background:radial-gradient(circle_at_75%_20%,transparent_0,transparent_12%,rgba(0,0,0,.7)_75%)]" />

        <div className="pointer-events-none absolute inset-0 mx-auto flex w-full max-w-[1440px] flex-col px-5 py-7 sm:px-8 sm:py-10 lg:py-12">
          <div className="flex items-start justify-between gap-5 pr-36 sm:pr-40">
            <p className="max-w-xs text-[10px] font-black uppercase leading-5 tracking-[0.16em] sm:text-xs" style={{ color: config.primary_color }}>
              {config.hero_intro}
            </p>
          </div>

          <div className="mt-auto">
            <div aria-live="polite" aria-atomic="true" className="mb-7 max-w-xl sm:mb-8">
              <p className="font-mono text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: config.primary_color }}>{slides[active].eyebrow}</p>
              <p className="mt-2 text-sm font-bold uppercase tracking-[0.1em] text-white/85">{slides[active].title}</p>
              <p className="mt-2 max-w-md text-xs font-medium leading-5 text-white/55 sm:text-sm sm:leading-6">{slides[active].copy}</p>
            </div>

            <h1 className="sport-display text-[22vw] uppercase leading-[0.72] tracking-[-0.045em] sm:text-[15vw] lg:text-[168px]" style={{ color: config.primary_color }}>{config.hero_title_primary}</h1>
            <h1 className="sport-display mt-1 text-[17vw] uppercase leading-[0.76] tracking-[-0.04em] text-white/15 [-webkit-text-stroke:1.5px_rgba(255,255,255,0.75)] sm:text-[11.5vw] lg:text-[130px]">{config.hero_title_secondary}</h1>

            <div className="pointer-events-auto mt-7 flex items-center gap-4">
              <Link href={primaryHref} style={{ backgroundColor: config.primary_color }} className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-black uppercase tracking-[0.06em] text-black transition hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-white">
                {primaryLabel} <ArrowUpRight className="h-4 w-4" />
              </Link>
              <span className="hidden font-mono text-[8px] font-black uppercase tracking-[0.15em] text-white/40 sm:block">Swipe · Arrow keys</span>
            </div>
          </div>
        </div>

        <div className="absolute right-4 top-5 flex items-center gap-2 sm:right-8 sm:top-9 lg:right-12 lg:top-11">
          <CarouselButton label={playing ? "Pause carousel" : "Play carousel"} onClick={() => setPlaying((value) => !value)} primary={config.primary_color}>{playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}</CarouselButton>
          <CarouselButton label="Previous image" onClick={() => move(-1)} primary={config.primary_color}><ArrowLeft className="h-4 w-4" /></CarouselButton>
          <button type="button" onClick={() => move(1)} style={{ backgroundColor: config.primary_color }} className="grid h-10 w-10 place-items-center rounded-full text-black transition hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label="Next image"><ArrowRight className="h-4 w-4" /></button>
        </div>

        <div className="absolute bottom-7 right-5 flex items-center gap-2 sm:bottom-10 sm:right-8 lg:bottom-12 lg:right-12">
          {slides.map((slide, index) => (
            <button key={`${slide.image_url}-${index}`} type="button" onClick={() => setActive(index)} style={index === active ? { backgroundColor: config.primary_color } : undefined} className={`h-1.5 rounded-full transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${index === active ? "w-10" : "w-5 bg-white/35 hover:bg-white/60"}`} aria-label={`Show image ${index + 1}: ${slide.title}`} aria-current={index === active ? "true" : undefined} />
          ))}
          <span className="ml-2 font-mono text-[8px] font-black tracking-[0.12em] text-white/45">{String(active + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}</span>
        </div>
      </div>
    </section>
  );
}

function CarouselButton({ label, onClick, children, primary }: { label: string; onClick: () => void; children: ReactNode; primary: string }) {
  return <button type="button" onClick={onClick} style={{ outlineColor: primary }} className="grid h-10 w-10 place-items-center rounded-full border border-white/25 bg-black/30 text-white backdrop-blur-md transition hover:bg-white hover:text-black focus:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label={label}>{children}</button>;
}
