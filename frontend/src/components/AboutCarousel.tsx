import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Pause, Play } from "lucide-react";
import { resolveApiAssetUrl } from "../lib/api";
import type { SiteHeroSlide } from "../types";

interface AboutCarouselProps {
  slides: SiteHeroSlide[];
  accent: string;
}

export function AboutCarousel({ slides, accent }: AboutCarouselProps) {
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
    if (!playing || interacting || slides.length < 2) return;
    const timer = window.setInterval(() => setActive((current) => (current + 1) % slides.length), 7000);
    return () => window.clearInterval(timer);
  }, [playing, interacting, slides.length]);

  useEffect(() => {
    setActive((current) => Math.min(current, Math.max(0, slides.length - 1)));
  }, [slides.length]);

  if (slides.length === 0) return null;

  const move = (direction: number) => setActive((current) => (current + direction + slides.length) % slides.length);

  return (
    <section className="border-y border-white/10 px-5 py-10 sm:px-8 sm:py-14" aria-label="Club moments" aria-roledescription="carousel">
      <div className="mx-auto max-w-[1200px]">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: accent }}>Club moments</p>
            <h2 className="sport-display mt-2 text-3xl uppercase leading-none tracking-[-0.03em] sm:text-4xl">Out on the road.</h2>
          </div>
          <span className="font-mono text-[9px] font-black tracking-[0.14em] text-white/35">{String(active + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}</span>
        </div>

        <div
          className="group relative aspect-[4/5] overflow-hidden bg-[#202020] outline-none focus-visible:ring-2 sm:aspect-[16/9]"
          style={{ '--tw-ring-color': accent } as React.CSSProperties}
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
          {slides.map((slide, index) => (
            <figure key={`${slide.image_url}-${index}`} aria-hidden={index !== active} className={`absolute inset-0 transition-opacity duration-700 motion-reduce:transition-none ${index === active ? "opacity-100" : "pointer-events-none opacity-0"}`}>
              {/* Configured images may come from the API media endpoint or a CDN. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={resolveApiAssetUrl(slide.image_url)} alt={index === active ? slide.alt : ""} className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/5 to-transparent" />
              <figcaption className="absolute inset-x-0 bottom-0 p-5 sm:p-8">
                <p className="font-mono text-[8px] font-black uppercase tracking-[0.17em]" style={{ color: accent }}>{slide.eyebrow}</p>
                <p className="sport-display mt-2 max-w-2xl text-3xl uppercase leading-[0.9] tracking-[-0.025em] text-white sm:text-5xl">{slide.title}</p>
              </figcaption>
            </figure>
          ))}

          {slides.length > 1 && (
            <div className="absolute right-4 top-4 flex gap-2 sm:right-6 sm:top-6">
              <Control label="Previous image" onClick={() => move(-1)}><ArrowLeft className="h-4 w-4" /></Control>
              <Control label={playing ? "Pause carousel" : "Play carousel"} onClick={() => setPlaying((value) => !value)}>{playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}</Control>
              <button type="button" onClick={() => move(1)} aria-label="Next image" className="grid h-10 w-10 place-items-center rounded-full text-black transition hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-white" style={{ backgroundColor: accent }}><ArrowRight className="h-4 w-4" /></button>
            </div>
          )}
        </div>

        {slides.length > 1 && (
          <div className="mt-4 flex gap-2" aria-label="Choose an image">
            {slides.map((slide, index) => (
              <button key={`${slide.title}-${index}`} type="button" onClick={() => setActive(index)} aria-label={`Show image ${index + 1}: ${slide.title}`} aria-current={index === active ? "true" : undefined} className={`h-1.5 flex-1 transition-colors ${index === active ? "" : "bg-white/15 hover:bg-white/35"}`} style={index === active ? { backgroundColor: accent } : undefined} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function Control({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} aria-label={label} className="grid h-10 w-10 place-items-center rounded-full border border-white/25 bg-black/45 text-white backdrop-blur-sm transition hover:bg-white hover:text-black focus:outline-none focus-visible:ring-2 focus-visible:ring-white">{children}</button>;
}
