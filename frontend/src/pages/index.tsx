import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Flame, Calendar, Shield, ArrowRight, User, QrCode } from "lucide-react";
import { api } from "../lib/api";
import type { MeResponse } from "../types";

export default function HomePage() {
  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      try {
        const me = await api.getMe();
        setUser(me);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    }
    checkAuth();
  }, []);

  const isStaffOrAdmin = user && ["STAFF", "ADMIN", "SUPER_ADMIN"].includes(user.role);

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Navigation */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-orange-600 to-amber-500 flex items-center justify-center text-white shadow-md shadow-orange-500/20">
              <Flame className="w-5 h-5" />
            </div>
            <span className="font-extrabold tracking-tight text-white group-hover:text-orange-400 transition-colors">
              UNITY RUN CLUB
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/events"
              className="text-xs font-semibold text-slate-300 hover:text-white px-3 py-1.5 transition-colors"
            >
              Events
            </Link>

            {user ? (
              <>
                <Link
                  href="/dashboard"
                  className="text-xs font-semibold text-slate-300 hover:text-white px-3 py-1.5 transition-colors"
                >
                  Dashboard
                </Link>
                {isStaffOrAdmin && (
                  <Link
                    href="/admin"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
                  >
                    <Shield className="w-3.5 h-3.5" />
                    <span>Admin Panel</span>
                  </Link>
                )}
              </>
            ) : (
              <>
                <Link
                  href="/auth/login"
                  className="text-xs font-semibold text-slate-300 hover:text-white px-3 py-1.5 transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  href="/auth/register"
                  className="inline-flex items-center gap-1 px-3.5 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
                >
                  <span>Register</span>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex items-center justify-center px-4 py-20">
        <div className="max-w-3xl text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-400 text-xs font-semibold">
            <Flame className="w-4 h-4 text-orange-500" />
            <span>Phnom Penh Running Community</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-white leading-tight">
            Run Together. <br />
            <span className="bg-gradient-to-r from-orange-400 via-amber-400 to-yellow-400 bg-clip-text text-transparent">
              Inspire Community.
            </span>
          </h1>

          <p className="text-slate-400 text-base sm:text-lg max-w-xl mx-auto leading-relaxed">
            Join Unity Run Club for community runs, half-marathons, and endurance events across Cambodia.
          </p>

          <div className="pt-4 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/events"
              className="inline-flex items-center gap-2 px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white text-sm font-bold rounded-xl shadow-lg shadow-orange-600/30 transition-all"
            >
              <Calendar className="w-4 h-4" />
              <span>Browse Running Events</span>
            </Link>

            {user ? (
              <Link
                href={isStaffOrAdmin ? "/admin" : "/dashboard"}
                className="inline-flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-sm font-bold rounded-xl transition-all"
              >
                <span>{isStaffOrAdmin ? "Open Admin Panel" : "Go to My Dashboard"}</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            ) : (
              <Link
                href="/auth/login"
                className="inline-flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-sm font-bold rounded-xl transition-all"
              >
                <User className="w-4 h-4" />
                <span>Sign In / Admin Login</span>
              </Link>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-500">
        <p>© 2026 Unity Run Club. Phnom Penh, Cambodia.</p>
      </footer>
    </div>
  );
}
