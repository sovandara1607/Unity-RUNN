import { useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Check, Clock3, ExternalLink, RefreshCw, ShieldCheck, X } from "lucide-react";
import { api, type ApiError } from "../lib/api";
import type { PaymentCheckout } from "../types";

type Props = {
  checkout: PaymentCheckout;
  eventName: string;
  onPaid: () => void;
  onClose?: () => void;
};

export function BakongPayment({ checkout, eventName, onPaid, onClose }: Props) {
  const [qrImage, setQRImage] = useState("");
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState("Waiting for payment");
  const [failedChecks, setFailedChecks] = useState(0);
	const [terminal, setTerminal] = useState(false);
  const amount = useMemo(() => checkout.currency === "USD" ? `$${(checkout.amount_cents / 100).toFixed(2)}` : `${checkout.amount_cents.toLocaleString()} KHR`, [checkout]);

  useEffect(() => {
    if (!checkout.qr_string) return;
    QRCode.toDataURL(checkout.qr_string, { width: 520, margin: 2, errorCorrectionLevel: "M", color: { dark: "#111111", light: "#ffffff" } }).then(setQRImage);
  }, [checkout.qr_string]);

  const verify = useCallback(async () => {
    if (checking || terminal) return;
    setChecking(true);
    try {
      const result = await api.verifyRegistrationPayment(checkout.registration_id);
      if (result.registration.status === "CONFIRMED" || result.payment.status === "SUCCEEDED") {
        setMessage("Payment confirmed");
        onPaid();
        return;
      }
      setMessage("Waiting for payment");
      setFailedChecks(0);
		} catch (caught: unknown) {
			if ((caught as ApiError)?.code === "payment_expired") {
				setTerminal(true);
				setMessage("This payment expired — close and start again");
				return;
			}
      setFailedChecks((count) => count + 1);
      setMessage("Could not check yet — your payment is still safe");
    } finally { setChecking(false); }
  }, [checking, checkout.registration_id, onPaid, terminal]);

  useEffect(() => {
    const first = window.setTimeout(verify, 2500);
    const interval = window.setInterval(verify, 4000);
    return () => { window.clearTimeout(first); window.clearInterval(interval); };
  }, [verify]);

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#111]/90 p-4 backdrop-blur-sm sm:p-8" role="dialog" aria-modal="true" aria-label="Pay with Bakong">
      <div className="mx-auto grid min-h-full max-w-5xl place-items-center">
        <section className="relative w-full overflow-hidden rounded-[28px] bg-[#efefe9] shadow-2xl lg:grid lg:grid-cols-[0.9fr_1.1fr]">
          {onClose && <button onClick={onClose} aria-label="Close payment" className="absolute right-4 top-4 z-10 rounded-full bg-black/10 p-2 transition hover:bg-black/20"><X className="h-4 w-4" /></button>}
          <div className="bg-[#d9ff00] p-6 sm:p-10">
            <p className="text-[10px] font-black uppercase tracking-[0.2em]">Bakong KHQR · Secure checkout</p>
            <div className="mx-auto mt-6 max-w-[340px] rounded-[24px] bg-white p-4 shadow-[8px_8px_0_#111]">
			  {qrImage ? <>
				{/* A generated data URL must remain byte-for-byte intact; image optimization is not applicable. */}
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img src={qrImage} alt={`Bakong payment QR for ${amount}`} className="block aspect-square w-full" />
			  </> : <div className="aspect-square animate-pulse rounded-xl bg-black/10" />}
            </div>
            <p className="mt-6 text-center text-xs font-bold uppercase tracking-[0.14em]">Scan with your banking app</p>
          </div>
          <div className="flex flex-col justify-between p-7 sm:p-10 lg:p-12">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-black/40">Payment for</p>
              <h2 className="sport-display mt-3 text-5xl uppercase leading-[0.88] tracking-[-0.035em] sm:text-6xl">{eventName}</h2>
              <div className="mt-8 flex items-end justify-between border-y border-black/15 py-5">
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-black/45">Total due</span>
                <strong className="font-mono text-3xl">{amount}</strong>
              </div>
              <ol className="mt-7 space-y-4 text-sm font-semibold">
                <li className="flex gap-3"><span className="font-mono text-black/35">01</span>Open any KHQR-enabled banking app.</li>
                <li className="flex gap-3"><span className="font-mono text-black/35">02</span>Scan the code and confirm the exact amount.</li>
                <li className="flex gap-3"><span className="font-mono text-black/35">03</span>Keep this screen open—we confirm automatically.</li>
              </ol>
              {checkout.deep_link && <a href={checkout.deep_link} className="mt-7 inline-flex items-center gap-2 rounded-full bg-black px-5 py-3 text-xs font-bold uppercase tracking-[0.1em] text-white">Open banking app <ExternalLink className="h-3.5 w-3.5" /></a>}
            </div>
            <div className="mt-10">
              <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white px-4 py-3 text-xs font-semibold">
                {message === "Payment confirmed" ? <Check className="h-4 w-4 text-emerald-600" /> : checking ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Clock3 className="h-4 w-4" />}
                <span>{message}</span>
				<button onClick={verify} disabled={checking || terminal} className="ml-auto min-h-8 underline underline-offset-4 disabled:opacity-40">Check now</button>
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
