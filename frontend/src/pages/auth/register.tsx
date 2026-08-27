import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
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

  const fieldClass = "mt-2 h-12 w-full border border-black/20 bg-white px-3.5 text-sm font-semibold text-[#111] outline-none transition placeholder:text-black/25 hover:border-black/35 focus:border-[#3155ff] focus:ring-2 focus:ring-[#3155ff]/10";
  return (
    <AuthFrame
      mode="register"
      title="Join."
    >
      {error && <AlertBanner tone="error" title="Account not created" className="mb-6" onDismiss={() => setError(null)}>{error}</AlertBanner>}

      {googleEnabled && (
        <a href={api.googleOAuthURL("/dashboard")} className="flex h-12 w-full items-center justify-center gap-3 border border-black/20 bg-white px-4 text-sm font-bold text-[#111] transition hover:border-black/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3155ff]">
          <GoogleMark />
          Google
        </a>
      )}

      {googleEnabled && <div className="my-5 flex items-center gap-3" aria-hidden="true"><span className="h-px flex-1 bg-black/10" /><span className="text-[9px] font-bold uppercase tracking-[0.14em] text-black/35">or</span><span className="h-px flex-1 bg-black/10" /></div>}

      <form onSubmit={handleRegister} className="space-y-4">
        <div>
          <label htmlFor="register-name" className="text-xs font-bold text-black/65">Full name</label>
          <input id="register-name" type="text" required autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} className={fieldClass} />
        </div>
        <div>
          <label htmlFor="register-email" className="text-xs font-bold text-black/65">Email</label>
          <input id="register-email" type="email" required autoComplete="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className={fieldClass} />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="register-password" className="text-xs font-bold text-black/65">Password</label>
            <span className="text-[10px] font-bold text-black/35">8+</span>
          </div>
          <div className="relative">
            <input id="register-password" type={showPassword ? "text" : "password"} required minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className={`${fieldClass} pr-14`} />
            <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute inset-y-2 right-1.5 mt-2 grid w-10 place-items-center text-black/35 transition hover:text-black focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3155ff]" aria-label={showPassword ? "Hide password" : "Show password"}>
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <button type="submit" disabled={loading} className="flex h-12 w-full items-center justify-between bg-[#111] px-4 text-[11px] font-black uppercase tracking-[0.12em] text-white transition hover:bg-[#3155ff] disabled:cursor-wait disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3155ff] focus-visible:ring-offset-2">
          <span>{loading ? "Creating…" : "Create account"}</span>
          {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/20 border-t-black" /> : <ArrowRight className="h-4 w-4" />}
        </button>
      </form>

      <p className="mt-7 text-sm text-black/50">Already joined? <Link href="/auth/login" className="font-bold text-[#111] underline decoration-black/25 underline-offset-4 hover:decoration-[#3155ff]">Sign in</Link></p>
    </AuthFrame>
  );
}
