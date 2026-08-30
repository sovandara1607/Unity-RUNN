import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Clock3,
  MapPin,
  ShieldCheck,
  Ticket,
  UserRound,
  UsersRound,
} from "lucide-react";
import { SportFooter, SportHeader } from "../../../components/SportHeader";
import { Skeleton } from "../../../components/Skeleton";
import { BakongPayment } from "../../../components/BakongPayment";
import { AlertBanner } from "../../../components/alerts/AlertSystem";
import { useSiteConfig } from "../../../components/site/SiteConfigProvider";
import { api } from "../../../lib/api";
import { withMinSkeleton } from "../../../lib/withMinSkeleton";
import type { EventCategory, EventDetail, MeResponse, PaymentCheckout } from "../../../types";
import { formatMoney } from "../../../lib/money";
import { eventMapURL } from "../../../lib/eventLocation";
import { EntryAvailability } from "../../../components/EntryAvailability";
import { useCategoryAvailability } from "../../../lib/useCategoryAvailability";
import { formatRegistrationDeadline, registrationDeadlineClosed } from "../../../lib/registrationDeadline";

const fieldClass = "mt-2 w-full rounded-xl border border-black/15 bg-white px-4 py-3.5 text-[15px] font-medium text-[#111] outline-none transition placeholder:text-black/30 hover:border-black/30 focus:border-black focus:ring-4 focus:ring-black/5";

function formatDate(value?: string | null) {
  if (!value) return "Date to be confirmed";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).format(new Date(value));
}

function formatTime(value?: string | null) {
  if (!value) return "Time to be confirmed";
  return value.includes("T") ? value.slice(11, 16) : value.slice(0, 5);
}

