import React, { type CSSProperties } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

interface AnnouncementStripProps {
  message: string;
  href?: string;
  color: string;
  compact?: boolean;
  interactive?: boolean;
}

export function AnnouncementStrip({ message, href, color, compact = false, interactive = true }: AnnouncementStripProps) {
  const duration = Math.max(24, Math.min(42, 20 + message.length * 0.16));
  const style = { backgroundColor: color, "--announcement-duration": `${duration}s` } as CSSProperties;

  const visualGroup = () => (
    <span className="announcement-strip__group flex shrink-0 items-center" aria-hidden="true">
      {[0, 1, 2].map((copy) => (
        <React.Fragment key={copy}>
          <span className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap font-black uppercase text-black ${compact ? "px-5 text-[8px] tracking-[0.12em]" : "px-8 text-[9px] tracking-[0.17em] sm:px-11"}`}>
            {message}
          </span>
          <span className="flex shrink-0 items-center gap-1.5" aria-hidden="true">
            <span className="h-px w-5 bg-black/35" />
            <RunnerSymbol className="h-3.5 w-3.5 shrink-0" color="#111111" />
            <span className="h-px w-5 bg-black/35" />
          </span>
        </React.Fragment>
      ))}
    </span>
  );

  const ticker = <span className="announcement-strip__track flex w-max items-center">{visualGroup()}{visualGroup()}</span>;
  const className = `announcement-strip group flex w-full items-stretch overflow-hidden text-black focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black ${compact ? "min-h-7" : "min-h-10 border-y border-black/15"}`;
  const contents = (
    <>
      <span className="sr-only">{message}</span>
      {!compact && (
        <span className="relative z-10 flex w-[92px] shrink-0 items-center gap-2 bg-[#111] px-3 text-[8px] font-black uppercase tracking-[0.15em] text-white sm:w-[132px] sm:px-5 sm:text-[9px]">
          <RunnerSymbol className="h-4 w-4 shrink-0" color={color} />
          <span className="sm:hidden">Notice</span><span className="hidden sm:inline">Race notice</span>
        </span>
      )}
      <span className={`announcement-strip__viewport flex min-w-0 flex-1 items-center overflow-hidden ${compact ? "py-1.5" : "py-2.5"}`}>{ticker}</span>
      {href && interactive && !compact && (
        <span className="relative z-10 flex w-10 shrink-0 items-center justify-center border-l border-black/20 bg-black/[0.06] transition-colors group-hover:bg-[#111] group-hover:text-white sm:w-[84px] sm:gap-1.5">
          <span className="hidden text-[8px] font-black uppercase tracking-[0.13em] sm:inline">Open</span>
          <ArrowUpRight className="h-3 w-3 shrink-0" />
        </span>
      )}
    </>
  );

  if (href && interactive) {
    return <Link href={href} className={className} style={style} aria-label={`${message}. Open announcement`}>{contents}</Link>;
  }
  return <div className={className} style={style} role="status" aria-label={message}>{contents}</div>;
}

function RunnerSymbol({ className, color }: { className: string; color: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" style={{ color }} aria-hidden="true">
      <path d="M13.5 5.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm-3.6 14.9 1-4.4 2.1 2v6h2v-7.5l-2.1-2 .6-3A7.3 7.3 0 0 0 18 13v-2c-1.7 0-3.1-.9-3.8-2.2l-1-1.6A2.45 2.45 0 0 0 11.1 6c-.3 0-.5.1-.8.1L5 8.3V13h2V9.6l1.8-.7-1.6 8L2.3 16l-.4 2 8 1.5Z" />
    </svg>
  );
}
