import { useState, type FormEvent, type ReactNode } from "react";
import { Check, Clock3, LoaderCircle, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { api } from "../../lib/api";
import type { EventSchedule } from "../../types";
import { useAlerts } from "../alerts/AlertSystem";

interface ScheduleDraft { time: string; title: string; description: string; sort_order: string }
const emptyDraft: ScheduleDraft = { time: "06:00", title: "", description: "", sort_order: "1" };
const inputClass = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-[#3155ff] focus:ring-2 focus:ring-[#3155ff]/15";

function readableTime(value: string) { return value.includes("T") ? value.slice(11, 16) : value.slice(0, 5); }
function draftFromItem(item: EventSchedule): ScheduleDraft { return { time: readableTime(item.time), title: item.title, description: item.description || "", sort_order: String(item.sort_order) }; }
function validateDraft(draft: ScheduleDraft) { if (!draft.time) return "Choose a time."; if (!draft.title.trim()) return "Add a schedule title."; return null; }

export function EventScheduleEditor({ eventId, schedule, onChange }: { eventId: string; schedule: EventSchedule[]; onChange: (schedule: EventSchedule[]) => void }) {
  const alerts = useAlerts();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ScheduleDraft>(emptyDraft);
  const [createDraft, setCreateDraft] = useState<ScheduleDraft>(() => ({ ...emptyDraft, sort_order: String(Math.max(0, ...schedule.map((item) => item.sort_order)) + 1) }));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const sorted = [...schedule].sort((a, b) => a.sort_order - b.sort_order || a.time.localeCompare(b.time));

  const beginEdit = (item: EventSchedule) => { setEditingId(item.id); setDraft(draftFromItem(item)); setDeletingId(null); };

  const saveEdit = async (itemId: string) => {
    const validationError = validateDraft(draft);
    if (validationError) { alerts.notify({ tone: "error", title: "Schedule not saved", message: validationError }); return; }
    setBusyId(itemId);
    try {
      const updated = await api.updateScheduleItem(eventId, itemId, { time: draft.time, title: draft.title.trim(), description: draft.description.trim(), sort_order: Number.parseInt(draft.sort_order, 10) || 0 });
      onChange(schedule.map((item) => item.id === itemId ? updated : item));
      setEditingId(null);
      alerts.notify({ tone: "success", title: "Schedule saved", message: `${updated.title} is updated on the public event page.` });
    } catch (caught) {
      alerts.notify({ tone: "error", title: "Schedule not saved", message: caught instanceof Error ? caught.message : "Could not update this schedule item." });
    } finally { setBusyId(null); }
  };

  const addItem = async (event: FormEvent) => {
    event.preventDefault();
    const validationError = validateDraft(createDraft);
    if (validationError) { alerts.notify({ tone: "error", title: "Schedule item not added", message: validationError }); return; }
    setBusyId("new");
    try {
      const created = await api.createScheduleItem(eventId, { time: createDraft.time, title: createDraft.title.trim(), description: createDraft.description.trim(), sort_order: Number.parseInt(createDraft.sort_order, 10) || 0 });
      const next = [...schedule, created];
      onChange(next);
      setCreateDraft({ ...emptyDraft, sort_order: String(Math.max(0, ...next.map((item) => item.sort_order)) + 1) });
      alerts.notify({ tone: "success", title: "Schedule item added", message: `${created.title} is now part of race day.` });
    } catch (caught) {
      alerts.notify({ tone: "error", title: "Schedule item not added", message: caught instanceof Error ? caught.message : "Could not add this schedule item." });
    } finally { setBusyId(null); }
  };

  const removeItem = async (item: EventSchedule) => {
    if (deletingId !== item.id) { setDeletingId(item.id); return; }
    setBusyId(item.id);
    try {
      await api.deleteScheduleItem(eventId, item.id);
      onChange(schedule.filter((current) => current.id !== item.id));
      setDeletingId(null);
      alerts.notify({ tone: "success", title: "Schedule item removed", message: `${item.title} was removed from race day.` });
    } catch (caught) {
      alerts.notify({ tone: "error", title: "Schedule item not removed", message: caught instanceof Error ? caught.message : "Could not remove this schedule item." });
    } finally { setBusyId(null); }
  };

  return <div className="space-y-5">
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-bold text-slate-900">Race-day timeline</h3><p className="mt-1 text-xs text-slate-500">Maintain the public sequence for arrival, starts, cut-offs, and presentations.</p></div><span className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{schedule.length} {schedule.length === 1 ? "moment" : "moments"}</span></div>
      {sorted.length === 0 ? <div className="px-5 py-9 text-center"><Clock3 className="mx-auto h-6 w-6 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-500">No race-day timeline yet.</p><p className="mt-1 text-xs text-slate-400">Add arrival or flag-off as the first moment below.</p></div> : <ol className="divide-y divide-slate-100">{sorted.map((item, index) => editingId === item.id ? <li key={item.id}><ScheduleEditRow draft={draft} setDraft={setDraft} busy={busyId === item.id} onCancel={() => setEditingId(null)} onSave={() => saveEdit(item.id)} /></li> : <li key={item.id} className="grid gap-4 px-5 py-5 sm:grid-cols-[76px_minmax(0,1fr)_auto] sm:items-center"><div className="relative"><span className="font-mono text-xl font-black text-[#3155ff]">{readableTime(item.time)}</span>{index < sorted.length - 1 && <span className="absolute left-1/2 top-9 hidden h-8 w-px bg-slate-200 sm:block" aria-hidden />}</div><div><div className="flex flex-wrap items-center gap-2"><h4 className="text-sm font-bold text-slate-900">{item.title}</h4><span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-slate-500">Order {item.sort_order}</span></div>{item.description && <p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>}</div><div className="flex items-center gap-2"><button type="button" onClick={() => beginEdit(item)} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-600 hover:border-slate-400 hover:text-slate-900"><Pencil className="h-3.5 w-3.5" /> Edit</button>{deletingId === item.id ? <><button type="button" disabled={busyId === item.id} onClick={() => removeItem(item)} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-rose-600 px-3 text-[10px] font-bold uppercase tracking-[0.08em] text-white disabled:opacity-50">{busyId === item.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Confirm remove</button><button type="button" onClick={() => setDeletingId(null)} className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-400" aria-label={`Keep ${item.title}`}><X className="h-3.5 w-3.5" /></button></> : <button type="button" onClick={() => setDeletingId(item.id)} className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600" aria-label={`Remove ${item.title}`}><Trash2 className="h-3.5 w-3.5" /></button>}</div></li>)}</ol>}
    </section>
    <form onSubmit={addItem} className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-5"><div className="mb-4"><p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#3155ff]">New moment</p><h3 className="mt-1 text-sm font-bold text-slate-900">Add to race day</h3></div><ScheduleFields draft={createDraft} setDraft={setCreateDraft} /><div className="mt-4 flex justify-end"><button type="submit" disabled={busyId === "new"} className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-[10px] font-bold uppercase tracking-[0.09em] text-white hover:bg-slate-700 disabled:opacity-50">{busyId === "new" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{busyId === "new" ? "Adding" : "Add schedule item"}</button></div></form>
  </div>;
}

function ScheduleEditRow({ draft, setDraft, busy, onCancel, onSave }: { draft: ScheduleDraft; setDraft: (draft: ScheduleDraft) => void; busy: boolean; onCancel: () => void; onSave: () => void }) { return <div className="bg-[#f7f8ff] px-5 py-5"><p className="mb-4 text-[10px] font-bold uppercase tracking-[0.13em] text-[#3155ff]">Editing race-day moment</p><ScheduleFields draft={draft} setDraft={setDraft} /><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onCancel} disabled={busy} className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-600">Discard</button><button type="button" onClick={onSave} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#3155ff] px-4 text-[10px] font-bold uppercase tracking-[0.08em] text-white disabled:opacity-50">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{busy ? "Saving" : "Save schedule"}</button></div></div>; }
function ScheduleFields({ draft, setDraft }: { draft: ScheduleDraft; setDraft: (draft: ScheduleDraft) => void }) { const update = <K extends keyof ScheduleDraft>(key: K, value: ScheduleDraft[K]) => setDraft({ ...draft, [key]: value }); return <div className="grid gap-3 sm:grid-cols-[120px_minmax(180px,.8fr)_minmax(220px,1.4fr)_100px]"><Labeled label="Time"><input aria-label="Schedule time" type="time" value={draft.time} onChange={(event) => update("time", event.target.value)} className={inputClass} /></Labeled><Labeled label="Title"><input aria-label="Schedule title" maxLength={200} value={draft.title} onChange={(event) => update("title", event.target.value)} className={inputClass} placeholder="Flag-off — 10K" /></Labeled><Labeled label="Runner notes"><input aria-label="Schedule description" maxLength={1000} value={draft.description} onChange={(event) => update("description", event.target.value)} className={inputClass} placeholder="Assemble at start corral A" /></Labeled><Labeled label="Order"><input aria-label="Schedule order" type="number" min="0" value={draft.sort_order} onChange={(event) => update("sort_order", event.target.value)} className={inputClass} /></Labeled></div>; }
function Labeled({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><span className="text-[10px] font-bold uppercase tracking-[0.09em] text-slate-500">{label}</span><span className="mt-1 block">{children}</span></label>; }
