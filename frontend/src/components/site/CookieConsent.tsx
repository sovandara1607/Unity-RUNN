import { useEffect, useRef, useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import {
  COOKIE_PREFERENCES_EVENT,
  type CookieConsentChoice,
  readCookieConsent,
  saveCookieConsent,
} from "../../lib/cookieConsent";
import { useSiteConfig } from "./SiteConfigProvider";

function RunnerMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="19.5" cy="5.5" r="2.5" fill="currentColor" stroke="none" />
      <path d="m14 13 4-3 4 3 4 1M18 10l-2 7-5 4M16 17l5 4 2 6M11 21l-5 5" />
    </svg>
  );
}

export function CookieConsent() {
  const { config } = useSiteConfig();
  const [open, setOpen] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    setOpen(readCookieConsent() === null);
    const showPreferences = () => setOpen(true);
    window.addEventListener(COOKIE_PREFERENCES_EVENT, showPreferences);
    return () => window.removeEventListener(COOKIE_PREFERENCES_EVENT, showPreferences);
  }, []);

  useEffect(() => {
    if (open) headingRef.current?.focus();
  }, [open]);

  const choose = (choice: CookieConsentChoice) => {
    saveCookieConsent(choice);
    setOpen(false);
  };

  if (!open) return null;

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-consent-title"
      aria-describedby="cookie-consent-description"
      className="fixed inset-x-3 bottom-3 z-[80] mx-auto max-w-[1120px] overflow-hidden border border-white/20 bg-[#101010] text-white shadow-[0_24px_80px_rgba(0,0,0,.55)] sm:inset-x-6 sm:bottom-6"
    >
      <div className="grid sm:grid-cols-[112px_minmax(0,1fr)]">
        <div className="relative hidden min-h-full overflow-hidden text-black sm:grid sm:place-items-center" style={{ backgroundColor: config.primary_color }} aria-hidden="true">
          <span className="absolute -left-10 top-1/2 h-20 w-20 -translate-y-1/2 rounded-full border-[14px] border-black/10" />
          <RunnerMark className="relative h-14 w-14" />
          <span className="absolute bottom-3 font-mono text-[7px] font-black uppercase tracking-[0.2em]">Privacy lane</span>
        </div>

        <div className="p-5 sm:p-6 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-8">
          <div>
            <div className="flex items-center gap-2 font-mono text-[8px] font-black uppercase tracking-[0.18em]" style={{ color: config.primary_color }}>
              <ShieldCheck className="h-3.5 w-3.5" /> Your browser · your choice
            </div>
            <h2 id="cookie-consent-title" ref={headingRef} tabIndex={-1} className="sport-display mt-2 text-3xl uppercase leading-none tracking-[-0.025em] outline-none sm:text-4xl">
              Set your cookie pace.
            </h2>
            <p id="cookie-consent-description" className="mt-2 max-w-2xl text-[13px] font-medium leading-5 text-white/60">
              Essential cookies keep sign-in and preferences working. Optional cookies are used only after you accept them.
            </p>
            <details className="mt-3 text-[11px] text-white/50">
              <summary className="w-fit cursor-pointer border-b border-white/30 pb-0.5 font-bold text-white/70 outline-none focus-visible:ring-2" style={{ '--tw-ring-color': config.primary_color } as React.CSSProperties}>What is included?</summary>
              <p className="mt-2 max-w-2xl leading-5">Essential: secure sessions and this saved choice. Optional: anonymous public-site usage measurement. We never store passwords or payment details in this preference cookie.</p>
            </details>
          </div>

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row lg:mt-0 lg:min-w-[310px]">
            <button type="button" onClick={() => choose("essential")} className="min-h-11 flex-1 border border-white/25 px-4 text-[10px] font-black uppercase tracking-[0.12em] text-white transition hover:border-white focus:outline-none focus-visible:ring-2" style={{ '--tw-ring-color': config.primary_color } as React.CSSProperties}>
              Essential only
            </button>
            <button type="button" onClick={() => choose("all")} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 px-4 text-[10px] font-black uppercase tracking-[0.12em] text-black transition hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white" style={{ backgroundColor: config.primary_color }}>
              Accept all <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
