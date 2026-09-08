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

type Phase = "waiting" | "confirmed" | "expired";

function formatCountdown(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function BakongPayment({ checkout, eventName, onPaid, onClose, restartHref }: Props) {
  const [qrImage, setQRImage] = useState("");
  const [checking, setChecking] = useState(false);
  const [phase, setPhase] = useState<Phase>("waiting");
  const [failedChecks, setFailedChecks] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const amount = useMemo(() => checkout.currency === "USD" ? `$${(checkout.amount_cents / 100).toFixed(2)}` : `${checkout.amount_cents.toLocaleString()} KHR`, [checkout]);

  // Refs keep `verify` referentially stable. Previously `checking` sat in its dependency
  // array, so every setChecking() rebuilt the polling effect and cleared the 4s interval
  // before it could fire -- the modal actually hammered the bank API every 2.5s.
  const checkingRef = useRef(false);
  const phaseRef = useRef<Phase>("waiting");
  const onPaidRef = useRef(onPaid);
  useEffect(() => { onPaidRef.current = onPaid; }, [onPaid]);

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
  // The client clock has run out but the server has not confirmed expiry yet. The API polls
  // Bakong before trusting its own TTL, so a payment made at the last second still settles.
  const lapsed = secondsLeft === 0 && phase === "waiting";

  useEffect(() => {
    if (expiresAt === null || phase !== "waiting") return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [expiresAt, phase]);

  const verify = useCallback(async () => {
    if (checkingRef.current || phaseRef.current !== "waiting") return;
    checkingRef.current = true;
    setChecking(true);
    try {
      const result = await api.verifyRegistrationPayment(checkout.registration_id);
      if (result.registration.status === "CONFIRMED" || result.payment.status === "SUCCEEDED") {
        phaseRef.current = "confirmed";
        setPhase("confirmed");
        onPaidRef.current();
        return;
      }
      setFailedChecks(0);
    } catch (caught: unknown) {
      if ((caught as ApiError)?.code === "payment_expired") {
        phaseRef.current = "expired";
        setPhase("expired");
        return;
      }
      setFailedChecks((count) => count + 1);
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }, [checkout.registration_id]);

  useEffect(() => {
    if (phase !== "waiting") return;
    const first = window.setTimeout(verify, 2500);
    const interval = window.setInterval(verify, 4000);
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
    : phase === "expired"
      ? { icon: <AlertTriangle className="h-4 w-4 text-rose-600" />, text: "This payment expired" }
      : lapsed
        ? { icon: <RefreshCw className="h-4 w-4 animate-spin" />, text: "Time is up — making a final check with Bakong" }
        : failedChecks > 0
          ? { icon: <Clock3 className="h-4 w-4" />, text: "Could not check yet — your payment is still safe" }
          : checking
            ? { icon: <RefreshCw className="h-4 w-4 animate-spin" />, text: "Checking with Bakong" }
            : { icon: <Clock3 className="h-4 w-4" />, text: "Waiting for payment" };

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#111]/90 p-4 backdrop-blur-sm sm:p-8" role="dialog" aria-modal="true" aria-label="Pay with Bakong">
      <div className="mx-auto grid min-h-full max-w-5xl place-items-center">
        <section className="relative w-full overflow-hidden rounded-[28px] bg-[#efefe9] shadow-2xl lg:grid lg:grid-cols-[0.9fr_1.1fr]">
          {onClose && <button onClick={onClose} aria-label="Close payment" className="absolute right-4 top-4 z-10 rounded-full bg-black/10 p-2 transition hover:bg-black/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"><X className="h-4 w-4" /></button>}
          <div className="bg-[var(--brand)] p-6 sm:p-10">
            <p className="text-[10px] font-black uppercase tracking-[0.2em]">Bakong KHQR · Secure checkout</p>
            <div className="mx-auto mt-6 max-w-[340px] rounded-[24px] bg-white p-4 shadow-[8px_8px_0_#111]">
              {qrImage ? <>
                {/* A generated data URL must remain byte-for-byte intact; image optimization is not applicable. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrImage} alt={`Bakong payment QR for ${amount}`} className={`block aspect-square w-full transition ${phase === "waiting" ? "" : "opacity-25 grayscale"}`} />
              </> : <div className="aspect-square animate-pulse rounded-xl bg-black/10" />}
            </div>
            <p className="mt-6 text-center text-xs font-bold uppercase tracking-[0.14em]">{phase === "waiting" ? "Scan with your banking app" : phase === "confirmed" ? "Paid — no need to scan" : "This code is no longer valid"}</p>
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
              {phase === "expired" ? (
                <p className="mt-7 text-sm font-semibold leading-6">Your place was released so someone else could take it. Nothing was charged — if your bank shows a deduction, contact us before paying again.</p>
              ) : (
                <ol className="mt-7 space-y-4 text-sm font-semibold">
                  <li className="flex gap-3"><span className="font-mono text-black/35">01</span>Open any KHQR-enabled banking app.</li>
                  <li className="flex gap-3"><span className="font-mono text-black/35">02</span>Scan the code and confirm the exact amount.</li>
                  <li className="flex gap-3"><span className="font-mono text-black/35">03</span>Keep this screen open—we confirm automatically.</li>
                </ol>
              )}
              {checkout.deep_link && phase === "waiting" && <a href={checkout.deep_link} className="mt-7 inline-flex items-center gap-2 rounded-full bg-black px-5 py-3 text-xs font-bold uppercase tracking-[0.1em] text-white">Open banking app <ExternalLink className="h-3.5 w-3.5" /></a>}
              {phase === "expired" && (restartHref ? (
                <a href={restartHref} className="mt-7 inline-flex items-center gap-2 rounded-full bg-black px-5 py-3 text-xs font-bold uppercase tracking-[0.1em] text-white transition hover:opacity-85">Start a new entry</a>
              ) : onClose && (
                <button onClick={onClose} className="mt-7 inline-flex items-center gap-2 rounded-full bg-black px-5 py-3 text-xs font-bold uppercase tracking-[0.1em] text-white transition hover:opacity-85">Close and start again</button>
              ))}
            </div>
            <div className="mt-10">
              <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white px-4 py-3 text-xs font-semibold" role="status" aria-live="polite">
                {status.icon}
                <span>{status.text}</span>
                {phase === "waiting" && <button onClick={verify} disabled={checking} className="ml-auto min-h-8 underline underline-offset-4 disabled:opacity-40">Check now</button>}
              </div>
              {failedChecks > 2 && <p className="mt-3 text-xs leading-5 text-black/50">Bakong is taking longer to respond. Do not pay twice. You can reopen this payment from your dashboard.</p>}
              <p className="mt-4 flex items-start gap-2 text-[10px] font-medium leading-4 text-black/45"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />Your race ticket is issued only after Bakong confirms settlement.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
