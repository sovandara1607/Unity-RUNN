import type { StatusTone } from "../../lib/eventFormat";

/**
 * One chip for the three status vocabularies that used to disagree across the site.
 * The label comes from lib/eventFormat; this only owns the treatment.
 *
 * `chip`  -- the squared black plate with a brand-coloured left rule (home, /events)
 * `pill`  -- the tinted rounded pill (event detail)
 */

/* The left rule carries the status so a grid of cards is scannable without reading each
   label. /events already did this; the homepage always used the brand colour, so the same
   chip meant two different things depending on the page. */
const RULE: Record<StatusTone, string> = {
  open: "#65d69e",
  closed: "#f1b84b",
  soon: "var(--brand)",
  done: "rgba(255,255,255,0.4)",
  cancelled: "#ff667f",
};

const PILL: Record<StatusTone, string> = {
  open: "bg-emerald-400/20 text-emerald-300",
  closed: "bg-amber-400/20 text-amber-300",
  soon: "bg-white/10 text-white/70",
  done: "bg-white/10 text-white/70",
  cancelled: "bg-rose-400/20 text-rose-300",
};

type Props = {
  tone: StatusTone;
  variant?: "chip" | "pill";
  children: React.ReactNode;
  className?: string;
};

export function StatusChip({ tone, variant = "chip", children, className = "" }: Props) {
  if (variant === "pill") {
    return (
      <span className={`inline-flex items-center rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] ${PILL[tone]} ${className}`}>
        {children}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center border border-white/20 border-l-[5px] bg-black/90 px-3.5 py-2.5 font-mono text-[9px] font-black uppercase tracking-[0.16em] text-white ${className}`}
      style={{ borderLeftColor: RULE[tone] }}
    >
      {children}
    </span>
  );
}
