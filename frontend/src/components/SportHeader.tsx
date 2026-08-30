import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { ArrowUpRight, Gauge, Menu, UserRound, X } from "lucide-react";
import { api, resolveApiAssetUrl } from "../lib/api";
import { useSiteConfig } from "./site/SiteConfigProvider";
import { AnnouncementStrip } from "./site/AnnouncementStrip";
import { openCookiePreferences } from "../lib/cookieConsent";

type SportHeaderProps = {
  active?: "home" | "events" | "about" | "account" | "control";
  accountHref?: string;
  accountLabel?: string;
};

export function SportHeader({ active, accountHref, accountLabel }: SportHeaderProps) {
  const { config } = useSiteConfig();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
	const [sessionLink, setSessionLink] = useState({ href: accountHref || "/auth/login", label: accountLabel || "Sign in" });

	useEffect(() => {
	  if (accountHref) { setSessionLink({ href: accountHref, label: accountLabel || "Account" }); return; }
	  let activeRequest = true;
	  api.getMe({ allowUnauthenticated: true }).then((user) => {
		if (!activeRequest) return;
		const staff = ["STAFF", "ADMIN", "SUPER_ADMIN"].includes(user.role);
		setSessionLink({ href: staff ? "/admin" : "/dashboard", label: staff ? "Control" : "Account" });
	  }).catch(() => { if (activeRequest) setSessionLink({ href: "/auth/login", label: "Sign in" }); });
	  return () => { activeRequest = false; };
	}, [accountHref, accountLabel]);

  useEffect(() => {
    const close = () => setMenuOpen(false);
    router.events.on("routeChangeStart", close);
    return () => router.events.off("routeChangeStart", close);
  }, [router.events]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  const accountActive = active === "account" || active === "control";
	const controlLink = sessionLink.label.toLowerCase().includes("control") || active === "control";
	const announcementMessage = `${config.announcement_event_name} — ${config.announcement_text}`;
	const announcementHref = config.announcement_href || (config.announcement_event_slug ? `/events/${config.announcement_event_slug}` : "");

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 text-white backdrop-blur-xl" style={{ backgroundColor: `${config.background_color}f2` }}>
      {config.announcement_enabled && config.announcement_text && config.announcement_event_name && (
        <AnnouncementStrip message={announcementMessage} href={announcementHref} color={config.primary_color} />
      )}
      <div className="mx-auto flex h-[72px] max-w-[1440px] items-center px-4 sm:h-[76px] sm:px-8">
        <Link href="/" className="group flex min-w-0 shrink items-center gap-3" aria-label="Unity Runn Club home">
          <span className="flex h-11 w-11 items-center justify-center overflow-hidden transition-transform group-hover:-rotate-3" style={{ backgroundColor: config.primary_color }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={resolveApiAssetUrl(config.logo_url) || "/Unity-Logos/logo%20UNTR-02.png"} alt="" className="h-full w-full object-cover" />
          </span>
          <span className="min-w-0">
            <span className="block text-[8px] font-black uppercase tracking-[0.25em]" style={{ color: config.primary_color }}>{config.location_label}</span>
            <span className="sport-display mt-0.5 block truncate text-xl uppercase leading-none tracking-[-0.01em]">{config.club_name}</span>
          </span>
        </Link>

        <nav className="ml-auto hidden h-full items-center gap-1 md:flex" aria-label="Primary navigation">
          <PublicNavLink href="/" label="Home" active={active === "home"} primary={config.primary_color} />
          <PublicNavLink href="/events" label="Race calendar" active={active === "events"} primary={config.primary_color} />
          <PublicNavLink href="/about" label="About us" active={active === "about"} primary={config.primary_color} />
          <span className="mx-3 h-5 w-px bg-white/15" aria-hidden />
          <Link href={sessionLink.href} style={accountActive ? { borderColor: config.primary_color, backgroundColor: config.primary_color } : controlLink ? { borderColor: config.accent_color, backgroundColor: config.accent_color } : undefined} className={`group inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.12em] transition ${accountActive ? "text-black" : controlLink ? "text-white" : "border-white/20 text-white hover:border-white"}`}>
            {controlLink ? <Gauge className="h-3.5 w-3.5" /> : <UserRound className="h-3.5 w-3.5" />}
            {sessionLink.label}
          </Link>
          <Link href={config.primary_cta_href} style={{ backgroundColor: config.primary_color }} className="ml-1 inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-black transition hover:-translate-y-0.5">
            {config.primary_cta_label} <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </nav>

        <button type="button" onClick={() => setMenuOpen((open) => !open)} className="ml-auto grid h-11 w-11 place-items-center rounded-full border border-white/20 text-white transition hover:border-white md:hidden" aria-expanded={menuOpen} aria-controls="public-mobile-menu" aria-label={menuOpen ? "Close menu" : "Open menu"}>
          {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>

      <div id="public-mobile-menu" style={{ backgroundColor: config.background_color }} className={`absolute left-0 right-0 top-full overflow-hidden border-t border-white/10 transition-[height,opacity] duration-300 md:hidden ${menuOpen ? "h-[calc(100dvh-100%)] opacity-100" : "pointer-events-none h-0 opacity-0"}`}>
        <div className="topo-surface flex h-full flex-col overflow-y-auto px-4 py-5 sm:px-5 sm:py-6">
          <div className="mx-auto flex min-h-full w-full max-w-xl flex-col">
            <div className="flex items-center justify-between border-b border-white/10 pb-5">
              <div><p className="font-mono text-[8px] font-black uppercase tracking-[0.2em] text-white/35">Club navigation</p><p className="mt-1 text-xs font-bold text-white/70">Choose where you want to run next.</p></div>
              <span className="flex items-center gap-2 font-mono text-[8px] font-black uppercase tracking-[0.15em]" style={{ color: config.primary_color }}><span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ backgroundColor: config.primary_color }} /> Season live</span>
            </div>

            <nav className="py-4" aria-label="Mobile navigation">
              <MobileNavLink href="/" eyebrow="Club home" label="Home base" active={active === "home"} primary={config.primary_color} accent={config.accent_color} />
              <MobileNavLink href="/events" eyebrow="Upcoming runs" label="Race calendar" active={active === "events"} primary={config.primary_color} accent={config.accent_color} />
              <MobileNavLink href="/about" eyebrow="Meet the crew" label="About us" active={active === "about"} primary={config.primary_color} accent={config.accent_color} />
              <MobileNavLink href={sessionLink.href} eyebrow={controlLink ? "Organizer tools" : "Tickets and entries"} label={sessionLink.label} active={accountActive} cobalt={controlLink} primary={config.primary_color} accent={config.accent_color} />
            </nav>

            <Link href={config.primary_cta_href} style={{ backgroundColor: config.primary_color }} className="flex items-center justify-between rounded-2xl p-5 text-black">
              <span><span className="block font-mono text-[8px] font-black uppercase tracking-[0.18em] text-black/45">Next step</span><span className="sport-display mt-1 block text-3xl uppercase leading-none">Find your start line</span></span>
              <span className="grid h-11 w-11 place-items-center rounded-full bg-black" style={{ color: config.primary_color }}><ArrowUpRight className="h-5 w-5" /></span>
            </Link>

            <p className="mt-auto border-t border-white/10 pb-[max(0px,env(safe-area-inset-bottom))] pt-5 font-mono text-[8px] font-bold uppercase tracking-[0.16em] text-white/25">{config.footer_text}</p>
          </div>
        </div>
      </div>
    </header>
  );
}

