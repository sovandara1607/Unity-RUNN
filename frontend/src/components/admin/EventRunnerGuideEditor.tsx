import { useState, type FormEvent, type ReactNode } from "react";
import { BookOpenCheck, Check, LoaderCircle, Pencil, Plus, Save, ShieldCheck, Trash2, X } from "lucide-react";
import { api } from "../../lib/api";
import type { EventFAQ, EventRule } from "../../types";
import { useAlerts } from "../alerts/AlertSystem";

const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#3155ff] focus:ring-2 focus:ring-[#3155ff]/15";

interface FAQDraft { question: string; answer: string; sort_order: string }
interface RuleDraft { rule: string; sort_order: string }

const emptyFAQ: FAQDraft = { question: "", answer: "", sort_order: "1" };
const emptyRule: RuleDraft = { rule: "", sort_order: "1" };
const nextOrder = (items: Array<{ sort_order: number }>) => String(Math.max(0, ...items.map((item) => item.sort_order)) + 1);

export function EventRunnerGuideEditor({ eventId, faqs, rules, onFAQsChange, onRulesChange }: {
  eventId: string;
  faqs: EventFAQ[];
  rules: EventRule[];
  onFAQsChange: (faqs: EventFAQ[]) => void;
  onRulesChange: (rules: EventRule[]) => void;
}) {
  return (
    <div className="space-y-5">
      <header className="overflow-hidden rounded-2xl bg-[#151515] text-white shadow-sm">
        <div className="grid gap-6 p-6 sm:p-7 lg:grid-cols-[minmax(0,1.35fr)_minmax(240px,.65fr)] lg:items-end">
          <div>
            <p className="font-mono text-[9px] font-black uppercase tracking-[0.17em] text-[#d9ff00]">Runner briefing</p>
            <h2 className="mt-3 text-2xl font-black tracking-[-0.035em] sm:text-3xl">Answer doubt before race day.</h2>
            <p className="mt-3 max-w-2xl text-xs font-medium leading-5 text-white/55">Publish practical answers and participation rules directly to the event page. The number beside each item controls its reading order.</p>
          </div>
          <dl className="grid grid-cols-2 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
            <GuideMetric label="Answers" value={faqs.length} />
            <GuideMetric label="Rules" value={rules.length} />
          </dl>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
        <FAQEditor eventId={eventId} items={faqs} onChange={onFAQsChange} />
        <RuleEditor eventId={eventId} items={rules} onChange={onRulesChange} />
      </div>
    </div>
  );
}

