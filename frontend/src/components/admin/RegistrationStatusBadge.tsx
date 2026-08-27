import React from "react";
import type { RegistrationStatus } from "../../types";

const regStatusConfig: Record<
  RegistrationStatus,
  { label: string; bg: string; text: string; dot: string }
> = {
  CONFIRMED: {
    label: "Confirmed",
    bg: "bg-[#d9ff00] text-black border-[#d9ff00]",
    text: "text-emerald-700",
    dot: "bg-black",
  },
  PENDING: {
    label: "Pending",
    bg: "bg-[#ff5c35]/10 text-[#a42c13] border-[#ff5c35]/30",
    text: "text-amber-700",
    dot: "bg-amber-500",
  },
  CANCELLED: {
    label: "Cancelled",
    bg: "bg-rose-50 text-rose-700 border-rose-200",
    text: "text-rose-700",
    dot: "bg-rose-500",
  },
  REFUNDED: {
    label: "Refunded",
    bg: "bg-slate-100 text-slate-700 border-slate-200",
    text: "text-slate-700",
    dot: "bg-slate-400",
  },
};

export function RegistrationStatusBadge({
  status,
}: {
  status: RegistrationStatus;
}) {
  const config = regStatusConfig[status] || {
    label: status,
    bg: "bg-gray-50 text-gray-700 border-gray-200",
    text: "text-gray-700",
    dot: "bg-gray-400",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[8px] font-black uppercase tracking-[0.1em] ${config.bg}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}
