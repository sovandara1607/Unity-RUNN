import { useCallback, useEffect, useRef, useState, type ReactNode, type SyntheticEvent } from "react";
import { CalendarClock, CheckCircle2, LoaderCircle, Mail, Megaphone, Pencil, Radio, RefreshCw, Send, Trash2, Users, X } from "lucide-react";
import { api } from "../../lib/api";
import type { EventAutomation } from "../../types";
import { useAlerts } from "../alerts/AlertSystem";

type ComposerDraft = { name: string; message: string; sendAt: string };
type SchedulePreview = { item: EventAutomation | null; draft: ComposerDraft };
const emptyDraft: ComposerDraft = { name: "", message: "", sendAt: "" };
const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-[#3155ff] focus:ring-2 focus:ring-[#3155ff]/15";
const formatDate = (value?: string) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Draft — no send time";
const toLocalInput = (value: string | Date) => {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const initialMinimumSendAt = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() + 1);
  return toLocalInput(date);
};

export function EventAutomationEditor({ eventId }: { eventId: string }) {
  const { notify } = useAlerts();
  const [items, setItems] = useState<EventAutomation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [cancelCandidate, setCancelCandidate] = useState<EventAutomation | null>(null);
  const [editing, setEditing] = useState<EventAutomation | null>(null);
  const [preview, setPreview] = useState<SchedulePreview | null>(null);
  const [draft, setDraft] = useState<ComposerDraft>(emptyDraft);
  const [minimumSendAt] = useState(initialMinimumSendAt);
  const localMutation = useRef(0);

  const load = useCallback(async () => {
    const revision = localMutation.current;
    try {
      const loaded = await api.listEventAutomations(eventId);
      if (revision === localMutation.current) setItems(loaded);
    } catch (caught) {
      notify({ tone: "error", title: "Transmissions unavailable", message: caught instanceof Error ? caught.message : "Could not load automations." });
    } finally { setLoading(false); }
  }, [eventId, notify]);
  useEffect(() => { void load(); }, [load]);

  const resetComposer = () => { setEditing(null); setDraft(emptyDraft); };
  const validateDraft = (needsTime: boolean) => {
    if (!draft.name.trim() || !draft.message.trim()) {
      notify({ tone: "error", title: "Transmission incomplete", message: "Add a title and runner message." });
      return false;
    }
    if (needsTime && !draft.sendAt) {
      notify({ tone: "error", title: "Choose a send time", message: "Scheduled transmissions need a future date and time." });
      return false;
    }
    if (needsTime && new Date(draft.sendAt).getTime() < Date.now()) {
      notify({ tone: "error", title: "Choose a future time", message: "The send time has already passed." });
      return false;
    }
    return true;
  };

  const persist = async (schedule: boolean) => {
    setBusy(true);
    try {
      localMutation.current += 1;
      const payload = { name: draft.name.trim(), message: draft.message.trim(), send_at: schedule ? new Date(draft.sendAt).toISOString() : null };
      const saved = editing ? await api.updateEventAutomation(eventId, editing.id, payload) : await api.createEventAutomation(eventId, payload);
      setItems((current) => editing ? current.map((entry) => entry.id === saved.id ? saved : entry) : [saved, ...current]);
      resetComposer();
      setPreview(null);
      notify({
        tone: "success",
        title: schedule ? (editing ? "Transmission rescheduled" : "Transmission scheduled") : (editing ? "Draft updated" : "Draft saved"),
        message: schedule ? "It will be queued for confirmed runners at the selected time." : "The transmission remains inactive until you schedule it.",
      });
    } catch (caught) {
      notify({ tone: "error", title: "Transmission not saved", message: caught instanceof Error ? caught.message : "Could not save this automation." });
    } finally { setBusy(false); }
  };

  const saveDraft = async (event: SyntheticEvent) => { event.preventDefault(); if (validateDraft(false)) await persist(false); };
  const reviewSchedule = (event: SyntheticEvent) => { event.preventDefault(); if (validateDraft(true)) setPreview({ item: editing, draft: { ...draft } }); };
  const startEditing = (item: EventAutomation, retry = false) => {
	const retryAt = new Date(minimumSendAt);
	retryAt.setMinutes(retryAt.getMinutes() + 5);
    setEditing(item);
    setDraft({ name: item.name, message: item.message, sendAt: retry ? toLocalInput(retryAt) : item.send_at ? toLocalInput(item.send_at) : "" });
    document.getElementById("transmission-composer")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const cancel = async (item: EventAutomation) => {
    setCancelling(item.id);
    try {
      await api.cancelEventAutomation(eventId, item.id);
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: "CANCELLED" } : entry));
      if (editing?.id === item.id) resetComposer();
      setCancelCandidate(null);
      notify({ tone: "success", title: "Transmission cancelled", message: "It will remain in the timeline as an audit record." });
    } catch (caught) {
      notify({ tone: "error", title: "Could not cancel", message: caught instanceof Error ? caught.message : "Try again." });
    } finally { setCancelling(null); }
  };

  return <div className="space-y-5">
    <header className="overflow-hidden rounded-2xl bg-[#151515] text-white shadow-sm">
      <div className="grid gap-6 p-6 sm:p-7 lg:grid-cols-[minmax(0,1.35fr)_minmax(260px,.65fr)] lg:items-end">
        <div><p className="font-mono text-[9px] font-black uppercase tracking-[0.17em] text-[#d9ff00]">Transmission board</p><h2 className="mt-3 text-2xl font-black tracking-[-0.035em] sm:text-3xl">One message. Every confirmed runner.</h2><p className="mt-3 max-w-2xl text-xs font-medium leading-5 text-white/55">Schedule operational updates through email and Telegram. Delivery is durable, retried automatically, and visible in the Automation Center.</p></div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-[#d9ff00] text-black"><Users className="h-4 w-4" /></span><div><p className="font-mono text-[8px] font-black uppercase tracking-[0.14em] text-white/35">Locked audience</p><p className="mt-1 text-sm font-black">Confirmed runners only</p></div></div></div>
      </div>
    </header>

    <div className="grid gap-5 xl:grid-cols-[minmax(320px,.8fr)_minmax(0,1.2fr)] xl:items-start">
      <form id="transmission-composer" className={`scroll-mt-6 rounded-2xl border bg-white p-5 shadow-sm ${editing ? "border-[#3155ff]/35 ring-4 ring-[#3155ff]/5" : "border-slate-200"}`} onSubmit={reviewSchedule}>
        <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#eef1ff] text-[#3155ff]">{editing ? <Pencil className="h-4 w-4" /> : <Megaphone className="h-4 w-4" />}</span><div><p className="text-[9px] font-black uppercase tracking-[.14em] text-[#3155ff]">{editing ? `Editing ${editing.status.toLowerCase()}` : "New automation"}</p><h3 className="text-base font-black text-slate-900">{editing ? "Revise transmission" : "Compose transmission"}</h3></div></div>{editing && <button type="button" onClick={resetComposer} aria-label="Discard transmission edits" className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-400 hover:text-slate-900"><X className="h-4 w-4" /></button>}</div>
        <label className="mt-5 block"><span className="text-[9px] font-black uppercase tracking-[.1em] text-slate-500">Message title</span><input maxLength={120} required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className={`${inputClass} mt-1`} placeholder="Bib collection moved indoors" /></label>
        <label className="mt-4 block"><span className="text-[9px] font-black uppercase tracking-[.1em] text-slate-500">Runner message</span><textarea maxLength={1000} required rows={6} value={draft.message} onChange={(event) => setDraft({ ...draft, message: event.target.value })} className={`${inputClass} mt-1 resize-y`} placeholder="Tell runners what changed and what they need to do…" /><span className="mt-1 block text-right font-mono text-[9px] text-slate-400">{draft.message.length}/1000</span></label>
        <label className="mt-3 block"><span className="text-[9px] font-black uppercase tracking-[.1em] text-slate-500">Send date &amp; time</span><input type="datetime-local" min={minimumSendAt} value={draft.sendAt} onChange={(event) => setDraft({ ...draft, sendAt: event.target.value })} className={`${inputClass} mt-1`} /></label>
        <div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" disabled={busy || loading} onClick={(event) => void saveDraft(event)} className="h-10 rounded-xl border border-slate-200 px-4 text-[10px] font-black uppercase tracking-[.08em] text-slate-600 disabled:opacity-50">{editing ? "Save as draft" : "Save draft"}</button><button type="submit" disabled={busy || loading} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#3155ff] px-4 text-[10px] font-black uppercase tracking-[.08em] text-white disabled:opacity-50"><Send className="h-4 w-4" />Review &amp; schedule</button></div>
      </form>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><p className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[.14em] text-[#3155ff]"><Radio className="h-4 w-4" />Event timeline</p><h3 className="mt-1 text-base font-black text-slate-900">Transmission log</h3></div><span className="rounded-full bg-slate-100 px-3 py-2 font-mono text-[9px] font-black text-slate-500">{items.length} total</span></div>
        {loading ? <div className="grid place-items-center p-12"><LoaderCircle className="h-5 w-5 animate-spin text-[#3155ff]" /></div> : items.length === 0 ? <div className="p-10 text-center"><CalendarClock className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-3 text-xs font-semibold text-slate-400">No transmissions yet. Schedule the first runner briefing.</p></div> : <div className="divide-y divide-slate-100">{items.map((item) => <TransmissionRow key={item.id} item={item} active={editing?.id === item.id} busy={cancelling === item.id} onEdit={() => startEditing(item)} onRetry={() => startEditing(item, true)} onCancel={() => setCancelCandidate(item)} />)}</div>}
      </section>
    </div>

    {preview && <ScheduleDialog preview={preview} busy={busy} onClose={() => setPreview(null)} onConfirm={() => void persist(true)} />}
    {cancelCandidate && <CancelDialog item={cancelCandidate} busy={cancelling === cancelCandidate.id} onClose={() => setCancelCandidate(null)} onConfirm={() => void cancel(cancelCandidate)} />}
  </div>;
}

function TransmissionRow({ item, active, busy, onEdit, onRetry, onCancel }: { item: EventAutomation; active: boolean; busy: boolean; onEdit: () => void; onRetry: () => void; onCancel: () => void }) {
  const editable = ["DRAFT", "SCHEDULED", "FAILED"].includes(item.status);
  return <article className={`p-5 transition ${active ? "bg-[#f7f8ff]" : "bg-white"}`}><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><StatusChip status={item.status} /><span className="font-mono text-[9px] text-slate-400">{formatDate(item.send_at || item.sent_at)}</span></div><h4 className="mt-2 text-sm font-black text-slate-900">{item.name}</h4><p className="mt-1 whitespace-pre-line text-xs leading-5 text-slate-500">{item.message}</p>{item.status === "SENT" && <p className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Queued for {item.sent_count} confirmed runners</p>}{item.last_error && <p className="mt-2 text-[10px] font-semibold text-rose-600">{item.last_error}</p>}</div>{editable && <div className="mt-3 flex flex-wrap items-center gap-2">{item.status === "FAILED" ? <button type="button" onClick={onRetry} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-rose-50 px-2.5 text-[9px] font-black uppercase tracking-[.08em] text-rose-700 hover:bg-rose-100"><RefreshCw className="h-3 w-3" />Retry setup</button> : <button type="button" onClick={onEdit} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-[9px] font-black uppercase tracking-[.08em] text-slate-500 hover:border-slate-400 hover:text-slate-900"><Pencil className="h-3 w-3" />Edit</button>}<button type="button" aria-label={`Cancel ${item.name}`} disabled={busy} onClick={onCancel} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50">{busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}</button></div>}</article>;
}

function ScheduleDialog({ preview, busy, onClose, onConfirm }: { preview: SchedulePreview; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  return <div className="fixed inset-0 z-[90] grid place-items-center bg-black/55 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}><section role="dialog" aria-modal="true" aria-labelledby="schedule-preview-title" className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-[#151515] text-white shadow-2xl"><div className="border-b border-white/10 p-5"><p className="font-mono text-[9px] font-black uppercase tracking-[.16em] text-[#d9ff00]">Final check</p><h3 id="schedule-preview-title" className="mt-2 text-xl font-black">Schedule this transmission?</h3></div><div className="space-y-4 p-5"><div className="rounded-xl bg-white/[.06] p-4"><p className="text-sm font-black">{preview.draft.name}</p><p className="mt-2 whitespace-pre-line text-xs leading-5 text-white/60">{preview.draft.message}</p></div><dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-white/10"><PreviewFact icon={<CalendarClock className="h-4 w-4" />} label="Send at" value={formatDate(new Date(preview.draft.sendAt).toISOString())} /><PreviewFact icon={<Users className="h-4 w-4" />} label="Audience" value="Confirmed runners" /><PreviewFact icon={<Mail className="h-4 w-4" />} label="Primary" value="Email" /><PreviewFact icon={<Send className="h-4 w-4" />} label="Mirror" value="Telegram enabled" /></dl><p className="text-[10px] font-medium leading-4 text-white/40">The runner list is resolved at send time. You can edit or cancel this transmission until processing begins.</p></div><div className="flex justify-end gap-2 border-t border-white/10 p-4"><button type="button" autoFocus disabled={busy} onClick={onClose} className="h-10 rounded-xl border border-white/15 px-4 text-[10px] font-black uppercase tracking-[.08em] text-white/65">Keep editing</button><button type="button" disabled={busy} onClick={onConfirm} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#d9ff00] px-4 text-[10px] font-black uppercase tracking-[.08em] text-black disabled:opacity-50">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{preview.item ? "Confirm reschedule" : "Confirm schedule"}</button></div></section></div>;
}

function CancelDialog({ item, busy, onClose, onConfirm }: { item: EventAutomation; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  return <div className="fixed inset-0 z-[90] grid place-items-center bg-black/55 p-4" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="cancel-transmission-title" className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"><p className="text-[9px] font-black uppercase tracking-[.14em] text-rose-600">Stop transmission</p><h3 id="cancel-transmission-title" className="mt-2 text-lg font-black text-slate-900">Cancel “{item.name}”?</h3><p className="mt-2 text-xs leading-5 text-slate-500">It will not be sent. The cancelled record stays in the timeline for accountability.</p><div className="mt-5 flex justify-end gap-2"><button type="button" autoFocus disabled={busy} onClick={onClose} className="h-10 rounded-xl border border-slate-200 px-4 text-[10px] font-black uppercase tracking-[.08em] text-slate-600">Keep it</button><button type="button" disabled={busy} onClick={onConfirm} className="inline-flex h-10 items-center gap-2 rounded-xl bg-rose-600 px-4 text-[10px] font-black uppercase tracking-[.08em] text-white disabled:opacity-50">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Cancel transmission</button></div></section></div>;
}

function PreviewFact({ icon, label, value }: { icon: ReactNode; label: string; value: string }) { return <div className="bg-[#1c1c1c] p-3"><div className="text-[#d9ff00]">{icon}</div><dt className="mt-2 font-mono text-[8px] font-black uppercase tracking-[.12em] text-white/35">{label}</dt><dd className="mt-1 text-[10px] font-bold text-white/75">{value}</dd></div>; }
function StatusChip({ status }: { status: EventAutomation["status"] }) { const colors: Record<EventAutomation["status"], string> = { DRAFT: "bg-slate-100 text-slate-600", SCHEDULED: "bg-blue-50 text-blue-700", PROCESSING: "bg-amber-50 text-amber-700", SENT: "bg-emerald-50 text-emerald-700", FAILED: "bg-rose-50 text-rose-700", CANCELLED: "bg-slate-100 text-slate-400" }; return <span className={`rounded-full px-2 py-1 font-mono text-[8px] font-black uppercase tracking-[.1em] ${colors[status]}`}>{status}</span>; }