function FAQEditor({ eventId, items, onChange }: { eventId: string; items: EventFAQ[]; onChange: (items: EventFAQ[]) => void }) {
  const alerts = useAlerts();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<FAQDraft>(emptyFAQ);
  const [createDraft, setCreateDraft] = useState<FAQDraft>(() => ({ ...emptyFAQ, sort_order: nextOrder(items) }));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order || a.question.localeCompare(b.question));

  const add = async (event: FormEvent) => {
    event.preventDefault();
    if (!createDraft.question.trim() || !createDraft.answer.trim()) {
      alerts.notify({ tone: "error", title: "FAQ not added", message: "Add both the runner question and its answer." });
      return;
    }
    setBusyId("new-faq");
    try {
      const created = await api.createFAQ(eventId, { question: createDraft.question.trim(), answer: createDraft.answer.trim(), sort_order: Number.parseInt(createDraft.sort_order, 10) || 0 });
      const next = [...items, created];
      onChange(next);
      setCreateDraft({ ...emptyFAQ, sort_order: nextOrder(next) });
      alerts.notify({ tone: "success", title: "FAQ published", message: `${created.question} is now in the runner guide.` });
    } catch (caught) {
      alerts.notify({ tone: "error", title: "FAQ not added", message: caught instanceof Error ? caught.message : "Could not add this answer." });
    } finally { setBusyId(null); }
  };

  const save = async (id: string) => {
    if (!draft.question.trim() || !draft.answer.trim()) {
      alerts.notify({ tone: "error", title: "FAQ not saved", message: "The question and answer cannot be empty." });
      return;
    }
    setBusyId(id);
    try {
      const updated = await api.updateFAQ(eventId, id, { question: draft.question.trim(), answer: draft.answer.trim(), sort_order: Number.parseInt(draft.sort_order, 10) || 0 });
      onChange(items.map((item) => item.id === id ? updated : item));
      setEditingId(null);
      alerts.notify({ tone: "success", title: "FAQ saved", message: "The public runner guide is up to date." });
    } catch (caught) {
      alerts.notify({ tone: "error", title: "FAQ not saved", message: caught instanceof Error ? caught.message : "Could not update this answer." });
    } finally { setBusyId(null); }
  };

  const remove = async (item: EventFAQ) => {
    if (deletingId !== item.id) { setDeletingId(item.id); return; }
    setBusyId(item.id);
    try {
      await api.deleteFAQ(eventId, item.id);
      onChange(items.filter((current) => current.id !== item.id));
      setDeletingId(null);
      alerts.notify({ tone: "success", title: "FAQ removed", message: "The answer is no longer shown publicly." });
    } catch (caught) {
      alerts.notify({ tone: "error", title: "FAQ not removed", message: caught instanceof Error ? caught.message : "Could not remove this answer." });
    } finally { setBusyId(null); }
  };

  return (
    <GuideSection icon={<BookOpenCheck className="h-4 w-4" />} eyebrow="Before race day" title="Runner questions" count={items.length}>
      {sorted.length === 0 ? <EmptyGuide copy="No answers published yet. Start with parking, bib collection, or bag drop." /> : (
        <div className="divide-y divide-slate-100">
          {sorted.map((item) => editingId === item.id ? (
            <div key={item.id} className="bg-[#f7f8ff] p-5">
              <FAQFields draft={draft} setDraft={setDraft} prefix="Edit FAQ" />
              <EditorActions busy={busyId === item.id} onCancel={() => setEditingId(null)} onSave={() => save(item.id)} saveLabel="Save FAQ" />
            </div>
          ) : (
            <article key={item.id} className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 p-5">
              <OrderMark order={item.sort_order} />
              <div className="min-w-0"><h4 className="text-sm font-bold text-slate-900">{item.question}</h4><p className="mt-1.5 text-xs leading-5 text-slate-500">{item.answer}</p><RowActions label={item.question} deleting={deletingId === item.id} busy={busyId === item.id} onEdit={() => { setEditingId(item.id); setDraft({ question: item.question, answer: item.answer, sort_order: String(item.sort_order) }); setDeletingId(null); }} onRemove={() => remove(item)} onKeep={() => setDeletingId(null)} /></div>
            </article>
          ))}
        </div>
      )}
      <form onSubmit={add} className="border-t border-dashed border-slate-200 bg-slate-50/70 p-5">
        <p className="mb-3 text-[9px] font-black uppercase tracking-[0.14em] text-[#3155ff]">Add an answer</p>
        <FAQFields draft={createDraft} setDraft={setCreateDraft} prefix="New FAQ" />
        <AddButton busy={busyId === "new-faq"} label="Add FAQ" />
      </form>
    </GuideSection>
  );
}

