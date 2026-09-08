import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/**
 * The pill action, which was hand-written four times with four different results:
 * index.tsx (focus ring), about.tsx (no focus ring), ClubCarousel.tsx (larger text, scale
 * hover) and SportHeader.tsx (tighter padding, no focus ring).
 *
 * The `brand` tone reads its foreground from --brand-ink rather than assuming black, so a
 * dark brand colour chosen in /admin/public-site no longer produces black-on-dark text.
 * Focus is handled by the global :focus-visible outline in globals.css.
 */

type Tone = "brand" | "solid" | "outline" | "ghost";
type Size = "sm" | "md" | "lg";

const TONE: Record<Tone, string> = {
  brand: "bg-[var(--brand)] text-[var(--brand-ink)] hover:opacity-90",
  solid: "bg-black text-white hover:opacity-85",
  outline: "border border-current/25 text-current hover:border-current/60",
  ghost: "text-current underline underline-offset-4 hover:opacity-70",
};

const SIZE: Record<Size, string> = {
  sm: "min-h-9 gap-1.5 px-4 py-2.5 text-[10px] tracking-[0.12em]",
  md: "min-h-11 gap-2 px-5 py-3 text-[11px] tracking-[0.1em]",
  lg: "min-h-12 gap-2 px-6 py-3.5 text-sm tracking-[0.06em]",
};

type Props = {
  tone?: Tone;
  size?: Size;
  href?: string;
  children: ReactNode;
  className?: string;
} & Omit<ComponentProps<"button">, "children" | "className">;

export function Button({ tone = "brand", size = "md", href, children, className = "", ...rest }: Props) {
  const classes = `inline-flex items-center justify-center rounded-full font-black uppercase transition ${TONE[tone]} ${SIZE[size]} ${className}`;
  if (href) {
    return <Link href={href} className={classes}>{children}</Link>;
  }
  return <button className={classes} {...rest}>{children}</button>;
}
