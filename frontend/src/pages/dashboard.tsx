import React, { useMemo, useRef, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { ArrowRight, ArrowUpRight, CalendarDays, Download, LogOut, QrCode, Shield, Ticket } from "lucide-react";
import QRCode from "qrcode";
import { api } from "../lib/api";
import { withMinSkeleton } from "../lib/withMinSkeleton";
import { SportHeader, SportFooter } from "../components/SportHeader";
import { Skeleton } from "../components/Skeleton";
import { BakongPayment } from "../components/BakongPayment";
import { AlertBanner } from "../components/alerts/AlertSystem";
import { useSiteConfig } from "../components/site/SiteConfigProvider";
import type { Event, MeResponse, PaymentCheckout, Registration } from "../types";

const statusStyles: Record<string, string> = {
  CONFIRMED: "text-black",
  PENDING: "text-amber-300 border-amber-300/30",
  CANCELLED: "text-white/40 border-white/15",
  REFUNDED: "text-white/40 border-white/15",
};

function formatDate(value?: string | null) {
  if (!value) return "Date TBD";
  return new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" }).format(new Date(value));
}

function statusLabel(registration: Registration) {
  if (registration.checked_in_at) return "Checked in";
  if (registration.status === "PENDING") return "Payment due";
  if (registration.status === "CONFIRMED") return "Confirmed";
  if (registration.status === "CANCELLED") return "Cancelled";
  return "Refunded";
}

export default function DashboardPage() {
  const { config } = useSiteConfig();
  const acid = config.primary_color;
  const [user, setUser] = useState<MeResponse | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const [qrByRegId, setQrByRegId] = useState<Record<string, string>>({});
  const [qrLoadingId, setQrLoadingId] = useState<string | null>(null);
  const [ticketDownloadingId, setTicketDownloadingId] = useState<string | null>(null);
	const [payment, setPayment] = useState<PaymentCheckout | null>(null);
	const [paymentEventName, setPaymentEventName] = useState("Your race entry");
	const [paymentLoadingId, setPaymentLoadingId] = useState<string | null>(null);
  const ticketRefs = useRef<Record<string, HTMLElement | null>>({});
  const router = useRouter();

  useEffect(() => {
    async function load() {
      try {
        const me = await withMinSkeleton(() => api.getMe().catch(() => null));
        if (!me) {
          router.push("/auth/login?redirect=/dashboard");
          return;
        }
        setUser(me);
        const [regs, evts] = await withMinSkeleton(() => Promise.all([
          api.listMyRegistrations(),
          api.listEvents({ limit: 50 }),
        ]));
        setRegistrations(regs || []);
        setEvents(evts.events || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load your races");
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const eventById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  // Put unfinished payment first; otherwise show the nearest confirmed race.
  // This keeps the one action that can block a runner from receiving a ticket
  // in the most visible place on the page.
  const featuredRegistration = useMemo(() => {
    const active = registrations.filter((registration) => registration.status === "PENDING" || registration.status === "CONFIRMED");
    const dated = active
      .map((r) => ({ reg: r, event: eventById.get(r.event_id) }))
      .filter((x): x is { reg: Registration; event: Event } => !!x.event?.event_date)
      .sort((a, b) => +new Date(a.event.event_date) - +new Date(b.event.event_date));
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const pending = dated.find((entry) => entry.reg.status === "PENDING");
    const upcoming = dated.find((entry) => entry.reg.status === "CONFIRMED" && new Date(entry.event.event_date) >= startOfToday);
    const confirmed = dated.filter((entry) => entry.reg.status === "CONFIRMED");
    return pending?.reg ?? upcoming?.reg ?? confirmed.at(-1)?.reg ?? active[0] ?? registrations[0] ?? null;
  }, [registrations, eventById]);

  const others = useMemo(() => registrations
    .filter((registration) => registration.id !== featuredRegistration?.id)
    .sort((a, b) => {
      const rank = (status: Registration["status"]) => status === "PENDING" ? 0 : status === "CONFIRMED" ? 1 : 2;
      const statusDifference = rank(a.status) - rank(b.status);
      if (statusDifference !== 0) return statusDifference;
      const aDate = eventById.get(a.event_id)?.event_date || a.created_at;
      const bDate = eventById.get(b.event_id)?.event_date || b.created_at;
      return +new Date(aDate) - +new Date(bDate);
    }), [registrations, featuredRegistration, eventById]);

  const handleLogout = async () => {
    await api.logout();
    router.push("/auth/login");
  };

	const resumePayment = async (reg: Registration) => {
		setPaymentLoadingId(reg.id);
		setError(null);
		try {
			const checkout = await api.getRegistrationPayment(reg.id);
			setPaymentEventName(eventById.get(reg.event_id)?.name || "Your race entry");
			setPayment(checkout);
		} catch (caught: unknown) {
			setError(caught instanceof Error ? caught.message : "Could not reopen this payment");
		} finally { setPaymentLoadingId(null); }
	};

	const finishPayment = async () => {
		if (typeof window !== "undefined") localStorage.removeItem("unity_pending_payment");
		setPayment(null);
		const regs = await api.listMyRegistrations().catch(() => null);
		if (regs) setRegistrations(regs);
	};

  const toggleQr = async (reg: Registration) => {
    if (openTicketId === reg.id) {
      setOpenTicketId(null);
      return;
    }
    setOpenTicketId(reg.id);
    setQrLoadingId(reg.id);
    try {
      // Registration numbers are stable, staff-authenticated check-in codes.
      // They keep working across screenshots/devices and remain safe because
      // only STAFF+ can submit a check-in and the DB permits it exactly once.
      // Keep the QR inline as SVG. DOM-to-image exporters can clone an <img>
      // before its data-URL pixels finish decoding, producing a blank white
      // square. Inline SVG has no separate loading lifecycle, so the on-screen
      // code and downloaded ticket always contain the same QR geometry.
      const qrSvg = await QRCode.toString(reg.registration_number, {
        type: "svg",
        width: 480,
        margin: 2,
        errorCorrectionLevel: "H",
      });
      setQrByRegId((prev) => ({ ...prev, [reg.id]: qrSvg }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this ticket");
      setOpenTicketId(null);
    } finally {
      setQrLoadingId(null);
    }
  };

  const downloadTicket = async (reg: Registration) => {
    const ticket = ticketRefs.current[reg.id];
    if (!ticket || !qrByRegId[reg.id] || ticketDownloadingId) return;

    setTicketDownloadingId(reg.id);
    setError(null);
    try {
      // Fonts must be settled before cloning the node, otherwise the exported
      // event title can use fallback metrics and wrap differently from screen.
      await document.fonts?.ready;
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(ticket, {
        cacheBust: true,
        pixelRatio: Math.min(3, Math.max(2, window.devicePixelRatio || 1)),
        style: { boxShadow: "none" },
        filter: (node) =>
          !(node instanceof HTMLElement && node.dataset.ticketExportHide === "true"),
      });

      const event = eventById.get(reg.event_id);
      const fileBase = `${event?.slug || "unity-run"}-${reg.registration_number || "ticket"}`
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "");
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `${fileBase || "unity-run-ticket"}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (caught: unknown) {
      const message = caught instanceof Error ? caught.message : "Unknown export error";
      setError(`Could not save the full ticket: ${message}`);
    } finally {
      setTicketDownloadingId(null);
    }
  };

  const isStaffOrAdmin = user && ["STAFF", "ADMIN", "SUPER_ADMIN"].includes(user.role);

  if (loading) {
    return (
      <div className="min-h-screen text-white" style={{ backgroundColor: config.background_color }}>
        <SportHeader active="account" accountHref="/dashboard" accountLabel="Account" />
        <section className="border-b border-white/10">
          <div className="mx-auto max-w-[1200px] px-5 py-10 sm:px-8 sm:py-12">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-4 h-14 w-64 rounded-lg" />
            <div className="mt-5 flex gap-4">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        </section>
        <section className="mx-auto grid max-w-[1200px] gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[minmax(0,1.12fr)_minmax(320px,0.88fr)] lg:gap-10 lg:py-14">
          {/* Next-race ticket placeholder */}
          <div>
            <Skeleton className="h-3 w-16" />
            <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-6 sm:p-8">
              <div className="flex justify-between">
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>
              <Skeleton className="mt-5 h-10 w-3/4 rounded-lg" />
              <div className="mt-6 grid grid-cols-2 gap-4 border-t border-dashed border-white/10 pt-5 sm:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i}>
                    <Skeleton className="h-2.5 w-14" />
                    <Skeleton className="mt-2 h-4 w-20" />
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* Entries list placeholder */}
          <div>
            <Skeleton className="h-3 w-28" />
            <div className="mt-4 space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-[72px] rounded-xl" />
              ))}
            </div>
          </div>
        </section>
      </div>
    );
  }

  const firstName = (user?.name || user?.email || "Runner").split(/[\s@]/)[0];
  const confirmedCount = registrations.filter((registration) => registration.status === "CONFIRMED").length;
  const pendingCount = registrations.filter((registration) => registration.status === "PENDING").length;

  return (
    <div className="min-h-screen text-white" style={{ backgroundColor: config.background_color }}>
		{payment && <BakongPayment checkout={payment} eventName={paymentEventName} onPaid={finishPayment} onClose={() => setPayment(null)} />}
      <SportHeader active="account" accountHref="/dashboard" accountLabel="Account" />

      <main>
        <section className="border-b border-white/10">
          <div className="mx-auto max-w-[1200px] px-5 py-9 sm:px-8 sm:py-12">
            <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
              <div>
                <p className="font-mono text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: acid }}>Race wallet</p>
                <h1 className="sport-display mt-3 text-5xl uppercase leading-[0.85] tracking-[-0.035em] sm:text-6xl">Hi, {firstName}.</h1>
                <p className="mt-4 text-sm text-white/50">
                  {registrations.length} {registrations.length === 1 ? "entry" : "entries"} · {confirmedCount} confirmed{pendingCount > 0 ? ` · ${pendingCount} awaiting payment` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isStaffOrAdmin && <Link href="/admin" className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-[10px] font-black uppercase tracking-[0.1em] text-black" style={{ backgroundColor: acid }}><Shield className="h-3.5 w-3.5" /> Control</Link>}
                <button onClick={handleLogout} className="inline-flex h-10 items-center gap-2 rounded-full border border-white/15 px-4 text-[10px] font-black uppercase tracking-[0.1em] text-white/60 transition hover:border-white/40 hover:text-white"><LogOut className="h-3.5 w-3.5" /> Log out</button>
              </div>
            </div>

            <nav aria-label="Dashboard" className="mt-8 flex gap-1 overflow-x-auto border-t border-white/10 pt-4">
              {featuredRegistration && <a href="#ticket" className="inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-[0.1em] text-black" style={{ backgroundColor: acid }}><Ticket className="h-3.5 w-3.5" />{featuredRegistration.status === "PENDING" ? "Payment" : featuredRegistration.status === "CONFIRMED" ? "My ticket" : "Latest entry"}</a>}
              {others.length > 0 && <a href="#entries" className="inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-[0.1em] text-white/55 transition hover:bg-white/10 hover:text-white">Other entries</a>}
              <Link href="/events" className="inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-[0.1em] text-white/55 transition hover:bg-white/10 hover:text-white">Find a race <ArrowUpRight className="h-3.5 w-3.5" /></Link>
            </nav>
          </div>
        </section>

        {error && (
          <div className="mx-auto max-w-[1200px] px-5 pt-6 sm:px-8">
            <AlertBanner tone="error" title="Race wallet needs attention" appearance="dark" onDismiss={() => setError(null)}>{error}</AlertBanner>
          </div>
        )}

        {/* Tickets */}
        {registrations.length === 0 ? (
          <section className="mx-auto max-w-[1200px] px-5 py-20 text-center sm:px-8">
            <p className="sport-display text-4xl uppercase leading-none text-white/10 sm:text-6xl">No races yet</p>
            <p className="mx-auto mt-4 max-w-sm text-xs font-bold uppercase leading-5 tracking-[0.14em] text-white/40">
              Sign up for an event and your race ticket appears here.
            </p>
            <Link
              href="/events"
              className="mt-8 inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-bold uppercase tracking-[0.06em] text-black transition hover:opacity-90"
              style={{ backgroundColor: acid }}
            >
              Browse events <ArrowUpRight className="h-4 w-4" />
            </Link>
          </section>
        ) : (
          <section className="mx-auto grid max-w-[1200px] gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[minmax(0,1.12fr)_minmax(320px,0.88fr)] lg:gap-10 lg:py-14">
            {/* Next race — the ticket */}
            {featuredRegistration && (() => {
              const event = eventById.get(featuredRegistration.event_id);
              const isOpen = openTicketId === featuredRegistration.id;
              return (
                <div id="ticket" className="scroll-mt-32">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/45">
                      {featuredRegistration.status === "PENDING" ? "Action needed" : featuredRegistration.status === "CONFIRMED" ? "Next race" : "Latest entry"}
                    </p>
                    {event && <Link href={`/events/${event.slug}`} className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.1em] text-white/45 transition hover:text-white">Race details <ArrowUpRight className="h-3.5 w-3.5" /></Link>}
                  </div>

                  <article
                    ref={(node) => { ticketRefs.current[featuredRegistration.id] = node; }}
                    className="relative mt-4 select-none overflow-hidden rounded-2xl bg-white text-black shadow-[0_24px_80px_-24px_rgba(217,255,0,0.25)]"
                  >
                    {/* punched notches */}
                    <span aria-hidden className="absolute -left-3 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full" style={{ backgroundColor: config.background_color }} />
                    <span aria-hidden className="absolute -right-3 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full" style={{ backgroundColor: config.background_color }} />

                    <div className="p-6 sm:p-8">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/50">
                          Unity Runn Club · Official Entry
                        </span>
                        <span
                          className="rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]"
                          style={featuredRegistration.status === "CONFIRMED"
                            ? { backgroundColor: acid, borderColor: acid }
                            : featuredRegistration.status === "PENDING"
                              ? { backgroundColor: "#fff3cd", borderColor: "#e4bd4f", color: "#725000" }
                              : { backgroundColor: "#eeeeea", borderColor: "#d1d1ca", color: "#666" }}
                        >
                          {statusLabel(featuredRegistration)}
                        </span>
                      </div>

                      <h2 className="sport-display mt-5 uppercase leading-[0.9] tracking-[-0.02em]" style={{ fontSize: "clamp(28px, 4vw, 44px)" }}>
                        {event?.name ?? "Your race"}
                      </h2>

                      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-dashed border-black/15 pt-5 text-xs sm:grid-cols-4">
                        <div>
                          <dt className="font-bold uppercase tracking-[0.14em] text-black/40">Bib no.</dt>
                          <dd className="mt-1 whitespace-nowrap font-mono text-sm font-semibold">{featuredRegistration.registration_number ?? "—"}</dd>
                        </div>
                        <div>
                          <dt className="font-bold uppercase tracking-[0.14em] text-black/40">Date</dt>
                          <dd className="mt-1 font-semibold">{formatDate(event?.event_date)}</dd>
                        </div>
                        <div>
                          <dt className="font-bold uppercase tracking-[0.14em] text-black/40">Runner</dt>
                          <dd className="mt-1 truncate font-semibold">{featuredRegistration.full_name}</dd>
                        </div>
                        <div>
                          <dt className="font-bold uppercase tracking-[0.14em] text-black/40">Tee</dt>
                          <dd className="mt-1 font-semibold">{featuredRegistration.tshirt_size || "—"}</dd>
                        </div>
                      </dl>
                    </div>

                    {/* perforated stub */}
                    <div className="border-t-2 border-dashed border-black/15 p-6 sm:p-8" style={{ backgroundColor: featuredRegistration.status === "CONFIRMED" ? acid : "#f4f4f4" }}>
                      {featuredRegistration.checked_in_at ? (
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-black/65">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black text-[#d9ff00]">✓</span>
                          Checked in {new Date(featuredRegistration.checked_in_at).toLocaleString()}
                        </div>
                      ) : featuredRegistration.status === "PENDING" ? (
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-[0.12em] text-black/70">Finish payment</p>
                            <p className="mt-1 text-[11px] font-medium text-black/50">Your ticket and QR unlock after confirmation.</p>
                          </div>
                          <button onClick={() => resumePayment(featuredRegistration)} disabled={paymentLoadingId === featuredRegistration.id} className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-black px-6 text-[11px] font-bold uppercase tracking-[0.1em] text-white transition hover:opacity-80 disabled:opacity-50">
                            {paymentLoadingId === featuredRegistration.id ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/25 border-t-white" /> : <ArrowRight className="h-4 w-4" />}
                            {paymentLoadingId === featuredRegistration.id ? "Opening" : "Pay now"}
                          </button>
                        </div>
                      ) : featuredRegistration.status !== "CONFIRMED" ? (
                        <p className="text-xs font-bold uppercase tracking-[0.12em] text-black/50">This registration is {statusLabel(featuredRegistration).toLowerCase()}.</p>
                      ) : isOpen ? (
                        <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-6">
                          <div
                            role="img"
                            aria-label={`Check-in QR for ${featuredRegistration.registration_number}`}
                            className="h-36 w-36 rounded-lg bg-white p-2 shadow-sm motion-safe:animate-[qrIn_.35s_ease-out] [&_svg]:block [&_svg]:h-full [&_svg]:w-full"
                            dangerouslySetInnerHTML={{ __html: qrByRegId[featuredRegistration.id] }}
                          />
                          <div className="text-center sm:text-left">
                            <p className="text-xs font-bold uppercase tracking-[0.14em]">Scan at the check-in desk</p>
                            <p className="mt-1 max-w-xs text-[11px] font-medium leading-4 text-black/55">
                              This code stays valid. Save it to your phone or take a screenshot for race day.
                            </p>
                            <div data-ticket-export-hide="true" className="mt-3 flex flex-wrap justify-center gap-4 sm:justify-start">
                              <button
                                onClick={() => downloadTicket(featuredRegistration)}
                                disabled={ticketDownloadingId === featuredRegistration.id}
                                className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.12em] underline underline-offset-4 hover:opacity-70 disabled:opacity-50"
                              >
                                {ticketDownloadingId === featuredRegistration.id ? (
                                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/25 border-t-black" />
                                ) : (
                                  <Download className="h-3.5 w-3.5" />
                                )}
                                {ticketDownloadingId === featuredRegistration.id ? "Saving ticket" : "Save ticket"}
                              </button>
                              <button onClick={() => toggleQr(featuredRegistration)} className="text-[11px] font-bold uppercase tracking-[0.12em] underline underline-offset-4 hover:opacity-70">
                                Hide code
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => toggleQr(featuredRegistration)}
                          disabled={qrLoadingId === featuredRegistration.id}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-black py-3.5 text-xs font-bold uppercase tracking-[0.1em] text-white transition hover:opacity-85 disabled:opacity-60 sm:w-auto sm:px-8"
                        >
                          {qrLoadingId === featuredRegistration.id ? (
                            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                          ) : (
                            <QrCode className="h-4 w-4" />
                          )}
                          Show check-in QR
                        </button>
                      )}
                    </div>
                  </article>
                </div>
              );
            })()}

            {/* Everything else */}
            <div id="entries" className="scroll-mt-32">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/40">
                Other entries {others.length > 0 && `(${others.length})`}
              </p>

              {others.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-dashed border-white/15 p-8 text-center">
                  <p className="text-xs font-bold uppercase leading-5 tracking-[0.14em] text-white/40">
                    One race on the books. Add another?
                  </p>
                  <Link href="/events" className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.12em] transition hover:opacity-80" style={{ color: acid }}>
                    Find events <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              ) : (
                <ul className="mt-4 space-y-3">
                  {others.map((reg) => {
                    const event = eventById.get(reg.event_id);
                    const isOpen = openTicketId === reg.id;
                    const canQr = reg.status === "CONFIRMED" && !reg.checked_in_at;
                    return (
                      <li key={reg.id}>
                        <article
                          ref={(node) => { ticketRefs.current[reg.id] = node; }}
                          className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] transition-colors hover:border-white/20"
                        >
                          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 p-4 sm:p-5">
                            <span
                              className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${statusStyles[reg.status] ?? ""}`}
                              style={reg.status === "CONFIRMED" ? { backgroundColor: acid, borderColor: acid, color: "#000" } : undefined}
                            >
                              {statusLabel(reg)}
                            </span>
                            <div className="min-w-0 flex-1">
                              {event ? <Link href={`/events/${event.slug}`} className="block truncate text-sm font-bold transition hover:text-white/70">{event.name}</Link> : <p className="truncate text-sm font-bold">Registration</p>}
                              <p className="mt-0.5 flex items-center gap-3 text-[11px] font-medium text-white/40">
                                <span className="font-mono">{reg.registration_number ?? reg.id.slice(0, 8)}</span>
                                <span className="inline-flex items-center gap-1">
                                  <CalendarDays className="h-3 w-3" /> {formatDate(event?.event_date)}
                                </span>
                              </p>
                            </div>
                            {canQr && (
                              <button
                                onClick={() => toggleQr(reg)}
                                disabled={qrLoadingId === reg.id}
                                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/20 px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.1em] transition hover:border-white/50 disabled:opacity-60"
                              >
                                {qrLoadingId === reg.id ? (
                                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                                ) : (
                                  <QrCode className="h-3.5 w-3.5" />
                                )}
                                {isOpen ? "Hide" : "QR"}
                              </button>
                            )}
							{reg.status === "PENDING" && (
								<button onClick={() => resumePayment(reg)} disabled={paymentLoadingId === reg.id} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#d9ff00] px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-black transition hover:opacity-85 disabled:opacity-60">
										{paymentLoadingId === reg.id ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-black/20 border-t-black" /> : <ArrowRight className="h-3.5 w-3.5" />} Pay now
								</button>
							)}
                          </div>
                          {isOpen && canQr && qrByRegId[reg.id] && (
                            <div className="flex flex-col items-start gap-4 border-t border-white/10 p-4 sm:flex-row sm:items-center sm:p-5">
                              <div
                                role="img"
                                aria-label={`Check-in QR for ${reg.registration_number}`}
                                className="h-24 w-24 rounded-lg bg-white p-1.5 motion-safe:animate-[qrIn_.35s_ease-out] [&_svg]:block [&_svg]:h-full [&_svg]:w-full"
                                dangerouslySetInnerHTML={{ __html: qrByRegId[reg.id] }}
                              />
                              <p className="max-w-xs text-[11px] font-medium leading-4 text-white/50">
                                Show at the check-in desk. This code stays valid, so screenshots work offline.
                              </p>
                              <button
                                data-ticket-export-hide="true"
                                onClick={() => downloadTicket(reg)}
                                disabled={ticketDownloadingId === reg.id}
                                className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.1em] text-white/70 hover:text-white disabled:opacity-50 sm:ml-auto"
                              >
                                {ticketDownloadingId === reg.id ? (
                                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/25 border-t-white" />
                                ) : (
                                  <Download className="h-3.5 w-3.5" />
                                )}
                                {ticketDownloadingId === reg.id ? "Saving" : "Save ticket"}
                              </button>
                            </div>
                          )}
                        </article>
                      </li>
                    );
                  })}
                </ul>
              )}

              <Link
                href="/events"
                className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/20 px-5 py-3 text-xs font-bold uppercase tracking-[0.08em] transition hover:border-white/50"
              >
                Join another run <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </section>
        )}
      </main>

      <SportFooter />

      <style jsx global>{`
        @keyframes qrIn {
          from { opacity: 0; transform: translateY(6px) scale(0.96); }
          to { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .motion-safe\\:animate-\\[qrIn_\\.35s_ease-out\\] { animation: none; }
        }
      `}</style>
    </div>
  );
}
