import type { ReactNode } from "react";

/**
 * The form field treatment, previously a `fieldClass` constant in register.tsx plus six
 * separate `inputClass` constants across the admin editors, all slightly different.
 *
 * `inputClass` is exported so existing hand-rolled <input>/<select>/<textarea> elements can
 * adopt the shared treatment without being rewritten as components.
 */

export const inputClass =
  "mt-2 w-full rounded-xl border border-black/15 bg-white px-4 py-3.5 text-[15px] font-medium text-[#111] outline-none transition placeholder:text-black/30 hover:border-black/30 focus:border-black focus:ring-4 focus:ring-black/5";

type Props = {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
};

export function Field({ label, htmlFor, hint, error, required, children }: Props) {
  return (
    <label className="block" htmlFor={htmlFor}>
      <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-black/55">
        {label}
        {required && <span className="ml-1 text-rose-600" aria-hidden>*</span>}
      </span>
      {children}
      {error
        ? <span className="mt-1.5 block text-[11px] font-semibold text-rose-600" role="alert">{error}</span>
        : hint && <span className="mt-1.5 block text-[11px] font-medium text-black/45">{hint}</span>}
    </label>
  );
}