export default function EventRegisterPage() {
  const { config } = useSiteConfig();
  const acid = config.primary_color;
  const router = useRouter();
  const { slug } = useParams() || {};
  const searchParams = useSearchParams();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
	const [payment, setPayment] = useState<PaymentCheckout | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    phone: "",
    gender: "OTHER",
    emergency_contact_name: "",
    emergency_contact_phone: "",
    tshirt_size: "M",
    date_of_birth: "",
  });

  useEffect(() => {
    async function loadEvent() {
      if (!slug || typeof slug !== "string") return;
      try {
        setLoading(true);
        const [detail, me] = await withMinSkeleton(() => Promise.all([
          api.getEvent(slug),
          api.getMe({ allowUnauthenticated: true }).catch(() => null),
        ]));

        if (!me) {
          const category = searchParams?.get("category");
          const returnPath = `/events/${slug}/register${category ? `?category=${encodeURIComponent(category)}` : ""}`;
          router.replace(`/auth/login?redirect=${encodeURIComponent(returnPath)}`);
          return;
        }

        setEvent(detail);
        setUser(me);
        setFormData((current) => ({
          ...current,
          full_name: current.full_name || me.profile?.full_name || me.name || "",
          email: current.email || me.email || "",
          phone: current.phone || me.profile?.phone || "",
          gender: me.profile?.gender || current.gender,
          date_of_birth: current.date_of_birth || me.profile?.date_of_birth?.slice(0, 10) || "",
          emergency_contact_name: current.emergency_contact_name || me.profile?.emergency_contact_name || "",
          emergency_contact_phone: current.emergency_contact_phone || me.profile?.emergency_contact_phone || "",
          tshirt_size: me.profile?.tshirt_size || current.tshirt_size,
        }));

        const preselected = searchParams?.get("category");
        if (preselected && detail.categories?.some((category) => category.id === preselected && category.status === "OPEN" && !registrationDeadlineClosed(category.registration_deadline))) {
          setSelectedCategory(preselected);
        }
      } catch (caught: unknown) {
        setError(caught instanceof Error ? caught.message : "Failed to load event");
      } finally {
        setLoading(false);
      }
    }

    loadEvent();
    // Navigation wrappers are intentionally excluded to avoid repeated API loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const openCategories = useMemo(
    () => event?.categories?.filter((category) => category.status === "OPEN") || [],
    [event]
  );
  const { availability, refresh: refreshAvailability } = useCategoryAvailability(event?.id, openCategories.filter((category) => !registrationDeadlineClosed(category.registration_deadline)).map((category) => category.id));
  const category = openCategories.find((item) => item.id === selectedCategory && !registrationDeadlineClosed(item.registration_deadline) && availability[item.id]?.available !== 0) || null;
  const canRegister = event?.status === "REGISTRATION_OPEN" && openCategories.length > 0;
  const allCategoriesUnavailable = openCategories.length > 0 && openCategories.every((item) => registrationDeadlineClosed(item.registration_deadline) || availability[item.id]?.available === 0);

  useEffect(() => {
    const selected = openCategories.find((item) => item.id === selectedCategory);
    if (selectedCategory && (!selected || registrationDeadlineClosed(selected.registration_deadline) || availability[selectedCategory]?.available === 0)) setSelectedCategory("");
  }, [availability, openCategories, selectedCategory]);

  const handleInputChange = (field: keyof typeof formData, value: string) => {
    setFormData((current) => ({ ...current, [field]: value }));
    if (regError) setRegError(null);
  };

  const validateForm = () => {
    const required: Array<keyof typeof formData> = [
      "full_name", "email", "phone", "date_of_birth", "emergency_contact_name", "emergency_contact_phone",
    ];
    const labels: Partial<Record<keyof typeof formData, string>> = {
      full_name: "your full name",
      email: "your email address",
      phone: "your phone number",
      date_of_birth: "your date of birth",
      emergency_contact_name: "an emergency contact name",
      emergency_contact_phone: "an emergency contact phone number",
    };
    for (const field of required) {
      if (!formData[field].trim()) return `Add ${labels[field]} to continue.`;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      return "Enter a valid email address to continue.";
    }
    return null;
  };

  const handleRegister = async () => {
    if (!event || !selectedCategory) {
      setRegError("Choose an entry category to continue.");
      return;
    }
    const validationError = validateForm();
    if (validationError) {
      setRegError(validationError);
      return;
    }

    setRegError(null);
    setRegistering(true);
    try {
		const result = await api.registerForEvent(event.id, {
        event_category_id: selectedCategory,
        full_name: formData.full_name,
        email: formData.email,
        phone: formData.phone,
        gender: formData.gender,
        date_of_birth: formData.date_of_birth,
        emergency_contact_name: formData.emergency_contact_name,
        emergency_contact_phone: formData.emergency_contact_phone,
        tshirt_size: formData.tshirt_size,
      });
		if (result.payment?.status === "PENDING") {
			setPayment(result.payment);
			if (typeof window !== "undefined") localStorage.setItem("unity_pending_payment", result.registration.id);
			return;
		}
		router.push("/dashboard?registration=confirmed");
    } catch (caught: unknown) {
      setRegError(caught instanceof Error ? caught.message : "Registration could not be completed.");
      if (typeof caught === "object" && caught && "code" in caught && caught.code === "capacity_full") void refreshAvailability();
    } finally {
      setRegistering(false);
    }
  };

  if (loading) return <RegisterSkeleton />;
  if (error || !event) return <RegisterUnavailable message={error} />;

  return (
    <div className="min-h-screen bg-[#efefe9] text-[#111]">
		{payment && <BakongPayment checkout={payment} eventName={event.name} onPaid={() => {
			if (typeof window !== "undefined") localStorage.removeItem("unity_pending_payment");
			router.push("/dashboard?payment=confirmed");
		}} onClose={() => setPayment(null)} />}
      <div className="text-white" style={{ backgroundColor: config.background_color }}>
        <SportHeader active="events" accountHref="/dashboard" accountLabel="Account" />
        <section className="relative overflow-hidden border-b border-white/10">
          <div className="topo-surface absolute inset-0 opacity-80" />
          <div className="relative mx-auto max-w-[1320px] px-5 pb-12 pt-8 sm:px-8 sm:pb-16 sm:pt-11">
            <Link href={`/events/${event.slug}`} className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/55 transition hover:text-white">
              <ArrowLeft className="h-3.5 w-3.5" /> Event details
            </Link>

            <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.42fr)] lg:items-end">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: acid }}>Registration open · Build your race entry</p>
                <h1 className="sport-display mt-4 max-w-4xl text-[15vw] uppercase leading-[0.82] tracking-[-0.045em] sm:text-[88px] lg:text-[108px]">Claim your start line.</h1>
              </div>
              <div className="border-l border-white/20 pl-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">You’re entering</p>
                <p className="mt-2 text-xl font-bold leading-tight text-white">{event.name}</p>
                <p className="mt-3 text-xs leading-5 text-white/55">Confirm the entry, runner details, and safety contact below. Your QR ticket appears in your race wallet after registration.</p>
              </div>
            </div>

            <div className="mt-10 grid gap-4 border-t border-white/10 pt-6 text-sm sm:grid-cols-3">
              <EventFact icon={<CalendarDays />} label="Race day" value={formatDate(event.event_date)} />
              <EventFact icon={<Clock3 />} label="Start" value={formatTime(event.start_time)} />
              <EventFact icon={<MapPin />} label="Meet" value={event.location || "Location to be confirmed"} href={event.location ? eventMapURL(event) : undefined} />
            </div>
          </div>
        </section>
      </div>

      {!canRegister ? <RegistrationClosed event={event} /> : (
        <main className="mx-auto grid max-w-[1320px] gap-10 px-5 py-10 sm:px-8 sm:py-16 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-16">
          <form id="event-registration-form" onSubmit={(formEvent) => { formEvent.preventDefault(); handleRegister(); }} className="min-w-0">
            <fieldset className="border-b border-black/15 pb-12">
              <StepHeading number="01" icon={<Ticket className="h-4 w-4" />} title="Choose your entry" description="Select the distance and entry fee you want attached to your bib." />
              {allCategoriesUnavailable && <AlertBanner tone="warning" title="No category is accepting entries" className="mt-6">Each distance is either full or past its category cutoff. Choose another event or check back if the organizer reopens an entry.</AlertBanner>}
              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                {openCategories.map((item: EventCategory) => {
                  const selected = item.id === selectedCategory;
                  const itemAvailability = availability[item.id];
                  const full = itemAvailability?.available === 0;
                  const deadlineClosed = registrationDeadlineClosed(item.registration_deadline);
                  const unavailable = full || deadlineClosed;
                  return (
                    <button key={item.id} type="button" disabled={unavailable} aria-pressed={selected} onClick={() => { setSelectedCategory(item.id); setRegError(null); }} style={selected ? { backgroundColor: acid } : undefined} className={`group relative overflow-hidden rounded-2xl border p-5 text-left transition focus:outline-none focus:ring-4 focus:ring-black/10 disabled:cursor-not-allowed disabled:opacity-55 ${selected ? "border-black shadow-[5px_5px_0_#111]" : "border-black/15 bg-white hover:border-black/40 disabled:hover:border-black/15"}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-black/45">Distance</p>
                          <p className="sport-display mt-1 text-4xl uppercase leading-none tracking-[-0.03em]">{item.distance}</p>
                          <span className="mt-2 block"><EntryAvailability availability={itemAvailability} appearance="light" registrationDeadline={item.registration_deadline} /></span>
                          {item.registration_deadline && <span className="mt-2 block font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-black/35">{deadlineClosed ? "Category cutoff passed" : `Closes ${formatRegistrationDeadline(item.registration_deadline)}`}</span>}
                        </div>
                        <span style={selected ? { color: acid } : undefined} className={`flex h-7 w-7 items-center justify-center rounded-full border ${selected ? "border-black bg-black" : "border-black/15 text-transparent"}`}><Check className="h-4 w-4" /></span>
                      </div>
                      <div className="mt-7 flex items-end justify-between gap-4 border-t border-black/15 pt-4">
                        <p className="font-bold">{item.name}</p>
                        <p className="font-mono text-sm font-bold">{formatMoney(item.price_cents, item.currency)}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="border-b border-black/15 py-12">
              <StepHeading number="02" icon={<UserRound className="h-4 w-4" />} title="Runner details" description="These details identify your entry and help the race team contact you." />
              {user && (
                <div className="mt-6 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-black/10 bg-black/[0.035] px-4 py-3 text-xs">
                  <span className="font-semibold">Using your Unity account profile</span>
                  <span className="text-black/50">Edit any field for this race</span>
                </div>
              )}
              <div className="mt-7 grid gap-5 sm:grid-cols-2">
                <Field label="Full name" htmlFor="full-name" required><input id="full-name" autoComplete="name" required value={formData.full_name} onChange={(e) => handleInputChange("full_name", e.target.value)} placeholder="Name shown on your bib" className={fieldClass} /></Field>
                <Field label="Email" htmlFor="email" required><input id="email" type="email" autoComplete="email" required value={formData.email} onChange={(e) => handleInputChange("email", e.target.value)} placeholder="runner@example.com" className={fieldClass} /></Field>
                <Field label="Phone" htmlFor="phone" required hint="Include country code"><input id="phone" type="tel" autoComplete="tel" required value={formData.phone} onChange={(e) => handleInputChange("phone", e.target.value)} placeholder="+855 12 345 678" className={fieldClass} /></Field>
                <Field label="Date of birth" htmlFor="date-of-birth" required><input id="date-of-birth" type="date" autoComplete="bday" required value={formData.date_of_birth} onChange={(e) => handleInputChange("date_of_birth", e.target.value)} className={fieldClass} /></Field>
                <Field label="Gender" htmlFor="gender"><select id="gender" value={formData.gender} onChange={(e) => handleInputChange("gender", e.target.value)} className={fieldClass}><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other / Prefer not to say</option></select></Field>
                <Field label="Race shirt" htmlFor="shirt-size" required hint="Unisex sizing"><select id="shirt-size" value={formData.tshirt_size} onChange={(e) => handleInputChange("tshirt_size", e.target.value)} className={fieldClass}>{["XS", "S", "M", "L", "XL", "XXL"].map((size) => <option key={size} value={size}>{size}</option>)}</select></Field>
              </div>
            </fieldset>

            <fieldset className="pt-12">
              <StepHeading number="03" icon={<UsersRound className="h-4 w-4" />} title="Safety contact" description="Choose someone the race team can reach if you need support on the course." />
              <div className="mt-7 grid gap-5 sm:grid-cols-2">
                <Field label="Contact name" htmlFor="emergency-name" required><input id="emergency-name" autoComplete="off" required value={formData.emergency_contact_name} onChange={(e) => handleInputChange("emergency_contact_name", e.target.value)} placeholder="Emergency contact" className={fieldClass} /></Field>
                <Field label="Contact phone" htmlFor="emergency-phone" required><input id="emergency-phone" type="tel" autoComplete="off" required value={formData.emergency_contact_phone} onChange={(e) => handleInputChange("emergency_contact_phone", e.target.value)} placeholder="+855 98 765 432" className={fieldClass} /></Field>
              </div>
              {regError && <AlertBanner tone="error" title="Registration not completed" className="mt-7" onDismiss={() => setRegError(null)}>{regError}</AlertBanner>}
            </fieldset>
          </form>

          <EntrySummary event={event} category={category} runnerName={formData.full_name} shirtSize={formData.tshirt_size} registering={registering} primary={acid} />
        </main>
      )}

      <div className="text-white" style={{ backgroundColor: config.background_color }}><SportFooter /></div>
    </div>
  );
}

function EventFact({ icon, label, value, href }: { icon: React.ReactElement<{ className?: string }>; label: string; value: string; href?: string }) {
  return <div className="flex items-start gap-3"><span className="mt-0.5 text-white/40">{React.cloneElement(icon, { className: "h-4 w-4" })}</span><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">{label}</p>{href ? <a href={href} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold leading-5 text-white/75 underline decoration-white/25 underline-offset-4 hover:text-white">{value}<span aria-hidden>↗</span></a> : <p className="mt-1 text-xs font-semibold leading-5 text-white/75">{value}</p>}</div></div>;
}

function StepHeading({ number, icon, title, description }: { number: string; icon: React.ReactNode; title: string; description: string }) {
  return <legend className="w-full"><div className="flex items-start gap-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black text-xs font-bold text-white">{number}</span><div><p className="flex items-center gap-2 text-xl font-bold tracking-[-0.02em]">{icon}{title}</p><p className="mt-1 max-w-xl text-sm leading-6 text-black/55">{description}</p></div></div></legend>;
}

function Field({ label, htmlFor, required, hint, children }: { label: string; htmlFor: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return <div><div className="flex items-center justify-between gap-3"><label htmlFor={htmlFor} className="text-[11px] font-bold uppercase tracking-[0.12em] text-black/65">{label}{required && <span aria-hidden> *</span>}</label>{hint && <span className="text-[10px] font-medium text-black/35">{hint}</span>}</div>{children}</div>;
}

function EntrySummary({ event, category, runnerName, shirtSize, registering, primary }: { event: EventDetail; category: EventCategory | null; runnerName: string; shirtSize: string; registering: boolean; primary: string }) {
  return (
    <aside className="lg:sticky lg:top-6">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-black/45">Your race entry</p>
      <div className="relative overflow-hidden rounded-[28px] border-2 border-black bg-white shadow-[8px_8px_0_rgba(17,17,17,0.12)]">
        <div className="bg-[#111] p-6 text-white">
          <div className="flex items-start justify-between gap-5"><p className="text-[10px] font-bold uppercase leading-4 tracking-[0.17em] text-white/50">Unity Runn Club<br />Official Entry</p><span className="rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-black" style={{ backgroundColor: primary }}>Pending</span></div>
          <h2 className="sport-display mt-7 text-4xl uppercase leading-[0.88] tracking-[-0.03em]">{event.name}</h2>
        </div>
        <span aria-hidden className="absolute -left-3 top-[43%] h-6 w-6 rounded-full bg-[#efefe9]" /><span aria-hidden className="absolute -right-3 top-[43%] h-6 w-6 rounded-full bg-[#efefe9]" />
        <div className="border-t-2 border-dashed border-black/20 p-6" style={{ backgroundColor: primary }}>
          {category ? <><p className="text-[10px] font-bold uppercase tracking-[0.17em] text-black/45">Selected entry</p><div className="mt-2 flex items-end justify-between gap-4"><div><p className="sport-display text-5xl uppercase leading-none tracking-[-0.03em]">{category.distance}</p><p className="mt-1 text-sm font-bold">{category.name}</p></div><p className="font-mono text-lg font-bold">{formatMoney(category.price_cents, category.currency)}</p></div></> : <div className="py-4"><p className="font-bold">Choose a category</p><p className="mt-1 text-xs text-black/55">Your distance and entry fee will appear here.</p></div>}
          <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-black/15 pt-5 text-xs"><div><dt className="font-bold uppercase tracking-[0.13em] text-black/40">Runner</dt><dd className="mt-1 truncate font-semibold">{runnerName || "Your name"}</dd></div><div><dt className="font-bold uppercase tracking-[0.13em] text-black/40">Shirt</dt><dd className="mt-1 font-semibold">{shirtSize}</dd></div></dl>
        </div>
        <div className="p-5">
          <button type="submit" form="event-registration-form" disabled={registering || !category} className="flex w-full items-center justify-center gap-2 rounded-full bg-black px-5 py-4 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-40">{registering ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Ticket className="h-4 w-4" />}{registering ? "Claiming your place" : "Claim my place"}</button>
          <p className="mt-4 flex items-start gap-2 text-[10px] font-medium leading-4 text-black/45"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />Your runner and safety details are shared only with the race operations team.</p>
        </div>
      </div>
      <p className="mt-5 text-center text-[10px] font-medium leading-4 text-black/40">By claiming your place, you confirm the information above is accurate and agree to follow the event rules.</p>
    </aside>
  );
}

function RegistrationClosed({ event }: { event: EventDetail }) {
  const message = event.status === "REGISTRATION_CLOSED" ? "Registration has closed for this event." : event.status === "PUBLISHED" ? "Registration is not open yet. Check the event page for updates." : "This event is not currently accepting entries.";
  return <main className="mx-auto max-w-2xl px-5 py-24 text-center sm:px-8"><Ticket className="mx-auto h-10 w-10 text-black/25" /><h2 className="sport-display mt-5 text-5xl uppercase tracking-[-0.04em]">Start line unavailable.</h2><p className="mx-auto mt-4 max-w-md text-sm leading-6 text-black/55">{message}</p><Link href="/events" className="mt-8 inline-flex rounded-full bg-black px-6 py-3 text-xs font-bold uppercase tracking-[0.1em] text-white">Browse other events</Link></main>;
}

function RegisterSkeleton() {
  const { config } = useSiteConfig();
  return <div className="min-h-screen bg-[#efefe9]"><div className="text-white" style={{ backgroundColor: config.background_color }}><SportHeader active="events" /><div className="mx-auto max-w-[1320px] px-5 py-14 sm:px-8"><Skeleton className="h-3 w-32" /><Skeleton className="mt-8 h-24 max-w-3xl rounded-2xl" /><div className="mt-10 grid gap-4 sm:grid-cols-3">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-12 rounded-lg" />)}</div></div></div><div className="mx-auto grid max-w-[1320px] gap-12 px-5 py-14 sm:px-8 lg:grid-cols-[1fr_380px]"><div className="space-y-10">{[0, 1, 2].map((item) => <Skeleton key={item} tone="light" className="h-52 rounded-2xl" />)}</div><Skeleton tone="light" className="h-[520px] rounded-[28px]" /></div></div>;
}

function RegisterUnavailable({ message }: { message?: string | null }) {
  const { config } = useSiteConfig();
  return <div className="flex min-h-screen flex-col text-white" style={{ backgroundColor: config.background_color }}><SportHeader active="events" /><main className="mx-auto flex w-full max-w-6xl flex-1 items-center px-5 sm:px-8"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-white/40">Registration unavailable</p><h1 className="sport-display mt-3 text-6xl uppercase tracking-[-0.045em]">This entry isn’t ready.</h1><p className="mt-4 max-w-md text-sm leading-6 text-white/55">{message || "The event could not be loaded. Return to the event list and choose another run."}</p><Link href="/events" className="mt-8 inline-flex items-center gap-2 text-sm font-semibold" style={{ color: config.primary_color }}><ArrowLeft className="h-4 w-4" /> Back to events</Link></div></main><SportFooter /></div>;
}
