import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { resolveApiAssetUrl } from "../../lib/api";
import { useSiteConfig } from "../site/SiteConfigProvider";

interface AuthFrameProps {
  mode: "login" | "register";
  title: ReactNode;
  children: ReactNode;
}

function RunnerCourse({ ink, signal, animated }: { ink: string; signal: string; animated: boolean }) {
  return (
    <svg viewBox="0 0 760 650" className="absolute inset-0 h-full w-full" aria-hidden="true">
      <g fill="none" stroke={ink} strokeWidth="2" opacity="0.22">
        <path d="M-90 605C55 390 176 303 322 308c151 5 235 126 420 86 119-26 163-107 202-205" />
        <path d="M-122 554C36 323 174 235 333 245c158 10 225 125 397 84 99-24 145-89 181-174" />
        <path d="M-153 502C13 259 166 170 343 181c161 11 220 121 376 85 81-19 130-70 169-142" />
      </g>

      {animated && (
        <g aria-hidden="true">
          <g fill="none" stroke={ink} strokeLinecap="round" opacity="0.18">
            <path className="auth-slipstream auth-slipstream--one" d="M-80 228C142 173 328 205 478 230c127 21 229 7 360-66" strokeWidth="2" strokeDasharray="3 13" />
            <path className="auth-slipstream auth-slipstream--two" d="M-100 304C115 252 317 273 489 304c129 23 233 12 366-56" strokeWidth="2" strokeDasharray="3 14" />
            <path className="auth-slipstream auth-slipstream--three" d="M-90 381C128 329 315 346 485 376c135 24 243 16 370-44" strokeWidth="2" strokeDasharray="3 15" />
          </g>

          <g fill={ink} fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontSize="13" fontWeight="800" letterSpacing="3">
            <text className="auth-current-code auth-current-code--one" x="38" y="209">.... &gt;&gt;&gt;</text>
            <text className="auth-current-code auth-current-code--two" x="548" y="211">&gt;&gt; ....</text>
            <text className="auth-current-code auth-current-code--three" x="70" y="362">.. &gt;&gt;&gt; ..</text>
            <text className="auth-current-code auth-current-code--four" x="565" y="342">.... &gt;&gt;</text>
          </g>
        </g>
      )}

      <g fill={signal} opacity="0.9">
        {Array.from({ length: 7 }).map((_, row) =>
          Array.from({ length: 11 }).map((__, column) => {
            const hidden = (row + column * 2) % 5 === 0 || (row * 3 + column) % 11 === 0;
            return hidden ? null : <rect key={`${row}-${column}`} x={510 + column * 18} y={82 + row * 18} width="7" height="7" />;
          }),
        )}
      </g>

      <g transform="translate(235 120) scale(13.5)" fill={ink}>
        <path d="M13.49 5.48a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm-3.6 13.42 1-4.4 2.1 2v6h2V15l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.5 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 7.8v4.7h2V9.1l1.8-.7-1.6 8.1-4.9-1-.4 2 7 1.4Z" />
      </g>

      {animated && (
        <text className="auth-current-code auth-current-code--signal" x="282" y="292" fill={signal} fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontSize="14" fontWeight="900" letterSpacing="4">... &gt;&gt;&gt; ...</text>
      )}

      <circle cx="68" cy="130" r="7" fill={ink} />
      <path d="M88 130h74" stroke={ink} strokeWidth="2" opacity="0.55" />
    </svg>
  );
}

export function AuthFrame({ mode, title, children }: AuthFrameProps) {
  const { config } = useSiteConfig();
  const alternate = mode === "login"
    ? { href: "/auth/register", label: "Create account" }
    : { href: "/auth/login", label: "Sign in" };
  const panelTitle = mode === "login" ? "BACK ON PACE." : "RUN WITH US.";
  const logoSource = resolveApiAssetUrl(config.logo_url) || "/Unity-Logos/logo%20UNTR-02.png";

  return (
    <main className="auth-shell min-h-screen bg-[#f3f3ef] text-[#111] lg:grid lg:grid-cols-2">
      <section className="flex min-h-screen min-w-0 flex-col">
        <header className="flex h-[76px] shrink-0 items-center justify-between border-b border-black/10 px-5 sm:px-8 lg:border-b-0 lg:px-10 xl:px-14">
          <Link href="/" className="inline-flex min-w-0 items-center gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3155ff]" aria-label={`${config.club_name} home`}>
            <span className="h-10 w-10 shrink-0 overflow-hidden bg-[#d9ff00]">
              {/* Configured logos can come from either the API or object storage. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoSource} alt="" className="h-full w-full object-cover" />
            </span>
            <span className="hidden truncate text-[11px] font-black uppercase tracking-[0.12em] min-[380px]:inline">{config.club_name}</span>
          </Link>

          <nav className="flex items-center gap-2" aria-label="Authentication links">
            <Link href="/events" className="hidden px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-black/45 transition hover:text-black focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3155ff] sm:inline-flex">
              Races
            </Link>
            <Link href={alternate.href} className="inline-flex h-10 items-center gap-2 border border-black/15 bg-white px-4 text-[10px] font-black uppercase tracking-[0.1em] transition hover:border-black hover:bg-[#111] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3155ff]">
              {alternate.label}
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </nav>
        </header>

        <div className="flex flex-1 items-center px-5 py-10 sm:px-8 sm:py-14 lg:px-10 xl:px-14">
          <div className="mx-auto w-full max-w-[420px]">
            <span className="block h-1 w-10" style={{ backgroundColor: config.primary_color }} aria-hidden="true" />
            <h1 className="sport-display mt-5 text-[clamp(50px,8vw,68px)] uppercase leading-[0.86] tracking-[-0.035em]">{title}</h1>
            <div className="mt-8">{children}</div>
          </div>
        </div>
      </section>

      <aside className="relative hidden min-h-screen overflow-hidden lg:flex lg:flex-col" style={{ backgroundColor: config.accent_color, color: config.background_color }}>
        <RunnerCourse ink={config.background_color} signal={config.primary_color} animated={mode === "login"} />
        <div className="relative z-10 flex items-center justify-between px-10 py-8 xl:px-14">
          <span className="text-[10px] font-black uppercase tracking-[0.18em]">{config.location_label}</span>
          <span className="border border-current/25 px-3 py-2 text-[9px] font-black uppercase tracking-[0.16em]">Race day ready</span>
        </div>

        <div className="relative z-10 mt-auto max-w-[620px] px-10 pb-12 xl:px-14 xl:pb-16">
          <p className="mb-4 text-[10px] font-black uppercase tracking-[0.18em] opacity-60">{config.club_name}</p>
          <h2 className="sport-display text-[clamp(78px,8vw,132px)] uppercase leading-[0.78] tracking-[-0.045em]">{panelTitle}</h2>
          <span className="mt-8 block h-1.5 w-24" style={{ backgroundColor: config.primary_color }} aria-hidden="true" />
        </div>
      </aside>
    </main>
  );
}
