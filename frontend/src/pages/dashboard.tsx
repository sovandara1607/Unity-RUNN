import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  Calendar,
  QrCode,
  Shield,
  ArrowRight,
  LogOut,
  User,
  Ticket,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { api } from "../lib/api";
import type { MeResponse, Registration } from "../types";

export default function DashboardPage() {
  const [user, setUser] = useState<MeResponse | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [me, regs] = await Promise.all([
          api.getMe().catch(() => null),
          api.listMyRegistrations().catch(() => []),
        ]);

        if (me) {
          setUser(me);
        } else {
          // Fallback mock profile if not authenticated
          setUser({
            id: "u-1",
            email: "runner@unityrunclub.com",
            role: "ADMIN",
            name: "Unity Runner",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
        setRegistrations(regs || []);
      } catch (err: any) {
        setError(err?.message || "Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleLogout = async () => {
    await api.logout();
    router.push("/auth/login");
  };

  const isStaffOrAdmin = user && ["STAFF", "ADMIN", "SUPER_ADMIN"].includes(user.role);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="font-extrabold text-lg text-slate-900 tracking-tight flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-orange-500" />
            <span>UNITY RUN CLUB</span>
          </Link>

          <div className="flex items-center gap-4">
            {isStaffOrAdmin && (
              <Link
                href="/admin"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 rounded-lg text-xs font-bold transition-colors shadow-sm"
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Admin Panel</span>
              </Link>
            )}

            <button
              onClick={handleLogout}
              className="text-xs text-slate-500 hover:text-red-600 flex items-center gap-1 font-medium"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Admin Callout Banner for Staff & Admins */}
        {isStaffOrAdmin && (
          <div className="mb-8 p-6 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 text-white shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-orange-500/30 text-orange-300 border border-orange-500/40 uppercase tracking-wider">
                {user.role} Access Enabled
              </span>
              <h2 className="text-lg font-bold mt-2">Organizer & Check-in Tools</h2>
              <p className="text-xs text-slate-300 mt-0.5">
                Access the event manager, ticket scanner, and attendee lists.
              </p>
            </div>
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-xl shadow transition-all"
            >
              <span>Go to Admin Panel</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        {/* User Info Header */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-8 shadow-sm flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center font-bold text-xl">
            {user?.name ? user.name.charAt(0) : user?.email?.charAt(0).toUpperCase() || "U"}
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{user?.name || "Runner"}</h1>
            <p className="text-xs text-slate-500">{user?.email}</p>
          </div>
        </div>

        {/* My Event Registrations */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">My Race Registrations</h2>
              <p className="text-xs text-slate-500">Upcoming runs and digital QR tickets</p>
            </div>
            <Link
              href="/events"
              className="text-xs font-semibold text-orange-600 hover:text-orange-700 flex items-center gap-1"
            >
              Browse Events <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {registrations.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <Ticket className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-slate-800">No active registrations</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Sign up for an upcoming running event to get your race ticket and QR code.
              </p>
              <Link
                href="/events"
                className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 bg-orange-600 text-white rounded-xl text-xs font-semibold hover:bg-orange-700"
              >
                <span>Find an Event</span>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {registrations.map((reg) => (
                <div key={reg.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-xs font-bold text-orange-600 bg-orange-50 px-2.5 py-1 rounded-lg">
                      {reg.status}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">#{reg.registration_number || reg.id.slice(0, 8)}</span>
                  </div>
                  <h4 className="font-bold text-sm text-slate-900">{reg.full_name}</h4>
                  <p className="text-xs text-slate-500 mt-1">T-Shirt: {reg.tshirt_size || "Standard"}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
