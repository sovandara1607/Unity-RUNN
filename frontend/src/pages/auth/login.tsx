import React, { useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { Flame, Shield, ArrowRight, CheckCircle2, AlertCircle } from "lucide-react";
import { api } from "../../lib/api";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleLogin = async (e?: React.FormEvent, customEmail?: string, customPass?: string) => {
    if (e) e.preventDefault();
    setError(null);
    setLoading(true);

    const loginEmail = customEmail || email;
    const loginPass = customPass || password;

    try {
      if (!loginEmail || !loginPass) {
        throw new Error("Please provide both email and password.");
      }

      await api.login({ email: loginEmail, password: loginPass });

      // Fetch user profile to check role
      let user = null;
      try {
        user = await api.getMe();
      } catch {
        // if getMe fails, token was still saved
      }

      const redirectPath = router.query.redirect as string;
      if (redirectPath) {
        router.push(redirectPath);
      } else if (user && ["STAFF", "ADMIN", "SUPER_ADMIN"].includes(user.role)) {
        router.push("/admin");
      } else {
        router.push("/dashboard");
      }
    } catch (err: any) {
      console.error("Login failed:", err);
      setError(err?.message || "Invalid email or password. Please verify credentials.");
    } finally {
      setLoading(false);
    }
  };

  const fillDemoAccount = (roleEmail: string, rolePass: string) => {
    setEmail(roleEmail);
    setPassword(rolePass);
    handleLogin(undefined, roleEmail, rolePass);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-slate-900 text-slate-100">
      <div className="max-w-md w-full">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-orange-600 to-amber-500 flex items-center justify-center text-white shadow-lg shadow-orange-500/25">
              <Flame className="w-6 h-6" />
            </div>
            <span className="text-2xl font-extrabold tracking-tight text-white">
              UNITY RUN CLUB
            </span>
          </Link>
          <h2 className="text-lg font-semibold text-slate-300">Sign in to your account</h2>
        </div>

        {/* Card */}
        <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl shadow-xl p-8 backdrop-blur-md">
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs font-medium flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@unityrunclub.com"
                className="w-full px-3.5 py-2.5 text-sm bg-slate-900/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 text-sm bg-slate-900/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-md shadow-orange-600/20 transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Login Fillers */}
          <div className="mt-6 pt-6 border-t border-slate-700/80">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 text-center">
              Quick 1-Click Demo Login
            </p>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => fillDemoAccount("admin@unityrunclub.com", "admin12345")}
                className="px-2 py-2 bg-slate-700/70 hover:bg-slate-700 border border-slate-600 rounded-lg text-center transition-colors group"
              >
                <span className="block text-[11px] font-bold text-orange-400 group-hover:text-orange-300">
                  Admin
                </span>
                <span className="block text-[9px] text-slate-400">Organizer</span>
              </button>

              <button
                type="button"
                onClick={() => fillDemoAccount("staff@unityrunclub.com", "staff12345")}
                className="px-2 py-2 bg-slate-700/70 hover:bg-slate-700 border border-slate-600 rounded-lg text-center transition-colors group"
              >
                <span className="block text-[11px] font-bold text-blue-400 group-hover:text-blue-300">
                  Staff
                </span>
                <span className="block text-[9px] text-slate-400">Scanner</span>
              </button>

              <button
                type="button"
                onClick={() => fillDemoAccount("runner@unityrunclub.com", "runner12345")}
                className="px-2 py-2 bg-slate-700/70 hover:bg-slate-700 border border-slate-600 rounded-lg text-center transition-colors group"
              >
                <span className="block text-[11px] font-bold text-emerald-400 group-hover:text-emerald-300">
                  Runner
                </span>
                <span className="block text-[9px] text-slate-400">User</span>
              </button>
            </div>
          </div>
        </div>

        <p className="text-center mt-6 text-xs text-slate-400">
          Don't have an account?{" "}
          <Link href="/auth/register" className="font-semibold text-orange-400 hover:text-orange-300">
            Create Account
          </Link>
        </p>
      </div>
    </div>
  );
}
