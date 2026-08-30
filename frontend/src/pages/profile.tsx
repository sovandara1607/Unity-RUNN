import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  AlertTriangle,
  BellRing,
  Check,
  ChevronRight,
  Clock3,
  ContactRound,
  HeartPulse,
  LockKeyhole,
  Radio,
  Save,
  Send,
  Shirt,
  TicketCheck,
  Unplug,
  UserRound,
} from "lucide-react";
import { AlertBanner, useAlerts } from "../components/alerts/AlertSystem";
import { Skeleton } from "../components/Skeleton";
import { SportFooter, SportHeader } from "../components/SportHeader";
import { useSiteConfig } from "../components/site/SiteConfigProvider";
import { api } from "../lib/api";
import { withMinSkeleton } from "../lib/withMinSkeleton";
import type { MeResponse, Profile, TelegramDelivery, TelegramDeliveryPreferences, TelegramDeliveryStatus } from "../types";

interface ProfileForm {
  full_name: string;
  phone: string;
  date_of_birth: string;
  gender: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  tshirt_size: string;
}

const emptyForm: ProfileForm = {
  full_name: "",
  phone: "",
  date_of_birth: "",
  gender: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  tshirt_size: "",
};

const defaultTelegramPreferences: TelegramDeliveryPreferences = {
  tickets: true,
  reminders: true,
  event_updates: true,
};

const inputClass = "mt-2 h-12 w-full rounded-xl border border-black/15 bg-white px-3.5 text-sm font-semibold text-[#111] outline-none transition placeholder:text-black/25 hover:border-black/30 focus:border-black focus:ring-4 focus:ring-black/5";

const telegramDeliveryLabels: Record<TelegramDelivery["type"], string> = {
  REGISTRATION_CONFIRMATION: "Ticket issued",
  PAYMENT_CONFIRMATION: "Payment confirmed",
  EVENT_REMINDER: "Race reminder",
  EVENT_UPDATE: "Event details changed",
  EVENT_ANNOUNCEMENT: "Organizer announcement",
  CANCELLATION: "Entry cancelled",
};

function formFromProfile(profile?: Profile | null): ProfileForm {
  if (!profile) return emptyForm;
  return {
    full_name: profile.full_name || "",
    phone: profile.phone || "",
    date_of_birth: profile.date_of_birth?.slice(0, 10) || "",
    gender: profile.gender || "",
    emergency_contact_name: profile.emergency_contact_name || "",
    emergency_contact_phone: profile.emergency_contact_phone || "",
    tshirt_size: profile.tshirt_size || "",
  };
}

