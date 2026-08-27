import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { ArrowRight, Check, Eye, EyeOff } from "lucide-react";
import { api } from "../../lib/api";
import { AlertBanner } from "../../components/alerts/AlertSystem";
import { AuthFrame } from "../../components/auth/AuthFrame";
import { GoogleMark } from "../../components/auth/GoogleMark";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    api.getAuthProviders().then((providers) => setGoogleEnabled(providers.google)).catch(() => setGoogleEnabled(false));
  }, []);

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (!name.trim() || !email.trim() || !password) throw new Error("Complete all three account fields.");
      if (password.length < 8) throw new Error("Use at least 8 characters for your password.");
      await api.register({ full_name: name.trim(), email: email.trim(), password });
      await router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "This account could not be created. Check the email and try again.");
    } finally {
      setLoading(false);
    }
  };

  const fieldClass = "mt-2 h-14 w-full border border-black/20 bg-white px-4 text-[15px] font-semibold text-[#111] outline-none transition placeholder:text-black/25 hover:border-black/40 focus:border-[#3155ff] focus:ring-2 focus:ring-[#3155ff]/15";
  const passwordReady = password.length >= 8;

  return (
    <AuthFrame
      mode="register"
      eyebrow="New runner / Create account"
      title={<>Your next start<br />line lives here.</>}
      description="Create one runner account for event entries, secure payments, ticket downloads and race-day check-in."
    >
      {error && <AlertBanner tone="error" title="Account not created" className="mb-6" onDismiss={() => setError(null)}>{error}</AlertBanner>}

      {googleEnabled && (
        <a href={api.googleOAuthURL("/dashboard")} className="flex h-14 w-full items-center justify-center gap-3 border-2 border-[#111] bg-white px-5 text-sm font-black text-[#111] transition hover:bg-black/[0.035] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3155ff] focus-visible:ring-offset-2">
          <GoogleMark />
          Sign up with Google
        </a>
      )}

      {googleEnabled && <div className="my-6 flex items-center gap-4" aria-hidden="true"><span className="h-px flex-1 bg-black/15" /><span className="text-[9px] font-black uppercase tracking-[0.2em] text-black/35">or use email</span><span className="h-px flex-1 bg-black/15" /></div>}

      <form onSubmit={handleRegister} className="space-y-5">
        <div>
          <label htmlFor="register-name" className="text-[10px] font-black uppercase tracking-[0.18em] text-black/50">Runner name</label>
          <input id="register-name" type="text" required autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Name shown on your ticket" className={fieldClass} />
        </div>
        <div>
          <label htmlFor="register-email" className="text-[10px] font-black uppercase tracking-[0.18em] text-black/50">Email address</label>
          <input id="register-email" type="email" required autoComplete="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="runner@example.com" className={fieldClass} />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="register-password" className="text-[10px] font-black uppercase tracking-[0.18em] text-black/50">Password</label>
            <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.12em] ${passwordReady ? "text-emerald-700" : "text-black/35"}`}><Check className="h-3 w-3" /> 8+ characters</span>
          </div>
          <div className="relative">
            <input id="register-password" type={showPassword ? "text" : "password"} required minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Create a secure password" className={`${fieldClass} pr-14`} />
            <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute inset-y-2 right-2 mt-2 grid w-10 place-items-center text-black/40 transition hover:text-black focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3155ff]" aria-label={showPassword ? "Hide password" : "Show password"}>
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <button type="submit" disabled={loading} className="flex h-14 w-full items-center justify-between border-2 border-[#111] bg-[#d9ff00] px-5 text-xs font-black uppercase tracking-[0.14em] text-[#111] transition hover:bg-[#c9ed00] disabled:cursor-wait disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3155ff] focus-visible:ring-offset-2">
          <span>{loading ? "Creating runner…" : "Create runner account"}</span>
          {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/20 border-t-black" /> : <ArrowRight className="h-4 w-4" />}
        </button>
      </form>

      <p className="mt-5 text-[11px] font-semibold leading-5 text-black/40">By creating an account, you agree to use your race ticket only for your own entry.</p>
      <p className="mt-6 text-sm font-semibold text-black/50">Already on the roster? <Link href="/auth/login" className="font-black text-[#111] underline decoration-[#3155ff] decoration-2 underline-offset-4 hover:text-[#3155ff]">Sign in</Link></p>
    </AuthFrame>
  );
}
