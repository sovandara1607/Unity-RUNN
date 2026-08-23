import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Calendar,
  Users,
  QrCode,
  TrendingUp,
  Plus,
  ArrowRight,
  CheckCircle2,
  Clock,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { EventStatusBadge } from "../../components/admin/EventStatusBadge";
import { RegistrationStatusBadge } from "../../components/admin/RegistrationStatusBadge";
import { api } from "../../lib/api";
import type { Event, Registration, AdminMetrics } from "../../types";

export default function AdminDashboardPage() {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [recentRegistrations, setRecentRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDashboardData() {
      try {
        setLoading(true);
        const [eventsRes, regsRes, metricsData] = await Promise.all([
          api.listEvents({ limit: 10 }),
          api.adminListRegistrations({ limit: 8 }),
          api.adminGetMetrics(),
        ]);

        setEvents(eventsRes.events || []);
        setRecentRegistrations(regsRes.registrations || []);
        setMetrics(metricsData);
      } catch (err: any) {
        console.error("Dashboard load error:", err);
        setError(err?.message || "Failed to load dashboard metrics");
      } finally {
        setLoading(false);
      }
    }
    loadDashboardData();
  }, []);

  return (
    <AdminLayout
      title="Club Operations Dashboard"
      subtitle="Overview of upcoming races, live registrations, and race-day check-in status"
      actions={
        <div className="flex items-center gap-2">
          <Link
            href="/admin/events/new"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Event</span>
          </Link>
        </div>
      }
    >
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div>
            <p className="font-semibold">Backend Connection Notice</p>
            <p className="text-xs text-amber-700 mt-0.5">{error} — displaying cached or local data.</p>
          </div>
        </div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* Total Events */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Events</p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1">
              {metrics?.total_events ?? events.length}
            </h3>
            <p className="text-xs text-emerald-600 font-medium mt-1 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {metrics?.active_events ?? 0} active registration
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Calendar className="w-6 h-6" />
          </div>
        </div>

        {/* Total Registrations */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Registrations</p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1">
              {metrics?.total_registrations ?? recentRegistrations.length}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              {metrics?.confirmed_registrations ?? 0} confirmed
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
        </div>

        {/* Check-ins */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Check-in Status</p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1">
              {metrics?.total_checked_in ?? 0}
            </h3>
            <p className="text-xs text-slate-500 mt-1">Checked-in runners</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <QrCode className="w-6 h-6" />
          </div>
        </div>

        {/* Est. Revenue */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Ticket Revenue</p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1">
              ${((metrics?.total_revenue_cents ?? 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </h3>
            <p className="text-xs text-emerald-600 font-medium mt-1 flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" /> Direct payments
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Sparkles className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Quick Action Station Banner */}
      <div className="mb-8 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-orange-950 p-6 sm:p-8 text-white shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/20 border border-orange-500/30 text-orange-300 text-xs font-semibold mb-3">
            <QrCode className="w-3.5 h-3.5" /> Race Day Station
          </div>
          <h2 className="text-xl sm:text-2xl font-bold">Ready for Participant Check-in?</h2>
          <p className="text-sm text-slate-300 mt-1 max-w-xl">
            Launch the instant QR camera scanner and ticket lookup terminal for rapid on-site runner check-in.
          </p>
        </div>
        <Link
          href="/admin/checkin"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold text-sm shadow-md shadow-orange-500/25 transition-all flex-shrink-0"
        >
          <span>Open Check-in Terminal</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Two-column layout: Active Events & Recent Registrations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Active Events */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-900">Events Overview</h3>
              <p className="text-xs text-slate-500">Upcoming and live run club events</p>
            </div>
            <Link
              href="/admin/events"
              className="text-xs font-semibold text-orange-600 hover:text-orange-700 flex items-center gap-1"
            >
              View all <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {events.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">
              <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
              No events found. Create your first event to get started.
            </div>
          ) : (
            <div className="space-y-3">
              {events.slice(0, 5).map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-center justify-between p-3.5 rounded-xl border border-slate-100 hover:border-slate-300 hover:bg-slate-50/50 transition-all"
                >
                  <div className="min-w-0 flex-1 mr-3">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-sm text-slate-900 truncate">
                        {ev.name}
                      </h4>
                      <EventStatusBadge status={ev.status} />
                    </div>
                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-3">
                      <span>{ev.event_date ? new Date(ev.event_date).toLocaleDateString() : "Date TBD"}</span>
                      <span>•</span>
                      <span className="truncate">{ev.location}</span>
                    </p>
                  </div>
                  <Link
                    href={`/admin/events/${ev.id}/edit`}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex-shrink-0"
                  >
                    Manage
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Registrations */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-900">Recent Registrations</h3>
              <p className="text-xs text-slate-500">Latest participant signups</p>
            </div>
            <Link
              href="/admin/registrations"
              className="text-xs font-semibold text-orange-600 hover:text-orange-700 flex items-center gap-1"
            >
              View all <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {recentRegistrations.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
              No registrations recorded yet.
            </div>
          ) : (
            <div className="space-y-3">
              {recentRegistrations.slice(0, 5).map((reg) => (
                <div
                  key={reg.id}
                  className="flex items-center justify-between p-3.5 rounded-xl border border-slate-100 hover:border-slate-300 hover:bg-slate-50/50 transition-all"
                >
                  <div className="min-w-0 flex-1 mr-3">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-sm text-slate-900 truncate">
                        {reg.full_name || "Anonymous Runner"}
                      </h4>
                      <RegistrationStatusBadge status={reg.status} />
                    </div>
                    <p className="text-xs text-slate-500 mt-1 truncate">
                      {reg.email} • Ref #{reg.registration_number || reg.id.slice(0, 8)}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-xs text-slate-400 block">
                      {reg.tshirt_size ? `Size ${reg.tshirt_size}` : "Registered"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
