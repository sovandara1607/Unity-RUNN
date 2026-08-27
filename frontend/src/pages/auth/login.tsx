import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { api } from "../../lib/api";
import { AlertBanner } from "../../components/alerts/AlertSystem";
import { AuthFrame } from "../../components/auth/AuthFrame";
import { GoogleMark } from "../../components/auth/GoogleMark";

const demoAccounts = [
  { label: "Admin", email: "admin@unityrunclub.com", pass: "admin12345" },
  { label: "Staff", email: "staff@unityrunclub.com", pass: "staff12345" },
  { label: "Runner", email: "runner@unityrunclub.com", pass: "runner12345" },
];

const roleRank = { USER: 0, STAFF: 1, ADMIN: 2, SUPER_ADMIN: 3 } as const;

function requiredRankForPath(path: string) {
  if (path.startsWith("/admin/users")) return roleRank.SUPER_ADMIN;
  if (path.startsWith("/admin/events") || path.startsWith("/admin/audit-logs")) return roleRank.ADMIN;
  if (path.startsWith("/admin")) return roleRank.STAFF;
  return roleRank.USER;
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const router = useRouter();

  useEffect(() => {
    api.getAuthProviders().then((providers) => setGoogleEnabled(providers.google)).catch(() => setGoogleEnabled(false));
  }, []);

  useEffect(() => {
    if (!router.isReady || typeof router.query.oauth_error !== "string") return;
    const messages: Record<string, string> = {
      access_denied: "Google sign-in was cancelled.",
      invalid_state: "Google sign-in expired. Start again from this page.",
      verification_failed: "Google could not verify this account. Try again.",
      account_unavailable: "This Google account could not be connected.",
    };
    setError(messages[router.query.oauth_error] || "Google sign-in could not be completed.");
  }, [router.isReady, router.query.oauth_error]);

  const handleLogin = async (event?: React.FormEvent, customEmail?: string, customPass?: string) => {
    event?.preventDefault();
    setError(null);
    setLoading(true);

    const loginEmail = customEmail || email;
    const loginPass = customPass || password;
    try {
      if (!loginEmail || !loginPass) throw new Error("Enter both email and password.");
      const result = await api.login({ email: loginEmail, password: loginPass });
      const user = result.user;
      const redirectPath = router.query.redirect as string;
      const safeRedirect = redirectPath?.startsWith("/") && !redirectPath.startsWith("//");
      const userRank = user ? roleRank[user.role as keyof typeof roleRank] ?? 0 : 0;

      if (safeRedirect && userRank >= requiredRankForPath(redirectPath)) await router.push(redirectPath);
      else if (user && ["STAFF", "ADMIN", "SUPER_ADMIN"].includes(user.role)) await router.push("/admin");
      else await router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "That email and password didn’t match. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const loginWithDemo = (demoEmail: string, demoPassword: string) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
    void handleLogin(undefined, demoEmail, demoPassword);
  };

  const fieldClass = "mt-2 h-14 w-full border border-black/20 bg-white px-4 text-[15px] font-semibold text-[#111] outline-none transition placeholder:text-black/25 hover:border-black/40 focus:border-[#3155ff] focus:ring-2 focus:ring-[#3155ff]/15";

  return (
    <AuthFrame
      mode="login"
      eyebrow="Returning runner / Sign in"
      title={<>Open your<br />race wallet.</>}
      description="Use the account connected to your registrations. Staff accounts return directly to Race Control."
    >
      {error && <AlertBanner tone="error" title="Sign-in blocked" className="mb-6" onDismiss={() => setError(null)}>{error}</AlertBanner>}

      {googleEnabled && (
        <a
          href={api.googleOAuthURL(typeof router.query.redirect === "string" ? router.query.redirect : "/dashboard")}
          className="flex h-14 w-full items-center justify-center gap-3 border-2 border-[#111] bg-white px-5 text-sm font-black text-[#111] transition hover:bg-black/[0.035] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3155ff] focus-visible:ring-offset-2"
        >
          <GoogleMark />
          Continue with Google
        </a>
      )}

      {googleEnabled && (
        <div className="my-6 flex items-center gap-4" aria-hidden="true">
          <span className="h-px flex-1 bg-black/15" /><span className="text-[9px] font-black uppercase tracking-[0.2em] text-black/35">or use email</span><span className="h-px flex-1 bg-black/15" />
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-5">
        <div>
          <label htmlFor="login-email" className="text-[10px] font-black uppercase tracking-[0.18em] text-black/50">Email address</label>
          <input id="login-email" type="email" required autoComplete="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="runner@example.com" className={fieldClass} />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="login-password" className="text-[10px] font-black uppercase tracking-[0.18em] text-black/50">Password</label>
            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-black/35">8+ characters</span>
          </div>
          <div className="relative">
            <input id="login-password" type={showPassword ? "text" : "password"} required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" className={`${fieldClass} pr-14`} />
            <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute inset-y-2 right-2 mt-2 grid w-10 place-items-center text-black/40 transition hover:text-black focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3155ff]" aria-label={showPassword ? "Hide password" : "Show password"}>
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <button type="submit" disabled={loading} className="flex h-14 w-full items-center justify-between border-2 border-[#111] bg-[#d9ff00] px-5 text-xs font-black uppercase tracking-[0.14em] text-[#111] transition hover:bg-[#c9ed00] disabled:cursor-wait disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3155ff] focus-visible:ring-offset-2">
          <span>{loading ? "Checking access…" : "Sign in"}</span>
          {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/20 border-t-black" /> : <ArrowRight className="h-4 w-4" />}
        </button>
      </form>

      {process.env.NODE_ENV !== "production" && (
        <details className="mt-6 border border-black/15 bg-white/45">
          <summary className="cursor-pointer px-4 py-3 text-[9px] font-black uppercase tracking-[0.18em] text-black/45">Local demo access</summary>
          <div className="grid grid-cols-3 border-t border-black/15">
            {demoAccounts.map((account) => <button key={account.label} type="button" disabled={loading} onClick={() => loginWithDemo(account.email, account.pass)} className="border-r border-black/15 px-2 py-3 text-[10px] font-black uppercase tracking-[0.1em] last:border-r-0 hover:bg-[#d9ff00] disabled:opacity-50">{account.label}</button>)}
          </div>
        </details>
      )}

      <p className="mt-8 text-sm font-semibold text-black/50">First race with us? <Link href="/auth/register" className="font-black text-[#111] underline decoration-[#3155ff] decoration-2 underline-offset-4 hover:text-[#3155ff]">Create an account</Link></p>
    </AuthFrame>
  );
}
