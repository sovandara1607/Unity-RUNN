import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Plus, Search, Calendar, Edit2, Trash2, ExternalLink } from "lucide-react";
import { AdminLayout } from "../../../components/admin/AdminLayout";
import { Skeleton } from "../../../components/Skeleton";
import { withMinSkeleton } from "../../../lib/withMinSkeleton";
import { EventStatusBadge } from "../../../components/admin/EventStatusBadge";
import { useAlerts } from "../../../components/alerts/AlertSystem";
import { api } from "../../../lib/api";
import type { Event } from "../../../types";

const statusFilterTabs: { label: string; value: string }[] = [
  { label: "All", value: "ALL" },
  { label: "Open", value: "REGISTRATION_OPEN" },
  { label: "Published", value: "PUBLISHED" },
  { label: "Draft", value: "DRAFT" },
  { label: "Past", value: "PAST" },
];

export default function AdminEventsPage() {
  const { notify } = useAlerts();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("ALL");

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      const params: { limit: number; statuses?: string[] } = { limit: 100 };
      if (activeTab !== "ALL" && activeTab !== "PAST") {
        params.statuses = [activeTab];
      }
      const res = await withMinSkeleton(() => api.listEvents(params));
      setEvents(res.events || []);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleDeleteDraft = async (id: string, name: string) => {
    if (!confirm(`Delete draft "${name}"?`)) return;
    try {
      await api.deleteEvent(id);
      await fetchEvents();
      notify({ tone: "success", title: "Draft removed", message: `${name} was deleted.` });
    } catch (err) {
      notify({ tone: "error", title: "Could not delete draft", message: err instanceof Error ? err.message : "The event could not be deleted." });
    }
  };

  const filteredEvents = events.filter((ev) => {
    const matchesSearch =
      ev.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ev.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ev.slug.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (activeTab === "ALL") return true;
    if (activeTab === "PAST") {
      return ["REGISTRATION_CLOSED", "COMPLETED", "CANCELLED", "ARCHIVED"].includes(ev.status);
    }
    return ev.status === activeTab;
  });

  return (
    <AdminLayout
      title="Events"
      subtitle="Manage races, statuses, and configurations"
      minRole="ADMIN"
      actions={
        <Link href="/admin/events/new" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium transition-colors">
          <Plus className="w-3.5 h-3.5" />
          <span>New Event</span>
        </Link>
      }
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-1 overflow-x-auto">
          {statusFilterTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.value ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-56">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-400"
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4">
              <Skeleton tone="light" className="h-12 w-12 shrink-0 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton tone="light" className="h-4 w-1/3" />
                <Skeleton tone="light" className="h-3 w-1/4" />
              </div>
              <Skeleton tone="light" className="h-6 w-20 rounded-md" />
            </div>
          ))}
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="py-12 text-center">
          <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <h3 className="font-medium text-slate-700">No events</h3>
          <p className="text-xs text-slate-500 mt-1">
            {searchQuery ? `No matches for "${searchQuery}"` : "Create your first event to get started"}
          </p>
          {!searchQuery && (
            <Link
              href="/admin/events/new"
              className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Event</span>
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-medium text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="py-2.5 px-3">Event</th>
                <th className="py-2.5 px-3">Date & Time</th>
                <th className="py-2.5 px-3 hidden md:table-cell">Location</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEvents.map((ev) => (
                <tr key={ev.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-3 px-3">
                    <Link href={`/admin/events/${ev.id}/edit`} className="font-medium text-slate-900 hover:text-slate-600 transition-colors">
                      {ev.name}
                    </Link>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">/{ev.slug}</p>
                  </td>
                  <td className="py-3 px-3">
                    <span className="text-slate-700">
                      {ev.event_date ? new Date(ev.event_date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "TBD"}
                    </span>
                    {ev.start_time && (
                      <span className="text-slate-500 text-[10px] ml-1">
                        {ev.start_time.slice(11, 16)}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3 hidden md:table-cell">
                    <span className="truncate max-w-[180px] block text-slate-600">{ev.location || "Online / TBD"}</span>
                  </td>
                  <td className="py-3 px-3"><EventStatusBadge status={ev.status} /></td>
                  <td className="py-3 px-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Link href={`/events/${ev.slug}`} target="_blank" className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded transition-colors" title="Public page">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                      <Link href={`/admin/events/${ev.id}/edit`} className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded transition-colors" title="Edit">
                        <Edit2 className="w-3.5 h-3.5" />
                      </Link>
                      {ev.status === "DRAFT" && (
                        <button onClick={() => handleDeleteDraft(ev.id, ev.name)} className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded transition-colors" title="Delete draft">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
