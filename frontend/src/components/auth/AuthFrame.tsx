import React, { type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";

interface AuthFrameProps {
  mode: "login" | "register";
  eyebrow: string;
  title: ReactNode;
  description: string;
  children: ReactNode;
}

export function AuthFrame({ mode, eyebrow, title, description, children }: AuthFrameProps) {
  const registering = mode === "register";

  return (
    <main className="auth-shell min-h-screen bg-[#111] text-[#111]">
      <div className="grid min-h-screen lg:grid-cols-[minmax(370px,0.82fr)_minmax(560px,1.18fr)]">
        <aside className="relative hidden min-h-screen overflow-hidden border-r border-white/10 bg-[#111] text-white lg:block">
          <div className="topo-surface absolute inset-0 opacity-80" />
          <div className="absolute inset-y-0 left-0 w-[9px] bg-[#d9ff00]" />
          <div className="relative flex min-h-screen flex-col px-11 py-10 xl:px-14 xl:py-12">
            <Link href="/" className="inline-flex items-center gap-3 self-start" aria-label="Unity Runn Club home">
              <span className="h-11 w-11 overflow-hidden bg-[#d9ff00]">
                <Image src="/Unity-Logos/logo%20UNTR-02.png" alt="" width={44} height={44} className="h-full w-full object-cover" />
              </span>
              <span>
                <span className="block text-[9px] font-black uppercase tracking-[0.24em] text-[#d9ff00]">Phnom Penh / KH</span>
                <span className="mt-0.5 block text-sm font-black uppercase tracking-[0.08em]">Unity Runn Club</span>
              </span>
            </Link>

            <div className="my-auto py-16">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/45">
                {registering ? "New entry / Account 01" : "Runner access / Account 00"}
              </p>
              <div className="mt-8 border-y border-white/15 py-8">
                <p className="sport-display text-[clamp(72px,8vw,126px)] uppercase leading-[0.72] tracking-[-0.045em] text-[#d9ff00]">
                  {registering ? "Join" : "Back"}
                </p>
                <p className="sport-display mt-3 text-[clamp(62px,7vw,108px)] uppercase leading-[0.72] tracking-[-0.045em] text-transparent [-webkit-text-stroke:1.5px_rgba(255,255,255,.55)]">
                  {registering ? "the crew" : "on pace"}
                </p>
              </div>
              <p className="mt-8 max-w-[330px] text-xs font-bold uppercase leading-6 tracking-[0.15em] text-white/45">
                {registering
                  ? "One account holds every entry, payment receipt, bib and race-day QR."
                  : "Your entries, receipts and check-in codes are waiting in the race wallet."}
              </p>
            </div>

            <div className="grid grid-cols-3 border border-white/15 text-[9px] font-black uppercase tracking-[0.16em]">
              <span className="border-r border-white/15 px-3 py-4 text-white/40">Secure entry</span>
              <span className="border-r border-white/15 px-3 py-4 text-white/40">Race wallet</span>
              <span className="px-3 py-4 text-[#d9ff00]">Gate ready</span>
            </div>
          </div>
        </aside>

        <section className="relative flex min-h-screen flex-col bg-[#f4f4f0]">
          <div className="flex items-center justify-between border-b border-black/15 px-5 py-4 sm:px-9 lg:px-12">
            <Link href="/" className="inline-flex items-center gap-2.5 lg:hidden" aria-label="Unity Runn Club home">
              <span className="h-9 w-9 overflow-hidden bg-[#d9ff00]"><Image src="/Unity-Logos/logo%20UNTR-02.png" alt="" width={36} height={36} className="h-full w-full object-cover" /></span>
              <span className="text-xs font-black uppercase tracking-[0.12em]">Unity Runn Club</span>
            </Link>
            <span className="hidden text-[9px] font-black uppercase tracking-[0.2em] text-black/40 lg:block">Identity desk / Online</span>
            <Link href="/events" className="text-[10px] font-black uppercase tracking-[0.16em] text-black/55 transition hover:text-black">View races ↗</Link>
          </div>

          <div className="flex flex-1 items-center px-5 py-10 sm:px-9 lg:px-12 xl:px-20">
            <div className="w-full max-w-[560px]">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#3155ff]">{eyebrow}</p>
              <h1 className="sport-display mt-4 max-w-[540px] text-[clamp(50px,6.2vw,82px)] uppercase leading-[0.84] tracking-[-0.035em]">{title}</h1>
              <p className="mt-6 max-w-md text-sm font-semibold leading-6 text-black/55">{description}</p>
              <div className="mt-9">{children}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 border-t border-black/15 text-[9px] font-black uppercase tracking-[0.18em] text-black/40">
            <span className="border-r border-black/15 px-5 py-4 sm:px-9 lg:px-12">Protected runner access</span>
            <span className="px-5 py-4 text-right sm:px-9 lg:px-12">Phnom Penh / 2026</span>
          </div>
        </section>
      </div>
    </main>
  );
}
