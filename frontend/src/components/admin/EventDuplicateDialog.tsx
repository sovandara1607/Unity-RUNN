import { useState, type FormEvent } from "react";
import { ArrowRight, CalendarDays, Check, CopyPlus, LoaderCircle, RotateCcw, X } from "lucide-react";
import type { Event } from "../../types";

const inputClass = "mt-2 w-full rounded-xl border border-black/15 bg-white px-4 py-3 text-sm font-semibold outline-none transition focus:border-[#3155ff] focus:ring-4 focus:ring-[#3155ff]/10";

function nextEdition(source: Event) {
  const sourceDate = new Date(source.event_date);
  const nextDate = Number.isFinite(sourceDate.getTime()) ? new Date(sourceDate) : new Date();
  nextDate.setUTCFullYear(nextDate.getUTCFullYear() + 1);
  const sourceYear = Number.isFinite(sourceDate.getTime()) ? String(sourceDate.getUTCFullYear()) : "";
  const nextYear = String(nextDate.getUTCFullYear());
  return {
    date: nextDate.toISOString().slice(0, 10),
    name: sourceYear && source.name.includes(sourceYear)
      ? source.name.replace(sourceYear, nextYear)
      : `${source.name} — Next Edition`,
  };
}

export function EventDuplicateDialog({ source, busy, onClose, onDuplicate }: {
  source: Event;
  busy: boolean;
  onClose: () => void;
  onDuplicate: (input: { name: string; event_date: string }) => void;
}) {
  const defaults = nextEdition(source);
  const [name, setName] = useState(defaults.name);
  const [eventDate, setEventDate] = useState(defaults.date);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !eventDate) return;
    onDuplicate({ name: name.trim(), event_date: eventDate });
  };

  return (
    <div className="fixed inset-0 z-[110] grid place-items-center overflow-y-auto bg-black/65 p-4 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-labelledby="duplicate-event-title">
      <form onSubmit={submit} className="my-auto w-full max-w-2xl overflow-hidden rounded-[28px] bg-white shadow-2xl">
        <div className="relative overflow-hidden bg-[#151515] p-6 text-white sm:p-7">
          <div className="pointer-events-none absolute -right-10 -top-14 h-44 w-44 rounded-full border border-white/10" />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 font-mono text-[9px] font-black uppercase tracking-[0.16em] text-[#d9ff00]"><CopyPlus className="h-3.5 w-3.5" />Next-edition relay</p>
              <h2 id="duplicate-event-title" className="mt-3 text-2xl font-black tracking-[-0.035em] sm:text-3xl">Carry the race forward.</h2>
              <p className="mt-2 max-w-xl text-xs font-semibold leading-5 text-white/50">Reuse the work that belongs to the course. Registration state starts clean.</p>
            </div>
            <button type="button" onClick={onClose} disabled={busy} aria-label="Close duplication review" className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/15 text-white/55 transition hover:border-white/40 hover:text-white disabled:opacity-40"><X className="h-4 w-4" /></button>
          </div>
          <div className="relative mt-6 grid grid-cols-[minmax(0,1fr)_32px_minmax(0,1fr)] items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="min-w-0"><p className="font-mono text-[8px] font-black uppercase tracking-[0.13em] text-white/35">Source event</p><p className="mt-1 truncate text-sm font-black">{source.name}</p></div>
            <ArrowRight className="h-4 w-4 justify-self-center text-[#d9ff00]" />
            <div className="min-w-0 text-right"><p className="font-mono text-[8px] font-black uppercase tracking-[0.13em] text-white/35">New draft</p><p className="mt-1 truncate text-sm font-black text-[#d9ff00]">{name || "Untitled edition"}</p></div>
          </div>
        </div>

        <div className="p-6 sm:p-7">
          <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_180px]">
            <label className="block"><span className="text-[10px] font-black uppercase tracking-[0.11em] text-black/50">New event name</span><input aria-label="New event name" required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} className={inputClass} /></label>
            <label className="block"><span className="text-[10px] font-black uppercase tracking-[0.11em] text-black/50">Race date</span><span className="relative block"><CalendarDays className="pointer-events-none absolute left-3.5 top-[22px] h-4 w-4 text-black/35" /><input aria-label="New event date" type="date" required value={eventDate} onChange={(event) => setEventDate(event.target.value)} className={`${inputClass} pl-10`} /></span></label>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <ReviewCard icon={<Check className="h-3.5 w-3.5" />} tone="copy" title="Travels with the event" items={["Artwork and event details", "Categories, prices, and capacity", "Race-day schedule", "FAQs and participation rules"]} />
            <ReviewCard icon={<RotateCcw className="h-3.5 w-3.5" />} tone="reset" title="Starts fresh" items={["Draft lifecycle status", "Registration open and close dates", "Category entry cutoffs", "Registrants, payments, and tickets"]} />
          </div>

          <div className="mt-7 flex flex-col-reverse gap-2 border-t border-black/10 pt-5 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={busy} className="h-11 rounded-full border border-black/15 px-5 text-[10px] font-black uppercase tracking-[0.1em] text-black/55 transition hover:border-black hover:text-black disabled:opacity-40">Keep current list</button>
            <button type="submit" disabled={busy || !name.trim() || !eventDate} className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#151515] px-5 text-[10px] font-black uppercase tracking-[0.1em] text-white transition hover:bg-[#3155ff] disabled:opacity-40">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CopyPlus className="h-4 w-4" />}{busy ? "Building draft" : "Create next edition"}</button>
          </div>
        </div>
      </form>
    </div>
  );
}

function ReviewCard({ icon, tone, title, items }: { icon: React.ReactNode; tone: "copy" | "reset"; title: string; items: string[] }) {
  const style = tone === "copy" ? "border-emerald-200 bg-emerald-50/70 text-emerald-800" : "border-amber-200 bg-amber-50/70 text-amber-800";
  return <section className={`rounded-2xl border p-4 ${style}`}><h3 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.1em]">{icon}{title}</h3><ul className="mt-3 space-y-2">{items.map((item) => <li key={item} className="flex gap-2 text-[11px] font-semibold leading-4"><span aria-hidden>·</span><span>{item}</span></li>)}</ul></section>;
}
