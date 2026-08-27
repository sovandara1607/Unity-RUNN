import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Clock3, MapPin, Plus, Route, Save, Trash2 } from "lucide-react";
import { AdminLayout } from "../../../components/admin/AdminLayout";
import { EventPosterField } from "../../../components/admin/EventPosterField";
import { AlertBanner } from "../../../components/alerts/AlertSystem";
import { api } from "../../../lib/api";
import type { EventCategory } from "../../../types";

const STEPS = [
  { n: 1, label: "Basics", hint: "Name, date & venue" },
  { n: 2, label: "Categories", hint: "Distances & pricing" },
  { n: 3, label: "Race Day Schedule", hint: "Timeline of the day" },
];

interface ScheduleRow {
  id: string;
  time: string;
  title: string;
  description?: string;
}

const EVENT_DRAFT_KEY = "unity_event_builder_draft_v1";
const INITIAL_FORM_DATA = {
  name: "",
  slug: "",
  description: "",
  cover_image: "",
  event_date: "",
  start_time: "06:00",
  location: "Koh Pich, Phnom Penh, Cambodia",
};
const INITIAL_CATEGORY_FORM = { name: "", distance: "", price: "", capacity: "" };
const INITIAL_SCHEDULE_FORM = { time: "", title: "", description: "" };

interface SavedEventDraft {
  version: 1;
  saved_at: string;
  step: number;
  event_id: string | null;
  event_slug: string | null;
  form_data: typeof INITIAL_FORM_DATA;
  category_form: typeof INITIAL_CATEGORY_FORM;
  schedule_form: typeof INITIAL_SCHEDULE_FORM;
  categories: EventCategory[];
  schedule: ScheduleRow[];
}

function toInputTime(value?: string | null) {
  if (!value) return "";
  return value.includes("T") ? value.slice(11, 16) : value.slice(0, 5);
}