export default function ProfilePage() {
  const router = useRouter();
  const alerts = useAlerts();
  const { config } = useSiteConfig();
  const [user, setUser] = useState<MeResponse | null>(null);
  const [form, setForm] = useState<ProfileForm>(emptyForm);
  const [savedForm, setSavedForm] = useState<ProfileForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [telegram, setTelegram] = useState<TelegramDeliveryStatus | null>(null);
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [telegramTestBusy, setTelegramTestBusy] = useState(false);
  const [telegramPreferenceBusy, setTelegramPreferenceBusy] = useState<keyof TelegramDeliveryPreferences | null>(null);
  const [telegramLinkExpiresAt, setTelegramLinkExpiresAt] = useState<string | null>(null);
  const [telegramDeliveries, setTelegramDeliveries] = useState<TelegramDelivery[]>([]);

  useEffect(() => {
    let active = true;
    withMinSkeleton(() => Promise.all([
      api.getMe(),
      api.getTelegramDelivery().catch(() => ({ available: false, connected: false, preferences: defaultTelegramPreferences })),
      api.listTelegramDeliveries().catch(() => []),
    ]))
      .then(([me, telegramStatus, deliveries]) => {
        if (!active) return;
        const nextForm = formFromProfile(me.profile);
        setUser(me);
        setForm(nextForm);
        setSavedForm(nextForm);
        setTelegram(telegramStatus);
        setTelegramDeliveries(deliveries);
      })
      .catch((caught) => {
        if (!active) return;
        const status = typeof caught === "object" && caught && "status" in caught ? caught.status : null;
        if (status === 401) {
          router.replace("/auth/login?redirect=/profile");
          return;
        }
        setError(caught instanceof Error ? caught.message : "Could not load your runner details.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [router]);

  useEffect(() => {
    if (!telegramLinkExpiresAt || telegram?.connected) return;
    const expiresAt = new Date(telegramLinkExpiresAt).getTime();
    const poll = window.setInterval(() => {
      if (Date.now() >= expiresAt) {
        window.clearInterval(poll);
        setTelegramLinkExpiresAt(null);
        return;
      }
      api.getTelegramDelivery().then((status) => {
        setTelegram(status);
        if (status.connected) {
          setTelegramLinkExpiresAt(null);
          alerts.notify({ tone: "success", title: "Telegram connected", message: "Race tickets and important updates will now arrive there too." });
          api.listTelegramDeliveries().then(setTelegramDeliveries).catch(() => undefined);
        }
      }).catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(poll);
  }, [alerts, telegram?.connected, telegramLinkExpiresAt]);

  const readiness = useMemo(() => [
    { label: "Identity", ready: Boolean(form.full_name.trim()), icon: UserRound },
    { label: "Contact", ready: Boolean(form.phone.trim()), icon: ContactRound },
    { label: "Birth date", ready: Boolean(form.date_of_birth), icon: ChevronRight },
    { label: "Emergency", ready: Boolean(form.emergency_contact_name.trim() && form.emergency_contact_phone.trim()), icon: HeartPulse },
    { label: "Race shirt", ready: Boolean(form.tshirt_size), icon: Shirt },
  ], [form]);
  const readyCount = readiness.filter((item) => item.ready).length;
  const dirty = JSON.stringify(form) !== JSON.stringify(savedForm);

  const update = (field: keyof ProfileForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.full_name.trim()) {
      setError("Add the full name that should appear on your race entries.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const profile = await api.updateMe({
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        ...(form.date_of_birth ? { date_of_birth: form.date_of_birth } : {}),
        gender: form.gender,
        emergency_contact_name: form.emergency_contact_name.trim(),
        emergency_contact_phone: form.emergency_contact_phone.trim(),
        tshirt_size: form.tshirt_size,
      });
      const nextForm = formFromProfile(profile);
      setForm(nextForm);
      setSavedForm(nextForm);
      setUser((current) => current ? { ...current, profile, name: profile.full_name } : current);
      alerts.notify({ tone: "success", title: "Runner card saved", message: "New race forms will start with these details." });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save your runner details.");
    } finally {
      setSaving(false);
    }
  };

  const connectTelegram = async () => {
    setTelegramBusy(true);
    setError(null);
    try {
      const link = await api.createTelegramLink();
      setTelegramLinkExpiresAt(link.expires_at);
      window.open(link.url, "_blank", "noopener,noreferrer");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start Telegram connection.");
    } finally {
      setTelegramBusy(false);
    }
  };

  const disconnectTelegram = async () => {
    setTelegramBusy(true);
    setError(null);
    try {
      await api.disconnectTelegram();
      setTelegram((current) => ({ available: current?.available ?? true, connected: false, bot_name: current?.bot_name, preferences: current?.preferences ?? defaultTelegramPreferences }));
      setTelegramLinkExpiresAt(null);
      setTelegramDeliveries([]);
      alerts.notify({ tone: "success", title: "Telegram disconnected", message: "Email delivery is still active for every race update." });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not disconnect Telegram.");
    } finally {
      setTelegramBusy(false);
    }
  };

  const updateTelegramPreference = async (key: keyof TelegramDeliveryPreferences) => {
    if (!telegram?.connected || telegramPreferenceBusy) return;
    const previous = telegram.preferences;
    const next = { ...previous, [key]: !previous[key] };
    setTelegram((current) => current ? { ...current, preferences: next } : current);
    setTelegramPreferenceBusy(key);
    setError(null);
    try {
      const status = await api.updateTelegramPreferences(next);
      setTelegram(status);
      alerts.notify({ tone: "success", title: "Delivery choices saved", message: "Your next Telegram update will follow these choices." });
    } catch (caught) {
      setTelegram((current) => current ? { ...current, preferences: previous } : current);
      setError(caught instanceof Error ? caught.message : "Could not save Telegram delivery choices.");
    } finally {
      setTelegramPreferenceBusy(null);
    }
  };

  const sendTelegramTest = async () => {
    setTelegramTestBusy(true);
    setError(null);
    try {
      await api.sendTelegramTest();
      alerts.notify({ tone: "success", title: "Test signal sent", message: "Check your Telegram chat for the Unity Runn Club message." });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Telegram did not accept the test message.");
    } finally {
      setTelegramTestBusy(false);
    }
  };

  if (loading) return <ProfileSkeleton background={config.background_color} />;

  return (
    <div className="public-shell min-h-screen text-white" style={{ backgroundColor: config.background_color }}>
      <Head><title>Runner details · {config.club_name}</title></Head>
      <SportHeader active="account" accountHref="/dashboard" accountLabel="Account" />
      <main>
        <section className="border-b border-white/10">
          <div className="mx-auto max-w-[1200px] px-5 py-8 sm:px-8 sm:py-11">
            <Link href="/dashboard" className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.13em] text-white/45 transition hover:text-white">
              <ArrowLeft className="h-3.5 w-3.5" /> Race wallet
            </Link>
            <div className="mt-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <p className="font-mono text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: config.primary_color }}>Runner card</p>
                <h1 className="sport-display mt-3 text-5xl uppercase leading-[0.82] tracking-[-0.035em] sm:text-6xl">Ready before<br />race day.</h1>
              </div>
              <p className="max-w-sm text-sm font-semibold leading-6 text-white/45">Keep the details organizers need in one place. Your next entry form will start here.</p>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-[1200px] gap-8 px-5 py-9 sm:px-8 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start lg:py-12">
          <aside className="space-y-4 lg:sticky lg:top-[108px]">
            <div className="relative overflow-hidden rounded-[24px] p-6 text-black" style={{ backgroundColor: config.primary_color }}>
              <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full border-[28px] border-black/[0.06]" aria-hidden />
              <p className="relative font-mono text-[9px] font-black uppercase tracking-[0.18em] text-black/45">Race readiness</p>
              <div className="relative mt-5 flex items-end gap-2">
                <span className="sport-display text-8xl leading-[0.68]">{readyCount}</span>
                <span className="mb-0.5 text-xs font-black uppercase tracking-[0.12em] text-black/45">of {readiness.length}<br />details set</span>
              </div>
              <div className="relative mt-7 space-y-1 border-t border-black/15 pt-4">
                {readiness.map(({ label, ready, icon: Icon }) => (
                  <div key={label} className="flex items-center gap-3 py-2">
                    <span className={`grid h-7 w-7 place-items-center rounded-full ${ready ? "bg-black text-white" : "border border-black/20 text-black/35"}`}>
                      {ready ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                    </span>
                    <span className={`text-[10px] font-black uppercase tracking-[0.12em] ${ready ? "text-black" : "text-black/40"}`}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-[20px] border border-white/10 bg-white/[0.045] p-5">
              <p className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.15em] text-white/45"><LockKeyhole className="h-3.5 w-3.5" /> Account email</p>
              <p className="mt-2 break-all text-sm font-bold text-white/85">{user?.email}</p>
              <p className="mt-2 text-[11px] font-semibold leading-5 text-white/35">Your sign-in email stays separate from the contact details printed on entries.</p>
            </div>
          </aside>

          <div>
            {error && <AlertBanner tone="error" title="Runner card needs attention" appearance="dark" className="mb-5" onDismiss={() => setError(null)}>{error}</AlertBanner>}
            <form onSubmit={saveProfile} className="overflow-hidden rounded-[26px] bg-[#f4f3ee] text-[#111] shadow-[0_28px_80px_-45px_rgba(0,0,0,.65)]">
              <FormSection icon={<UserRound className="h-4 w-4" />} eyebrow="01 · Runner" title="Personal details" description="Used to identify your entry and contact you about the race.">
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Full name" htmlFor="profile-full-name" required><input id="profile-full-name" autoComplete="name" required maxLength={200} value={form.full_name} onChange={(event) => update("full_name", event.target.value)} className={inputClass} placeholder="Name shown on your bib" /></Field>
                  <Field label="Phone" htmlFor="profile-phone"><input id="profile-phone" type="tel" autoComplete="tel" maxLength={30} value={form.phone} onChange={(event) => update("phone", event.target.value)} className={inputClass} placeholder="+855 12 345 678" /></Field>
                  <Field label="Date of birth" htmlFor="profile-date-of-birth"><input id="profile-date-of-birth" type="date" autoComplete="bday" max={new Date().toISOString().slice(0, 10)} value={form.date_of_birth} onChange={(event) => update("date_of_birth", event.target.value)} className={inputClass} /></Field>
                  <Field label="Gender" htmlFor="profile-gender"><select id="profile-gender" value={form.gender} onChange={(event) => update("gender", event.target.value)} className={inputClass}><option value="">Choose an option</option><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other / Prefer not to say</option></select></Field>
                </div>
              </FormSection>

              <FormSection icon={<HeartPulse className="h-4 w-4" />} eyebrow="02 · Safety" title="Emergency contact" description="The person race staff should contact if you need help.">
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Contact name" htmlFor="profile-emergency-name"><input id="profile-emergency-name" autoComplete="off" maxLength={200} value={form.emergency_contact_name} onChange={(event) => update("emergency_contact_name", event.target.value)} className={inputClass} placeholder="Emergency contact" /></Field>
                  <Field label="Contact phone" htmlFor="profile-emergency-phone"><input id="profile-emergency-phone" type="tel" autoComplete="off" maxLength={30} value={form.emergency_contact_phone} onChange={(event) => update("emergency_contact_phone", event.target.value)} className={inputClass} placeholder="+855 98 765 432" /></Field>
                </div>
              </FormSection>

              <FormSection icon={<Shirt className="h-4 w-4" />} eyebrow="03 · Gear" title="Race shirt" description="Saved as your default choice. You can still change it for an individual event.">
                <Field label="Unisex shirt size" htmlFor="profile-shirt-size"><select id="profile-shirt-size" value={form.tshirt_size} onChange={(event) => update("tshirt_size", event.target.value)} className={`${inputClass} sm:max-w-xs`}><option value="">Choose a size</option>{["XS", "S", "M", "L", "XL", "XXL"].map((size) => <option key={size} value={size}>{size}</option>)}</select></Field>
              </FormSection>

              <div className="flex flex-col gap-3 border-t border-black/10 bg-white px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
                <p className="text-[11px] font-semibold text-black/40">{dirty ? "You have unsaved changes." : "Your runner card is up to date."}</p>
                <button type="submit" disabled={saving || !dirty} className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#111] px-6 text-[10px] font-black uppercase tracking-[0.12em] text-white transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-30">
                  {saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/25 border-t-white" /> : <Save className="h-4 w-4" />}
                  {saving ? "Saving" : "Save runner card"}
                </button>
              </div>
            </form>

            <section aria-labelledby="delivery-automations-title" className="relative mt-6 overflow-hidden rounded-[26px] border border-white/10 bg-[#0d0d0d] text-white shadow-[0_28px_80px_-45px_rgba(0,0,0,.65)]">
              <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full border-[42px] border-[#3155ff]/20" aria-hidden />
              <div className="relative border-b border-white/10 p-5 sm:p-7">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#d9ff00] text-black"><Radio className="h-4 w-4" /></span>
                    <div>
                      <p className="font-mono text-[9px] font-black uppercase tracking-[0.17em] text-[#d9ff00]">04 · Race signal</p>
                      <h2 id="delivery-automations-title" className="mt-1 text-xl font-black tracking-[-0.025em]">Delivery automations</h2>
                      <p className="mt-1 max-w-lg text-xs font-semibold leading-5 text-white/45">Connect once. Race control sends the useful things at the useful moment—without replacing email.</p>
                    </div>
                  </div>
                  <span className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-2 text-[9px] font-black uppercase tracking-[0.13em] ${telegram?.connected ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" : "border-white/10 bg-white/5 text-white/45"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${telegram?.connected ? "bg-emerald-400" : "bg-white/25"}`} />
                    {telegram?.connected ? "Signal live" : "Email only"}
                  </span>
                </div>
              </div>

              <div className="relative grid gap-px bg-white/10 sm:grid-cols-3">
                {[
                  { key: "tickets" as const, icon: TicketCheck, label: "Tickets + payments", moment: "QR and verified receipts" },
                  { key: "reminders" as const, icon: BellRing, label: "Race reminders", moment: "Before the start line" },
                  { key: "event_updates" as const, icon: Radio, label: "Event changes", moment: "Updates and cancellations" },
                ].map(({ key, icon: Icon, label, moment }) => {
                  const enabled = telegram?.preferences?.[key] ?? true;
                  return <div key={label} className="bg-[#0d0d0d] p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <Icon className={`h-4 w-4 ${enabled ? "text-[#d9ff00]" : "text-white/20"}`} />
                      <button
                        type="button"
                        role="switch"
                        aria-checked={enabled}
                        aria-label={`${enabled ? "Disable" : "Enable"} ${label}`}
                        disabled={!telegram?.connected || telegramPreferenceBusy !== null}
                        onClick={() => updateTelegramPreference(key)}
                        className={`relative h-6 w-10 rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d9ff00] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d0d0d] disabled:cursor-not-allowed ${enabled ? "border-[#d9ff00]/40 bg-[#d9ff00]" : "border-white/15 bg-white/5"}`}
                      >
                        <span className={`absolute top-0.5 h-4.5 w-4.5 rounded-full transition-transform ${enabled ? "translate-x-[17px] bg-black" : "translate-x-0.5 bg-white/35"}`} />
                      </button>
                    </div>
                    <p className={`mt-4 text-[10px] font-black uppercase tracking-[0.1em] ${enabled ? "text-white" : "text-white/35"}`}>{label}</p>
                    <p className="mt-1 text-[10px] font-semibold text-white/35">{telegram?.connected ? (enabled ? moment : "Paused on Telegram") : moment}</p>
                  </div>
                })}
              </div>

              <div className="relative flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
                <div>
                  <p className="flex items-center gap-2 text-sm font-black">
                    <Send className="h-4 w-4 text-sky-400" />
                    {telegram?.connected ? `Connected${telegram.account?.username ? ` as @${telegram.account.username}` : telegram.account?.first_name ? ` as ${telegram.account.first_name}` : ""}` : "Telegram delivery"}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold leading-5 text-white/35">
                    {!telegram?.available
                      ? "Add the Telegram bot credentials on the server to activate this channel."
                      : telegram?.connected
                        ? "New confirmations and race-critical updates are mirrored to your private chat."
                        : telegramLinkExpiresAt
                          ? "Tap Start in Telegram. This page will detect the connection automatically."
                          : "A private, one-time link connects the bot—no chat ID copying required."}
                  </p>
                </div>
                {telegram?.connected ? (
                  <div className="flex flex-col gap-2 min-[420px]:flex-row">
                    <button type="button" onClick={sendTelegramTest} disabled={telegramTestBusy} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-white px-5 text-[9px] font-black uppercase tracking-[0.12em] text-black transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40">
                      {telegramTestBusy ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/20 border-t-black" /> : <Send className="h-3.5 w-3.5" />} Send test
                    </button>
                    <button type="button" onClick={disconnectTelegram} disabled={telegramBusy} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-white/15 px-5 text-[9px] font-black uppercase tracking-[0.12em] text-white/65 transition hover:border-white/35 hover:text-white disabled:cursor-not-allowed disabled:opacity-40">
                      <Unplug className="h-3.5 w-3.5" /> Disconnect
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={connectTelegram} disabled={telegramBusy || !telegram?.available} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-sky-500 px-5 text-[9px] font-black uppercase tracking-[0.12em] text-white transition hover:-translate-y-0.5 hover:bg-sky-400 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-35">
                    {telegramBusy ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/25 border-t-white" /> : <Send className="h-3.5 w-3.5" />}
                    {telegramLinkExpiresAt ? "Open Telegram again" : "Connect Telegram"}
                  </button>
                )}
              </div>

              {telegram?.connected && (
                <div className="relative border-t border-white/10 px-5 py-6 sm:px-7">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="font-mono text-[9px] font-black uppercase tracking-[0.17em] text-white/35">Signal trace</p>
                      <h3 className="mt-1 text-sm font-black">Recent signals</h3>
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-[0.12em] text-white/25">Latest {Math.min(telegramDeliveries.length, 8)}</span>
                  </div>
                  {telegramDeliveries.length === 0 ? (
                    <div className="mt-5 border-l border-dashed border-white/15 py-1 pl-5">
                      <p className="text-xs font-bold text-white/55">No race signals sent yet.</p>
                      <p className="mt-1 text-[10px] font-semibold leading-4 text-white/30">Your next ticket or event update will leave a delivery mark here.</p>
                    </div>
                  ) : (
                    <ol className="relative mt-5 space-y-0 border-l border-white/10">
                      {telegramDeliveries.map((delivery) => {
                        const sent = delivery.status === "SENT";
                        const failed = delivery.status === "FAILED";
                        const timestamp = delivery.sent_at || delivery.updated_at || delivery.created_at;
                        return <li key={delivery.id} className="relative grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-b border-white/[0.07] py-3 pl-5 last:border-b-0">
                          <span className={`absolute -left-[5px] top-[18px] h-2.5 w-2.5 rounded-full border-2 border-[#0d0d0d] ${sent ? "bg-emerald-400" : failed ? "bg-rose-400" : "animate-pulse bg-[#d9ff00] motion-reduce:animate-none"}`} />
                          <div className="min-w-0">
                            <p className="truncate text-[10px] font-black uppercase tracking-[0.1em] text-white/80">{telegramDeliveryLabels[delivery.type]}</p>
                            <p className="mt-1 text-[9px] font-semibold text-white/30">{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp))}</p>
                          </div>
                          <span className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[8px] font-black uppercase tracking-[0.1em] ${sent ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" : failed ? "border-rose-400/20 bg-rose-400/10 text-rose-300" : "border-[#d9ff00]/20 bg-[#d9ff00]/10 text-[#d9ff00]"}`}>
                            {sent ? <Check className="h-3 w-3" /> : failed ? <AlertTriangle className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}
                            {sent ? "Delivered" : failed ? "Not delivered" : "Sending"}
                          </span>
                        </li>;
                      })}
                    </ol>
                  )}
                </div>
              )}
            </section>
          </div>
        </section>
      </main>
      <SportFooter />
    </div>
  );
}

function Field({ label, htmlFor, required, children }: { label: string; htmlFor: string; required?: boolean; children: ReactNode }) {
  return <label htmlFor={htmlFor} className="block"><span className="text-[10px] font-black uppercase tracking-[0.13em] text-black/50">{label}{required && <span className="ml-1 text-rose-600">*</span>}</span>{children}</label>;
}

function FormSection({ icon, eyebrow, title, description, children }: { icon: ReactNode; eyebrow: string; title: string; description: string; children: ReactNode }) {
  return <fieldset className="border-b border-black/10 p-5 sm:p-7"><legend className="sr-only">{title}</legend><div className="flex items-start gap-3"><span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#111] text-white">{icon}</span><div><p className="font-mono text-[9px] font-black uppercase tracking-[0.17em] text-[#3155ff]">{eyebrow}</p><h2 className="mt-1 text-xl font-black tracking-[-0.025em]">{title}</h2><p className="mt-1 text-xs font-semibold leading-5 text-black/45">{description}</p></div></div><div className="mt-6">{children}</div></fieldset>;
}

function ProfileSkeleton({ background }: { background: string }) {
  return <div className="public-shell min-h-screen text-white" style={{ backgroundColor: background }}><SportHeader active="account" accountHref="/dashboard" accountLabel="Account" /><main className="mx-auto grid max-w-[1200px] gap-8 px-5 py-12 sm:px-8 lg:grid-cols-[320px_minmax(0,1fr)]"><div><Skeleton className="h-[430px] rounded-[24px]" /></div><div className="rounded-[26px] bg-white p-7"><Skeleton className="h-4 w-36" /><Skeleton className="mt-4 h-8 w-64" /><div className="mt-8 grid gap-5 sm:grid-cols-2">{[0, 1, 2, 3, 4, 5].map((item) => <Skeleton key={item} className="h-16 rounded-xl" />)}</div></div></main></div>;
}
