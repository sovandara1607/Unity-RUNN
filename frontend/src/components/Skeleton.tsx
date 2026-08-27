import React from "react";

// Skeleton is a shimmering placeholder block. Compose page-shaped
// loaders from these so layout doesn't jump when data arrives.
// tone="dark" (default) is for dark backgrounds; tone="light" for
// light surfaces.
export function Skeleton({
  className = "",
  tone = "dark",
}: {
  className?: string;
  tone?: "dark" | "light";
}) {
  const base = tone === "light" ? "bg-slate-200/80" : "bg-white/10";
  return <div aria-hidden className={`animate-pulse rounded-lg ${base} ${className}`} />;
}

// SkeletonText draws a few lines of "text" with the last one shorter.
export function SkeletonText({ lines = 3, className = "", tone = "dark" }: { lines?: number; className?: string; tone?: "dark" | "light" }) {
  return (
    <div className={`space-y-2.5 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} tone={tone} className={`h-3.5 ${i === lines - 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}

// SkeletonTable mimics a data table: header bar plus N rows of
// evenly spaced cell placeholders. Light tone by default — most
// tables live on white admin surfaces.
export function SkeletonTable({ rows = 6, cols = 5, className = "", tone = "light" }: { rows?: number; cols?: number; className?: string; tone?: "dark" | "light" }) {
  return (
    <div className={`divide-y divide-slate-100 ${className}`} aria-hidden>
      <div className="flex gap-4 px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} tone={tone} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3.5">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} tone={tone} className={`h-4 flex-1 ${c === 0 ? "max-w-[120px]" : ""}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

// SkeletonCards draws N rounded card placeholders in the standard
// responsive grid used across the app.
export function SkeletonCards({ count = 6, className = "", itemClassName = "h-40", tone = "dark" }: { count?: number; className?: string; itemClassName?: string; tone?: "dark" | "light" }) {
  return (
    <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 ${className}`} aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} tone={tone} className={itemClassName} />
      ))}
    </div>
  );
}