export default function AdminNewEventPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [eventId, setEventId] = useState<string | null>(null);
  const [eventSlug, setEventSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [draftRecovered, setDraftRecovered] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [posterUploading, setPosterUploading] = useState(false);
  const [posterError, setPosterError] = useState<string | null>(null);
  // Keep the upload result outside React's render cycle too. This prevents a
  // fast click on Save immediately after upload completion from submitting an
  // older render whose cover_image is still empty.
  const coverImageRef = useRef("");

  // Step 1
  const [formData, setFormData] = useState(INITIAL_FORM_DATA);

  // Step 2
  const [categories, setCategories] = useState<EventCategory[]>([]);
  const [catForm, setCatForm] = useState(INITIAL_CATEGORY_FORM);

  // Step 3
  const [schedule, setSchedule] = useState<ScheduleRow[]>([]);
  const [schForm, setSchForm] = useState(INITIAL_SCHEDULE_FORM);

  useEffect(() => {
    let active = true;
    async function resumeDraft() {
      try {
        const raw = window.localStorage.getItem(EVENT_DRAFT_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw) as SavedEventDraft;
        if (saved.version !== 1 || !saved.form_data) {
          window.localStorage.removeItem(EVENT_DRAFT_KEY);
          return;
        }

        const meaningful = Boolean(
          saved.event_id || saved.form_data.name || saved.form_data.event_date || saved.form_data.description ||
          saved.form_data.cover_image || saved.form_data.location !== INITIAL_FORM_DATA.location ||
          saved.category_form?.name || saved.schedule_form?.title || saved.categories?.length || saved.schedule?.length
        );
        if (!meaningful || !active) return;

        coverImageRef.current = saved.form_data.cover_image || "";
        setFormData({ ...INITIAL_FORM_DATA, ...saved.form_data });
        setCatForm({ ...INITIAL_CATEGORY_FORM, ...saved.category_form });
        setSchForm({ ...INITIAL_SCHEDULE_FORM, ...saved.schedule_form });
        setCategories(saved.categories || []);
        setSchedule(saved.schedule || []);
        setEventId(saved.event_id || null);
        setEventSlug(saved.event_slug || null);
        setStep(Math.max(1, Math.min(3, saved.step || 1)));
        setLastSavedAt(saved.saved_at ? new Date(saved.saved_at) : null);
        setDraftRecovered(true);

        if (saved.event_id && saved.event_slug) {
          try {
            // Restore the admin access token from the HttpOnly refresh cookie
            // before requesting a DRAFT event through the optional-auth route.
            await api.getEventById(saved.event_id);
            const serverDraft = await api.getEvent(saved.event_slug);
            if (!active) return;
            coverImageRef.current = serverDraft.cover_image || "";
            setFormData({
              name: serverDraft.name,
              slug: serverDraft.slug,
              description: serverDraft.description || "",
              cover_image: serverDraft.cover_image || "",
              event_date: serverDraft.event_date.slice(0, 10),
              start_time: toInputTime(serverDraft.start_time) || "06:00",
              location: serverDraft.location || INITIAL_FORM_DATA.location,
            });
            setCategories(serverDraft.categories || []);
            setSchedule((serverDraft.schedule || []).map((item) => ({ id: item.id, time: toInputTime(item.time), title: item.title, description: item.description })));
          } catch (caught: unknown) {
            if ((caught as { status?: number })?.status === 404 && active) {
              setEventId(null); setEventSlug(null); setStep(1); setCategories([]); setSchedule([]);
              setError("The saved server draft no longer exists. Your basic information was recovered so you can create it again.");
            }
          }
        }
      } catch {
        window.localStorage.removeItem(EVENT_DRAFT_KEY);
      } finally {
        if (active) setDraftReady(true);
      }
    }
    resumeDraft();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    const savedAt = new Date();
    const draft: SavedEventDraft = {
      version: 1,
      saved_at: savedAt.toISOString(),
      step,
      event_id: eventId,
      event_slug: eventSlug,
      form_data: formData,
      category_form: catForm,
      schedule_form: schForm,
      categories,
      schedule,
    };
    window.localStorage.setItem(EVENT_DRAFT_KEY, JSON.stringify(draft));
    setLastSavedAt(savedAt);
  }, [draftReady, step, eventId, eventSlug, formData, catForm, schForm, categories, schedule]);

  const generateSlug = (name: string) =>
    name.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    setFormData((prev) => ({
      ...prev,
      name,
      slug: prev.slug === "" || prev.slug === generateSlug(prev.name) ? generateSlug(name) : prev.slug,
    }));
  };

  /* ---- Step 1: create the draft event ---- */
  const submitBasics = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (posterUploading) {
        throw new Error("Wait for the event poster to finish uploading before continuing.");
      }
      if (posterError) {
        throw new Error(`Fix the event poster before continuing: ${posterError}`);
      }
      if (!formData.name || !formData.event_date || !formData.start_time || !formData.location) {
        throw new Error("Fill in every required field to continue.");
      }
      const payload = {
        name: formData.name,
        slug: formData.slug || generateSlug(formData.name),
        description: formData.description,
        cover_image: coverImageRef.current.trim(),
        event_date: formData.event_date,
        start_time: formData.start_time,
        location: formData.location,
      };
      const saved = eventId ? await api.updateEvent(eventId, payload) : await api.createEvent(payload);
      if (payload.cover_image && saved.cover_image !== payload.cover_image) {
        throw new Error("The event was saved, but its poster was not attached. Please try saving once more.");
      }
      setEventId(saved.id);
      setEventSlug(saved.slug);
      coverImageRef.current = saved.cover_image || payload.cover_image;
      setFormData((current) => ({ ...current, slug: saved.slug, cover_image: coverImageRef.current }));
      setStep(2);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save event");
    } finally {
      setLoading(false);
    }
  };

  /* ---- Step 2: categories ---- */
  const addCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!catForm.name || !catForm.distance || catForm.capacity === "") {
      setError("Category needs a name, distance and capacity.");
      return;
    }
    setLoading(true);
    try {
      const created = await api.createCategory(eventId!, {
        name: catForm.name,
        distance: catForm.distance,
        price_cents: Math.round(parseFloat(catForm.price || "0") * 100),
        capacity: parseInt(catForm.capacity, 10),
      });
      setCategories((prev) => [...prev, created]);
      setCatForm({ name: "", distance: "", price: "", capacity: "" });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add category");
    } finally {
      setLoading(false);
    }
  };

  const removeCategory = async (id: string) => {
    try {
      await api.deleteCategory(eventId!, id);
      setCategories((prev) => prev.filter((c) => c.id !== id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to remove category");
    }
  };

  /* ---- Step 3: schedule ---- */
  const addScheduleItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!schForm.time || !schForm.title) {
      setError("Each schedule line needs a time and a title.");
      return;
    }
    setLoading(true);
    try {
      const created = await api.createScheduleItem(eventId!, {
        time: schForm.time,
        title: schForm.title,
        description: schForm.description,
        sort_order: schedule.length,
      });
      setSchedule((prev) => [...prev, { id: created.id, time: schForm.time, title: schForm.title, description: schForm.description }]);
      setSchForm({ time: "", title: "", description: "" });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add schedule item");
    } finally {
      setLoading(false);
    }
  };

  const removeScheduleItem = async (id: string) => {
    try {
      await api.deleteScheduleItem(eventId!, id);
      setSchedule((prev) => prev.filter((s) => s.id !== id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to remove schedule item");
    }
  };

  const finish = () => {
    window.localStorage.removeItem(EVENT_DRAFT_KEY);
    router.push(`/admin/events/${eventId}/edit`);
  };

  return (
    <AdminLayout
      title="Create event"
      subtitle="Set up your race in three quick steps"
      minRole="ADMIN"
      actions={
        <Link
          href="/admin/events"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Events</span>
        </Link>
      }
    >
      <div className="max-w-3xl mx-auto">
        <div className="mb-4 flex items-center justify-end gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-black/35">
          <Save className="h-3.5 w-3.5 text-[#3155ff]" />
          {draftReady ? (lastSavedAt ? `Progress saved ${lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Auto-save ready") : "Checking saved progress"}
        </div>
        {/* Stepper */}
        <ol className="mb-8 flex items-start gap-0 select-none">
          {STEPS.map((s, i) => {
            const state = step > s.n ? "done" : step === s.n ? "active" : "todo";
            return (
              <li key={s.n} className={`flex items-start ${i < STEPS.length - 1 ? "flex-1" : ""}`}>
                <div className="flex items-start gap-2.5">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors ${
                      state === "done"
                        ? "bg-emerald-600 border-emerald-600 text-white"
                        : state === "active"
                        ? "border-orange-600 text-orange-600 bg-white"
                        : "border-slate-200 text-slate-400 bg-white"
                    }`}
                  >
                    {state === "done" ? <Check className="w-4 h-4" /> : s.n}
                  </span>
                  <span className="hidden sm:block">
                    <span className={`block text-xs font-semibold ${state === "todo" ? "text-slate-400" : "text-slate-900"}`}>{s.label}</span>
                    <span className="block text-[10px] text-slate-400">{s.hint}</span>
                  </span>
                </div>
                {i < STEPS.length - 1 && <div className={`mt-4 h-0.5 flex-1 mx-3 rounded ${step > s.n ? "bg-emerald-500" : "bg-slate-200"}`} />}
              </li>
            );
          })}
        </ol>

        {error && (
          <AlertBanner tone="error" title="Check this step" className="mb-6" onDismiss={() => setError(null)}>{error}</AlertBanner>
        )}
        {draftRecovered && (
          <AlertBanner
            tone="info"
            title="Event setup resumed"
            className="mb-6"
            onDismiss={() => setDraftRecovered(false)}
            action={eventId ? <Link href={`/admin/events/${eventId}/edit`} className="inline-flex items-center gap-2 rounded-full bg-[#3155ff] px-3.5 py-2 text-[9px] font-black uppercase tracking-[0.1em] text-white">Open full editor <ArrowRight className="h-3.5 w-3.5" /></Link> : undefined}
          >
            Your saved fields and current step were restored. New changes continue saving automatically on this device.
          </AlertBanner>
        )}

        {/* STEP 1 — basics */}
        {step === 1 && (
          <form onSubmit={submitBasics} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
            <h3 className="text-base font-bold text-slate-900">Basic Event Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Event Name *</label>
                <input type="text" required placeholder="e.g. Unity Phnom Penh Half Marathon 2026" value={formData.name} onChange={handleNameChange} className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Event Date *</label>
                <input type="date" required value={formData.event_date} onChange={(e) => setFormData({ ...formData, event_date: e.target.value })} className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Start Time *</label>
                <input type="time" required value={formData.start_time} onChange={(e) => setFormData({ ...formData, start_time: e.target.value })} className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Location / Venue *</label>
                <input type="text" required value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                <textarea rows={3} placeholder="Course, aid stations, what runners can expect…" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
              <div className="sm:col-span-2">
                <EventPosterField
                  value={formData.cover_image}
                  onChange={(cover_image) => {
                    coverImageRef.current = cover_image;
                    setFormData((current) => ({ ...current, cover_image }));
                  }}
                  disabled={loading}
                  onUploadStateChange={setPosterUploading}
                  onUploadError={setPosterError}
                />
              </div>
            </div>
            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              <p className="text-[11px] text-slate-400">{eventId ? "Updates the existing server draft." : "Creates a server draft; unfinished fields are already saved on this device."}</p>
              <button type="submit" disabled={loading || posterUploading} className="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors">
                <span>{posterUploading ? "Uploading poster…" : loading ? "Saving…" : eventId ? "Save changes & return" : "Save & add categories"}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}

        {/* STEP 2 — categories */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
              <h3 className="text-base font-bold text-slate-900 mb-1">Add Race Categories</h3>
              <p className="text-xs text-slate-500 mb-5">One row per distance — e.g. 3K Fun Run, 10K, Half Marathon.</p>

              {categories.length > 0 && (
                <ul className="mb-5 space-y-2">
                  {categories.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-100 rounded-xl">
                      <Route className="w-4 h-4 text-orange-500 shrink-0" />
                      <div className="flex-1 min-w-0 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <span className="font-semibold text-slate-900 truncate">{c.name}</span>
                        <span className="text-slate-500">{c.distance}</span>
                        <span className="text-slate-500">${(c.price_cents / 100).toFixed(2)}</span>
                        <span className="text-slate-500">{c.capacity} slots</span>
                      </div>
                      <button type="button" onClick={() => removeCategory(c.id)} className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors" aria-label={`Remove ${c.name}`}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <form onSubmit={addCategory} className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Name *</label>
                  <input type="text" placeholder="Half Marathon" value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Distance *</label>
                  <input type="text" placeholder="21.1K" value={catForm.distance} onChange={(e) => setCatForm({ ...catForm, distance: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Price ($)</label>
                  <input type="number" min="0" step="0.01" placeholder="25.00" value={catForm.price} onChange={(e) => setCatForm({ ...catForm, price: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Capacity *</label>
                  <input type="number" min="0" placeholder="500" value={catForm.capacity} onChange={(e) => setCatForm({ ...catForm, capacity: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500" />
                </div>
                <button type="submit" disabled={loading} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-slate-900 hover:bg-slate-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-colors">
                  <Plus className="w-4 h-4" /> Add
                </button>
              </form>
            </div>

            <WizardNav onBack={() => setStep(1)} onNext={() => setStep(3)} nextLabel="Add Schedule" nextDisabled={categories.length === 0} nextHint="At least one category is required before opening registration." loading={loading} />
          </div>
        )}

        {/* STEP 3 — schedule */}
        {step === 3 && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
              <h3 className="text-base font-bold text-slate-900 mb-1">Race Day Schedule</h3>
              <p className="text-xs text-slate-500 mb-5">Optional timeline shown to participants — kit pickup, flag-off, cut-offs.</p>

              {schedule.length > 0 && (
                <ul className="mb-5 space-y-2">
                  {schedule.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-100 rounded-xl">
                      <Clock3 className="w-4 h-4 text-orange-500 shrink-0" />
                      <div className="flex-1 min-w-0 text-xs">
                        <span className="font-mono font-semibold text-slate-900 mr-3">{s.time}</span>
                        <span className="font-semibold text-slate-900 mr-3">{s.title}</span>
                        {s.description && <span className="text-slate-500">{s.description}</span>}
                      </div>
                      <button type="button" onClick={() => removeScheduleItem(s.id)} className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors" aria-label={`Remove ${s.title}`}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <form onSubmit={addScheduleItem} className="grid grid-cols-2 sm:grid-cols-6 gap-3 items-end">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Time *</label>
                  <input type="time" value={schForm.time} onChange={(e) => setSchForm({ ...schForm, time: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Title *</label>
                  <input type="text" placeholder="Flag-off — Half Marathon" value={schForm.title} onChange={(e) => setSchForm({ ...schForm, title: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Notes</label>
                  <input type="text" placeholder="Assemble at Start Corral A" value={schForm.description} onChange={(e) => setSchForm({ ...schForm, description: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500" />
                </div>
                <button type="submit" disabled={loading} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-slate-900 hover:bg-slate-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-colors">
                  <Plus className="w-4 h-4" /> Add
                </button>
              </form>
            </div>

            <WizardNav onBack={() => setStep(2)} onNext={finish} nextLabel="Finish Setup" loading={false} />
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function WizardNav({
  onBack,
  onNext,
  nextLabel,
  nextDisabled,
  nextHint,
  loading,
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
  nextDisabled?: boolean;
  nextHint?: string;
  loading: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col sm:flex-row items-center justify-between gap-3">
      <button type="button" onClick={onBack} disabled={loading} className="px-4 py-2 border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-slate-700 text-xs font-semibold rounded-xl transition-colors">
        Back
      </button>
      <div className="flex items-center gap-3">
        {nextHint && nextDisabled && <p className="text-[11px] text-amber-600 max-w-xs text-right">{nextHint}</p>}
        <MapPin className="hidden sm:block w-3.5 h-3.5 text-slate-300" aria-hidden />
        <button type="button" onClick={onNext} disabled={nextDisabled || loading} className="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-40 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors">
          <Save className="w-4 h-4" />
          <span>{nextLabel}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