function RuleEditor({ eventId, items, onChange }: { eventId: string; items: EventRule[]; onChange: (items: EventRule[]) => void }) {
  const alerts = useAlerts();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<RuleDraft>(emptyRule);
  const [createDraft, setCreateDraft] = useState<RuleDraft>(() => ({ ...emptyRule, sort_order: nextOrder(items) }));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order || a.rule.localeCompare(b.rule));

  const add = async (event: FormEvent) => {
    event.preventDefault();
    if (!createDraft.rule.trim()) { alerts.notify({ tone: "error", title: "Rule not added", message: "Write the instruction runners need to follow." }); return; }
    setBusyId("new-rule");
    try {
      const created = await api.createRule(eventId, { rule: createDraft.rule.trim(), sort_order: Number.parseInt(createDraft.sort_order, 10) || 0 });
      const next = [...items, created];
      onChange(next);
      setCreateDraft({ ...emptyRule, sort_order: nextOrder(next) });
      alerts.notify({ tone: "success", title: "Rule published", message: "The instruction is now visible on the event page." });
    } catch (caught) { alerts.notify({ tone: "error", title: "Rule not added", message: caught instanceof Error ? caught.message : "Could not add this rule." }); }
    finally { setBusyId(null); }
  };

  const save = async (id: string) => {
    if (!draft.rule.trim()) { alerts.notify({ tone: "error", title: "Rule not saved", message: "The instruction cannot be empty." }); return; }
    setBusyId(id);
    try {
      const updated = await api.updateRule(eventId, id, { rule: draft.rule.trim(), sort_order: Number.parseInt(draft.sort_order, 10) || 0 });
      onChange(items.map((item) => item.id === id ? updated : item));
      setEditingId(null);
      alerts.notify({ tone: "success", title: "Rule saved", message: "The public runner guide is up to date." });
    } catch (caught) { alerts.notify({ tone: "error", title: "Rule not saved", message: caught instanceof Error ? caught.message : "Could not update this rule." }); }
    finally { setBusyId(null); }
  };

  const remove = async (item: EventRule) => {
    if (deletingId !== item.id) { setDeletingId(item.id); return; }
    setBusyId(item.id);
    try {
      await api.deleteRule(eventId, item.id);
      onChange(items.filter((current) => current.id !== item.id));
      setDeletingId(null);
      alerts.notify({ tone: "success", title: "Rule removed", message: "The instruction is no longer shown publicly." });
    } catch (caught) { alerts.notify({ tone: "error", title: "Rule not removed", message: caught instanceof Error ? caught.message : "Could not remove this rule." }); }
    finally { setBusyId(null); }
  };

  return (
    <GuideSection icon={<ShieldCheck className="h-4 w-4" />} eyebrow="On the course" title="Participation rules" count={items.length}>
      {sorted.length === 0 ? <EmptyGuide copy="No rules published yet. Add the instructions needed for a fair, safe race." /> : (
        <div className="divide-y divide-slate-100">
          {sorted.map((item) => editingId === item.id ? (
            <div key={item.id} className="bg-[#f7f8ff] p-5"><RuleFields draft={draft} setDraft={setDraft} prefix="Edit rule" /><EditorActions busy={busyId === item.id} onCancel={() => setEditingId(null)} onSave={() => save(item.id)} saveLabel="Save rule" /></div>
          ) : (
            <article key={item.id} className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 p-5"><OrderMark order={item.sort_order} /><div><p className="text-sm font-semibold leading-5 text-slate-700">{item.rule}</p><RowActions label={item.rule} deleting={deletingId === item.id} busy={busyId === item.id} onEdit={() => { setEditingId(item.id); setDraft({ rule: item.rule, sort_order: String(item.sort_order) }); setDeletingId(null); }} onRemove={() => remove(item)} onKeep={() => setDeletingId(null)} /></div></article>
          ))}
        </div>
      )}
      <form onSubmit={add} className="border-t border-dashed border-slate-200 bg-slate-50/70 p-5"><p className="mb-3 text-[9px] font-black uppercase tracking-[0.14em] text-[#3155ff]">Add an instruction</p><RuleFields draft={createDraft} setDraft={setCreateDraft} prefix="New rule" /><AddButton busy={busyId === "new-rule"} label="Add rule" /></form>
    </GuideSection>
  );
}

function FAQFields({ draft, setDraft, prefix }: { draft: FAQDraft; setDraft: (draft: FAQDraft) => void; prefix: string }) {
  return <div className="grid gap-3"><Labeled label="Question"><input aria-label={`${prefix} question`} maxLength={300} value={draft.question} onChange={(event) => setDraft({ ...draft, question: event.target.value })} className={inputClass} placeholder="Where can I collect my bib?" /></Labeled><Labeled label="Answer"><textarea aria-label={`${prefix} answer`} maxLength={3000} rows={3} value={draft.answer} onChange={(event) => setDraft({ ...draft, answer: event.target.value })} className={`${inputClass} resize-y`} placeholder="Collect it from the north gate…" /></Labeled><Labeled label="Reading order"><input aria-label={`${prefix} order`} type="number" min="0" value={draft.sort_order} onChange={(event) => setDraft({ ...draft, sort_order: event.target.value })} className={`${inputClass} max-w-24`} /></Labeled></div>;
}

