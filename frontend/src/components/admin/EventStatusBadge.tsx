import React from "react";
import type { EventStatus } from "../../types";

const statusConfig: Record<
  EventStatus,
  { label: string; bg: string; text: string }
> = {
  DRAFT: { label: "Draft", bg: "bg-black/[0.06]", text: "text-black/55" },
  PUBLISHED: { label: "Published", bg: "bg-[#3155ff]/10", text: "text-[#2644d6]" },
  REGISTRATION_OPEN: { label: "Open", bg: "bg-[#d9ff00]", text: "text-black" },
  REGISTRATION_CLOSED: { label: "Closed", bg: "bg-[#ff5c35]/15", text: "text-[#b92e10]" },
  COMPLETED: { label: "Complete", bg: "bg-[#151515]", text: "text-white" },
  CANCELLED: { label: "Cancelled", bg: "bg-rose-100", text: "text-rose-700" },
  ARCHIVED: { label: "Archived", bg: "bg-zinc-200", text: "text-zinc-600" },
};

export function EventStatusBadge({ status }: { status: EventStatus }) {
  const config = statusConfig[status] || { label: status, bg: "bg-slate-100", text: "text-slate-700" };

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 font-mono text-[8px] font-black uppercase tracking-[0.12em] ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
}
