import { useState, type FormEvent, type ReactNode } from "react";
import { Check, LoaderCircle, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { api } from "../../lib/api";
import { formatMoney, parseMoneyInput, type SupportedCurrency } from "../../lib/money";
import { formatRegistrationDeadline, registrationDeadlinePayload, toLocalDateTimeInput } from "../../lib/registrationDeadline";
import type { EventCategory } from "../../types";
import { useAlerts } from "../alerts/AlertSystem";

interface CategoryDraft {
  name: string;
  distance: string;
  price: string;
  currency: SupportedCurrency;
  capacity: string;
  registrationDeadline: string;
  status: "OPEN" | "CLOSED" | "SOLD_OUT";
}

const emptyDraft: CategoryDraft = { name: "", distance: "", price: "0", currency: "USD", capacity: "", registrationDeadline: "", status: "OPEN" };
const inputClass = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-[#3155ff] focus:ring-2 focus:ring-[#3155ff]/15";

function draftFromCategory(category: EventCategory): CategoryDraft {
  return {
    name: category.name,
    distance: category.distance,
    price: category.currency === "KHR" ? String(category.price_cents) : (category.price_cents / 100).toFixed(2),
    currency: category.currency,
    capacity: String(category.capacity),
    registrationDeadline: toLocalDateTimeInput(category.registration_deadline),
    status: category.status as CategoryDraft["status"],
  };
}

function validateDraft(draft: CategoryDraft) {
  if (!draft.name.trim()) return "Add a category name.";
  if (!draft.distance.trim()) return "Add a race distance.";
  const capacity = Number.parseInt(draft.capacity, 10);
  if (!Number.isFinite(capacity) || capacity < 1) return "Capacity must be at least one runner.";
  return null;
}

export function EventCategoriesEditor({ eventId, categories, onChange }: { eventId: string; categories: EventCategory[]; onChange: (categories: EventCategory[]) => void }) {
  const alerts = useAlerts();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CategoryDraft>(emptyDraft);
  const [createDraft, setCreateDraft] = useState<CategoryDraft>(emptyDraft);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const beginEdit = (category: EventCategory) => {
    setEditingId(category.id);
    setDraft(draftFromCategory(category));
    setDeletingId(null);
  };

  const saveEdit = async (categoryId: string) => {
    const validationError = validateDraft(draft);
    if (validationError) {
      alerts.notify({ tone: "error", title: "Category not saved", message: validationError });
      return;
    }
    setBusyId(categoryId);
    try {
      const updated = await api.updateCategory(eventId, categoryId, {
        name: draft.name.trim(),
        distance: draft.distance.trim(),
        price_cents: parseMoneyInput(draft.price, draft.currency),
        currency: draft.currency,
        capacity: Number.parseInt(draft.capacity, 10),
        registration_deadline: registrationDeadlinePayload(draft.registrationDeadline),
        clear_registration_deadline: !draft.registrationDeadline,
        status: draft.status,
      });
      onChange(categories.map((category) => category.id === categoryId ? updated : category));
      setEditingId(null);
      alerts.notify({ tone: "success", title: "Category saved", message: `${updated.name} is updated on the event.` });
    } catch (caught) {
      alerts.notify({ tone: "error", title: "Category not saved", message: caught instanceof Error ? caught.message : "Could not update this category." });
    } finally {
      setBusyId(null);
    }
  };

  const addCategory = async (event: FormEvent) => {
    event.preventDefault();
    const validationError = validateDraft(createDraft);
    if (validationError) {
      alerts.notify({ tone: "error", title: "Category not added", message: validationError });
      return;
    }
    setBusyId("new");
    try {
      const created = await api.createCategory(eventId, {
        name: createDraft.name.trim(),
        distance: createDraft.distance.trim(),
        price_cents: parseMoneyInput(createDraft.price, createDraft.currency),
        currency: createDraft.currency,
        capacity: Number.parseInt(createDraft.capacity, 10),
        registration_deadline: registrationDeadlinePayload(createDraft.registrationDeadline),
      });
      onChange([...categories, created]);
      setCreateDraft(emptyDraft);
      alerts.notify({ tone: "success", title: "Category added", message: `${created.name} is ready to configure.` });
    } catch (caught) {
      alerts.notify({ tone: "error", title: "Category not added", message: caught instanceof Error ? caught.message : "Could not add this category." });
    } finally {
      setBusyId(null);
    }
  };

  const removeCategory = async (category: EventCategory) => {
    if (deletingId !== category.id) {
      setDeletingId(category.id);
      return;
    }
    setBusyId(category.id);
    try {
      await api.deleteCategory(eventId, category.id);
      onChange(categories.filter((item) => item.id !== category.id));
      setDeletingId(null);
      alerts.notify({ tone: "success", title: "Category removed", message: `${category.name} was removed from the event.` });
    } catch (caught) {
      alerts.notify({ tone: "error", title: "Category not removed", message: caught instanceof Error ? caught.message : "Could not remove this category." });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h3 className="font-bold text-slate-900">Race categories & capacities</h3><p className="mt-1 text-xs text-slate-500">Edit what runners choose: distance, fee, currency, available slots, and entry status.</p></div>
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{categories.length} {categories.length === 1 ? "category" : "categories"}</span>
        </div>
        {categories.length === 0 ? (
          <div className="px-5 py-9 text-center"><p className="text-sm font-semibold text-slate-500">No race categories yet.</p><p className="mt-1 text-xs text-slate-400">Add the first distance below before opening registration.</p></div>
        ) : (
          <div className="divide-y divide-slate-100">
            {categories.map((category) => editingId === category.id ? (
              <CategoryEditRow key={category.id} draft={draft} setDraft={setDraft} busy={busyId === category.id} onCancel={() => setEditingId(null)} onSave={() => saveEdit(category.id)} />
            ) : (
              <article key={category.id} className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="grid gap-3 sm:grid-cols-2 sm:items-center xl:grid-cols-[minmax(180px,1.2fr)_repeat(4,minmax(90px,.7fr))]">
                  <div><div className="flex items-center gap-2"><h4 className="text-sm font-bold text-slate-900">{category.name}</h4><StatusPill status={category.status} /></div><p className="mt-1 text-xs text-slate-400">{category.distance}</p></div>
                  <Metric label="Price" value={formatMoney(category.price_cents, category.currency)} />
                  <Metric label="Capacity" value={`${category.capacity} runners`} />
                  <Metric label="Currency" value={category.currency} />
                  <Metric label="Entry closes" value={formatRegistrationDeadline(category.registration_deadline)} />
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => beginEdit(category)} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-600 transition hover:border-slate-400 hover:text-slate-900"><Pencil className="h-3.5 w-3.5" /> Edit</button>
                  {deletingId === category.id ? <><button type="button" disabled={busyId === category.id} onClick={() => removeCategory(category)} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-rose-600 px-3 text-[10px] font-bold uppercase tracking-[0.08em] text-white disabled:opacity-50">{busyId === category.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Confirm remove</button><button type="button" onClick={() => setDeletingId(null)} className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-400" aria-label={`Keep ${category.name}`}><X className="h-3.5 w-3.5" /></button></> : <button type="button" onClick={() => setDeletingId(category.id)} className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600" aria-label={`Remove ${category.name}`}><Trash2 className="h-3.5 w-3.5" /></button>}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <form onSubmit={addCategory} className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-5">
        <div className="mb-4"><p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#3155ff]">New distance</p><h3 className="mt-1 text-sm font-bold text-slate-900">Add another category</h3></div>
        <CategoryFields draft={createDraft} setDraft={setCreateDraft} includeStatus={false} />
        <div className="mt-4 flex justify-end"><button type="submit" disabled={busyId === "new"} className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-[10px] font-bold uppercase tracking-[0.09em] text-white transition hover:bg-slate-700 disabled:opacity-50">{busyId === "new" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} {busyId === "new" ? "Adding" : "Add category"}</button></div>
      </form>
    </div>
  );
}

function CategoryEditRow({ draft, setDraft, busy, onCancel, onSave }: { draft: CategoryDraft; setDraft: (draft: CategoryDraft) => void; busy: boolean; onCancel: () => void; onSave: () => void }) {
  return <div className="bg-[#f7f8ff] px-5 py-5"><p className="mb-4 text-[10px] font-bold uppercase tracking-[0.13em] text-[#3155ff]">Editing category</p><CategoryFields draft={draft} setDraft={setDraft} includeStatus /><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onCancel} disabled={busy} className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-600">Discard</button><button type="button" onClick={onSave} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#3155ff] px-4 text-[10px] font-bold uppercase tracking-[0.08em] text-white disabled:opacity-50">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{busy ? "Saving" : "Save category"}</button></div></div>;
}

function CategoryFields({ draft, setDraft, includeStatus }: { draft: CategoryDraft; setDraft: (draft: CategoryDraft) => void; includeStatus: boolean }) {
  const update = <K extends keyof CategoryDraft>(key: K, value: CategoryDraft[K]) => setDraft({ ...draft, [key]: value });
  return <div className={`grid gap-3 ${includeStatus ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-2 xl:grid-cols-3"}`}><Labeled label="Name"><input aria-label="Category name" maxLength={100} value={draft.name} onChange={(event) => update("name", event.target.value)} className={inputClass} placeholder="Half Marathon" /></Labeled><Labeled label="Distance"><input aria-label="Category distance" maxLength={50} value={draft.distance} onChange={(event) => update("distance", event.target.value)} className={inputClass} placeholder="21.1 km" /></Labeled><Labeled label="Price"><input aria-label="Category price" type="number" min="0" step={draft.currency === "KHR" ? "1" : ".01"} value={draft.price} onChange={(event) => update("price", event.target.value)} className={inputClass} /></Labeled><Labeled label="Currency"><select aria-label="Category currency" value={draft.currency} onChange={(event) => update("currency", event.target.value as SupportedCurrency)} className={inputClass}><option value="USD">USD</option><option value="KHR">KHR</option></select></Labeled><Labeled label="Capacity"><input aria-label="Category capacity" type="number" min="1" value={draft.capacity} onChange={(event) => update("capacity", event.target.value)} className={inputClass} placeholder="500" /></Labeled><Labeled label="Category entry closes"><input aria-label="Category registration deadline" type="datetime-local" value={draft.registrationDeadline} onChange={(event) => update("registrationDeadline", event.target.value)} className={inputClass} /></Labeled>{includeStatus && <Labeled label="Entry status"><select aria-label="Category status" value={draft.status} onChange={(event) => update("status", event.target.value as CategoryDraft["status"])} className={inputClass}><option value="OPEN">Open</option><option value="CLOSED">Closed</option><option value="SOLD_OUT">Sold out</option></select></Labeled>}</div>;
}

function Labeled({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><span className="text-[10px] font-bold uppercase tracking-[0.09em] text-slate-500">{label}</span><span className="mt-1 block">{children}</span></label>; }
function Metric({ label, value }: { label: string; value: string }) { return <div><p className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">{label}</p><p className="mt-1 text-xs font-semibold text-slate-700">{value}</p></div>; }
function StatusPill({ status }: { status: string }) { const style = status === "OPEN" ? "bg-emerald-50 text-emerald-700" : status === "SOLD_OUT" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"; return <span className={`rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.08em] ${style}`}>{status.replaceAll("_", " ")}</span>; }