function RuleFields({ draft, setDraft, prefix }: { draft: RuleDraft; setDraft: (draft: RuleDraft) => void; prefix: string }) {
  return <div className="grid gap-3"><Labeled label="Runner instruction"><textarea aria-label={`${prefix} text`} maxLength={1000} rows={3} value={draft.rule} onChange={(event) => setDraft({ ...draft, rule: event.target.value })} className={`${inputClass} resize-y`} placeholder="Keep your race bib visible…" /></Labeled><Labeled label="Reading order"><input aria-label={`${prefix} order`} type="number" min="0" value={draft.sort_order} onChange={(event) => setDraft({ ...draft, sort_order: event.target.value })} className={`${inputClass} max-w-24`} /></Labeled></div>;
}

function GuideSection({ icon, eyebrow, title, count, children }: { icon: ReactNode; eyebrow: string; title: string; count: number; children: ReactNode }) { return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><p className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.14em] text-[#3155ff]">{icon}{eyebrow}</p><h3 className="mt-1.5 text-base font-black text-slate-900">{title}</h3></div><span className="grid h-9 min-w-9 place-items-center rounded-full bg-slate-100 px-3 font-mono text-[10px] font-black text-slate-500">{count}</span></div>{children}</section>; }
function GuideMetric({ label, value }: { label: string; value: number }) { return <div className="p-4 text-center first:border-r first:border-white/10"><dt className="font-mono text-[8px] font-black uppercase tracking-[0.14em] text-white/35">{label}</dt><dd className="mt-1 text-2xl font-black text-[#d9ff00]">{value}</dd></div>; }
function EmptyGuide({ copy }: { copy: string }) { return <div className="p-7 text-center text-xs font-semibold leading-5 text-slate-400">{copy}</div>; }
function OrderMark({ order }: { order: number }) { return <span className="grid h-8 w-8 place-items-center rounded-full bg-[#eef1ff] font-mono text-[9px] font-black text-[#3155ff]">{String(order).padStart(2, "0")}</span>; }
function Labeled({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><span className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">{label}</span><span className="mt-1 block">{children}</span></label>; }
function AddButton({ busy, label }: { busy: boolean; label: string }) { return <div className="mt-4 flex justify-end"><button type="submit" disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-[10px] font-black uppercase tracking-[0.09em] text-white transition hover:bg-slate-700 disabled:opacity-50">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{busy ? "Adding" : label}</button></div>; }
function EditorActions({ busy, onCancel, onSave, saveLabel }: { busy: boolean; onCancel: () => void; onSave: () => void; saveLabel: string }) { return <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onCancel} disabled={busy} className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-[9px] font-black uppercase tracking-[0.08em] text-slate-500">Discard</button><button type="button" onClick={onSave} disabled={busy} className="inline-flex h-9 items-center gap-2 rounded-xl bg-[#3155ff] px-3 text-[9px] font-black uppercase tracking-[0.08em] text-white disabled:opacity-50">{busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}{busy ? "Saving" : saveLabel}</button></div>; }
function RowActions({ label, deleting, busy, onEdit, onRemove, onKeep }: { label: string; deleting: boolean; busy: boolean; onEdit: () => void; onRemove: () => void; onKeep: () => void }) { return <div className="mt-3 flex flex-wrap items-center gap-2"><button type="button" onClick={onEdit} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-[9px] font-black uppercase tracking-[0.08em] text-slate-500 hover:border-slate-400 hover:text-slate-900"><Pencil className="h-3 w-3" />Edit</button>{deleting ? <><button type="button" disabled={busy} onClick={onRemove} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-rose-600 px-2.5 text-[9px] font-black uppercase tracking-[0.08em] text-white disabled:opacity-50">{busy ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}Confirm remove</button><button type="button" onClick={onKeep} aria-label={`Keep ${label}`} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-400"><X className="h-3 w-3" /></button></> : <button type="button" onClick={onRemove} aria-label={`Remove ${label}`} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-3 w-3" /></button>}</div>; }
