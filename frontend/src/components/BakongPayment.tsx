import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { AlertTriangle, Check, Clock3, ExternalLink, RefreshCw, ShieldCheck, X } from "lucide-react";
import { api, type ApiError } from "../lib/api";
import type { PaymentCheckout } from "../types";

type Props = {
  checkout: PaymentCheckout;
  eventName: string;
  onPaid: () => void;
  onClose?: () => void;
  /** Where "start a new entry" should send the runner once a checkout has expired. */
  restartHref?: string;
};

type Phase = "waiting" | "processing" | "confirmed" | "failed";

function paymentFailureMessage(code?: string): string | null {
  switch (code) {
    case "payment_expired":
      return "This payment window expired. Your place was released and the QR code can no longer be used.";
    case "payment_mismatch":
      return "The reported payment does not match this entry. Contact support before paying again.";
    case "payment_unavailable":
      return "This payment could not be completed. Do not pay the same QR code again.";
    case "payment_failed":
      return "The organizer could not match this payment. Check the bank reference or contact the race team before paying again.";
    default:
      return null;
  }
}

function formatCountdown(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function BankQRPayment({ checkout, eventName, onPaid, onClose, restartHref }: Props) {
  const [qrImage, setQRImage] = useState("");
  const [checking, setChecking] = useState(false);
  const initialPhase: Phase = checkout.status === "PROCESSING" ? "processing" : checkout.status === "FAILED" ? "failed" : checkout.status === "SUCCEEDED" ? "confirmed" : "waiting";
  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [failureMessage, setFailureMessage] = useState(checkout.status === "FAILED" ? "This payment was not approved. Contact the race team before paying again." : "");
  const [reference, setReference] = useState(checkout.reference || "");
  const [submitError, setSubmitError] = useState("");
  const [failedChecks, setFailedChecks] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const amount = useMemo(() => checkout.currency === "USD" ? `$${(checkout.amount_cents / 100).toFixed(2)}` : `${checkout.amount_cents.toLocaleString()} KHR`, [checkout]);

  // Refs keep `verify` referentially stable. Previously `checking` sat in its dependency
  // array, so every setChecking() rebuilt the polling effect and cleared the 4s interval
  // before it could fire -- the modal actually hammered the bank API every 2.5s.
  const checkingRef = useRef(false);
  const phaseRef = useRef<Phase>(initialPhase);

  useEffect(() => {
    if (!checkout.qr_string) return;
    QRCode.toDataURL(checkout.qr_string, { width: 520, margin: 2, errorCorrectionLevel: "M", color: { dark: "#111111", light: "#ffffff" } }).then(setQRImage);
  }, [checkout.qr_string]);

  const expiresAt = useMemo(() => {
    if (!checkout.expires_at) return null;
    const parsed = new Date(checkout.expires_at).getTime();
    return Number.isNaN(parsed) ? null : parsed;
  }, [checkout.expires_at]);

  const secondsLeft = expiresAt === null ? null : Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const urgent = secondsLeft !== null && secondsLeft > 0 && secondsLeft <= 120;
  // The QR reservation can expire before a reference is submitted. Once submitted,
  // admin review remains valid even if that original scan window has elapsed.
  const lapsed = secondsLeft === 0 && phase === "waiting";

  useEffect(() => {
    if (expiresAt === null || phase !== "waiting") return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [expiresAt, phase]);

  const verify = useCallback(async (requestedByRunner = false) => {
    if (checkingRef.current || phaseRef.current === "confirmed" || phaseRef.current === "failed") return;
    if (requestedByRunner && phaseRef.current === "waiting") {
      phaseRef.current = "processing";
      setPhase("processing");
    }
    checkingRef.current = true;
    setChecking(true);
    try {
      const result = await api.verifyRegistrationPayment(checkout.registration_id);
      if (result.registration.status === "CONFIRMED" || result.payment.status === "SUCCEEDED") {
        phaseRef.current = "confirmed";
        setPhase("confirmed");
        return;
      }
      setFailedChecks(0);
    } catch (caught: unknown) {
      const terminalMessage = paymentFailureMessage((caught as ApiError)?.code);
      if (terminalMessage) {
        phaseRef.current = "failed";
        setFailureMessage(terminalMessage);
        setPhase("failed");
        return;
      }
      setFailedChecks((count) => count + 1);
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }, [checkout.registration_id]);

  const submitPayment = async () => {
    const trimmed = reference.trim();
    if (trimmed.length < 4) {
      setSubmitError("Enter the transaction reference shown by your banking app.");
      return;
    }
    setSubmitError("");
    setChecking(true);
    try {
      await api.submitRegistrationPayment(checkout.registration_id, trimmed);
      phaseRef.current = "processing";
      setPhase("processing");
    } catch (caught) {
      setSubmitError(caught instanceof Error ? caught.message : "Could not submit this payment for review.");
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (phase !== "waiting" && phase !== "processing") return;
    const first = window.setTimeout(() => void verify(false), 2500);
    const interval = window.setInterval(() => void verify(false), 4000);
    return () => { window.clearTimeout(first); window.clearInterval(interval); };
  }, [verify, phase]);

  useEffect(() => {
    if (!onClose) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const status = phase === "confirmed"
    ? { icon: <Check className="h-4 w-4 text-emerald-600" />, text: "Payment confirmed" }
    : phase === "failed"
      ? { icon: <AlertTriangle className="h-4 w-4 text-rose-600" />, text: "Payment failed" }
      : lapsed
        ? { icon: <RefreshCw className="h-4 w-4 animate-spin" />, text: "Time is up. Making a final payment check" }
        : failedChecks > 0
          ? { icon: <Clock3 className="h-4 w-4" />, text: "The payment is still waiting for review. Do not pay twice" }
          : phase === "processing"
            ? { icon: checking ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Clock3 className="h-4 w-4" />, text: "Payment is processing" }
            : checking
              ? { icon: <RefreshCw className="h-4 w-4 animate-spin" />, text: "Checking payment status" }
            : { icon: <Clock3 className="h-4 w-4" />, text: "Waiting for payment" };

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#111]/90 p-4 backdrop-blur-sm sm:p-8" role="dialog" aria-modal="true" aria-label="Pay by bank QR">
      <div className="mx-auto grid min-h-full max-w-5xl place-items-center">
        <section className="relative w-full overflow-hidden rounded-[28px] bg-[#efefe9] shadow-2xl lg:grid lg:grid-cols-[0.9fr_1.1fr]">
          {onClose && <button onClick={onClose} aria-label="Close payment" className="absolute right-4 top-4 z-10 rounded-full bg-black/10 p-2 transition hover:bg-black/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"><X className="h-4 w-4" /></button>}
          <div className="bg-[var(--brand)] p-6 sm:p-10">
            <p className="text-[10px] font-black uppercase tracking-[0.2em]">Bank QR · Payment checkout</p>
            <div className="mx-auto mt-6 max-w-[340px] rounded-[24px] bg-white p-4 shadow-[8px_8px_0_#111]">
              {qrImage ? <>
                {/* A generated data URL must remain byte-for-byte intact; image optimization is not applicable. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrImage} alt={`Bank payment QR for ${amount}`} className={`block aspect-square w-full transition ${(phase === "waiting" || phase === "processing") ? "" : "opacity-25 grayscale"}`} />
              </> : <div className="aspect-square animate-pulse rounded-xl bg-black/10" />}
            </div>
            <p className="mt-6 text-center text-xs font-bold uppercase tracking-[0.14em]">{phase === "waiting" ? "Scan with your banking app" : phase === "processing" ? "Payment submitted for checking" : phase === "confirmed" ? "Paid. No need to scan" : "This code is no longer valid"}</p>
          </div>
          <div className="flex flex-col justify-between p-7 sm:p-10 lg:p-12">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-black/40">Payment for</p>
              <h2 className="sport-display mt-3 text-5xl uppercase leading-[0.88] tracking-[-0.035em] sm:text-6xl">{eventName}</h2>
              <div className="mt-8 flex items-end justify-between border-y border-black/15 py-5">
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-black/45">Total due</span>
                <strong className="font-mono text-3xl">{amount}</strong>
              </div>
              {secondsLeft !== null && phase === "waiting" && (
                <div className={`mt-5 flex items-center justify-between rounded-xl px-4 py-3 transition ${urgent || lapsed ? "bg-rose-600 text-white" : "bg-black/5 text-black"}`}>
                  <span className="text-[11px] font-bold uppercase tracking-[0.14em] opacity-70">{lapsed ? "Hold this code" : "Time to pay"}</span>
                  <strong className="font-mono text-2xl tabular-nums" aria-live={urgent ? "polite" : "off"}>{formatCountdown(secondsLeft)}</strong>
                </div>
              )}
              {phase === "failed" ? (
                <p className="mt-7 text-sm font-semibold leading-6" role="alert">{failureMessage}</p>
              ) : phase === "confirmed" ? (
                <p className="mt-7 text-sm font-semibold leading-6">Your payment is confirmed and your race ticket is ready.</p>
              ) : phase === "processing" ? (
                <p className="mt-7 text-sm font-semibold leading-6">Your payment is waiting for an organizer to match the bank reference. You can close this screen and return later.</p>
              ) : (
                <ol className="mt-7 space-y-4 text-sm font-semibold">
                  <li className="flex gap-3"><span className="font-mono text-black/35">01</span>Open your banking app and scan the QR code.</li>
                  <li className="flex gap-3"><span className="font-mono text-black/35">02</span>Confirm the exact amount in your banking app.</li>
                  <li className="flex gap-3"><span className="font-mono text-black/35">03</span>Return here and enter the bank transaction reference.</li>
                </ol>
              )}
              {checkout.deep_link && phase === "waiting" && <a href={checkout.deep_link} className="mt-7 inline-flex items-center gap-2 rounded-full bg-black px-5 py-3 text-xs font-bold uppercase tracking-[0.1em] text-white">Open banking app <ExternalLink className="h-3.5 w-3.5" /></a>}
              {phase === "waiting" && <div className="mt-5"><label htmlFor={`payment-reference-${checkout.registration_id}`} className="text-[11px] font-bold uppercase tracking-[0.12em] text-black/55">Bank transaction reference</label><input id={`payment-reference-${checkout.registration_id}`} value={reference} onChange={(event) => { setReference(event.target.value); setSubmitError(""); }} placeholder="Reference from your banking app" className="mt-2 min-h-12 w-full rounded-xl border border-black/20 bg-white px-4 text-sm outline-none focus:border-black focus:ring-4 focus:ring-black/10" />{submitError && <p className="mt-2 text-xs font-semibold text-rose-700" role="alert">{submitError}</p>}<button onClick={() => void submitPayment()} disabled={checking} className="mt-4 inline-flex min-h-11 items-center rounded-full bg-black px-5 py-3 text-xs font-bold uppercase tracking-[0.1em] text-white transition hover:opacity-85 disabled:opacity-40">I have paid</button></div>}
              {phase === "confirmed" && <button onClick={onPaid} className="mt-7 inline-flex min-h-11 items-center rounded-full bg-black px-5 py-3 text-xs font-bold uppercase tracking-[0.1em] text-white transition hover:opacity-85">View my ticket</button>}
              {phase === "failed" && (restartHref ? (
                <a href={restartHref} className="mt-7 inline-flex items-center gap-2 rounded-full bg-black px-5 py-3 text-xs font-bold uppercase tracking-[0.1em] text-white transition hover:opacity-85">Start a new entry</a>
              ) : onClose && (
                <button onClick={onClose} className="mt-7 inline-flex items-center gap-2 rounded-full bg-black px-5 py-3 text-xs font-bold uppercase tracking-[0.1em] text-white transition hover:opacity-85">Close and start again</button>
              ))}
            </div>
            <div className="mt-10">
              <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white px-4 py-3 text-xs font-semibold" role={phase === "failed" ? "alert" : "status"} aria-live="polite">
                {status.icon}
                <span>{status.text}</span>
                {phase === "processing" && <button onClick={() => void verify(true)} disabled={checking} className="ml-auto min-h-8 underline underline-offset-4 disabled:opacity-40">Check again</button>}
              </div>
              {failedChecks > 2 && <p className="mt-3 text-xs leading-5 text-black/50">Review is taking longer than expected. Do not pay twice. You can reopen this payment from your dashboard.</p>}
              <p className="mt-4 flex items-start gap-2 text-[10px] font-medium leading-4 text-black/45"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />Your race ticket is issued only after an organizer confirms the bank transaction.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