function PublicNavLink({ href, label, active, primary }: { href: string; label: string; active?: boolean; primary: string }) {
  return <Link href={href} className={`group relative flex h-full items-center px-4 text-[10px] font-black uppercase tracking-[0.14em] transition ${active ? "text-white" : "text-white/50 hover:text-white"}`}><span>{label}</span><span style={active ? { backgroundColor: primary } : undefined} className={`absolute inset-x-4 bottom-0 h-1 origin-left transition ${active ? "" : "scale-x-0 bg-white group-hover:scale-x-100"}`} /></Link>;
}

function MobileNavLink({ href, eyebrow, label, active, cobalt, primary, accent }: { href: string; eyebrow: string; label: string; active?: boolean; cobalt?: boolean; primary: string; accent: string }) {
  return <Link href={href} style={active ? { color: primary } : undefined} className={`group flex items-center justify-between border-b border-white/10 py-5 ${active ? "" : "text-white"}`}><span><span className="block font-mono text-[8px] font-black uppercase tracking-[0.17em] text-white/30">{eyebrow}</span><span className="sport-display mt-1 block text-4xl uppercase leading-none tracking-[-0.02em]">{label}</span></span><span style={cobalt ? { borderColor: accent, backgroundColor: accent } : active ? { borderColor: primary, color: primary } : undefined} className={`grid h-9 w-9 place-items-center rounded-full border transition group-hover:translate-x-1 ${!cobalt && !active ? "border-white/20 text-white/50" : ""}`}><ArrowUpRight className="h-4 w-4" /></span></Link>;
}

export function SportFooter() {
  const { config } = useSiteConfig();
  return <footer className="border-t border-white/10 px-5 py-7 text-[10px] font-bold uppercase tracking-[0.16em] text-white/35"><div className="mx-auto flex max-w-[1200px] flex-col items-center justify-between gap-3 sm:flex-row"><span>{config.footer_text}</span><button type="button" onClick={openCookiePreferences} className="border-b border-white/25 pb-0.5 transition hover:border-white hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white">Cookie settings</button></div></footer>;
}
