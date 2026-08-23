import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  Calendar,
  MapPin,
  Clock,
  Edit2,
  Trash2,
  ExternalLink,
  ChevronRight,
  Filter,
} from "lucide-react";
import { AdminLayout } from "../../../components/admin/AdminLayout";
import { EventStatusBadge } from "../../../components/admin/EventStatusBadge";
import { api } from "../../../lib/api";
import type { Event, EventStatus } from "../../../types";

const statusFilterTabs: { label: string; value: string }[] = [
  { label: "All Events", value: "ALL" },
  { label: "Open & Live", value: "REGISTRATION_OPEN" },
  { label: "Published", value: "PUBLISHED" },
  { label: "Drafts", value: "DRAFT" },
  { label: "Closed / Done", value: "PAST" },
];

export default function AdminEventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("ALL");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      const res = await api.listEvents({ limit: 100 });
      setEvents(res.events || []);
    } catch (err) {
      console.error("Failed to load events:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const handleDeleteDraft = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to permanently delete the draft event "${name}"?`)) {
      return;
    }
    try {
      setActionLoading(id);
      await api.deleteEvent(id);
      await fetchEvents();
    } catch (err: any) {
      alert(err?.message || "Failed to delete draft event");
    } finally {
      setActionLoading(null);
    }
  };

  const filteredEvents = events.filter((ev) => {
    // Search match
    const matchesSearch =
      ev.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ev.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ev.slug.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    // Tab filter
    if (activeTab === "ALL") return true;
    if (activeTab === "PAST") {
      return ["REGISTRATION_CLOSED", "COMPLETED", "CANCELLED", "ARCHIVED"].includes(ev.status);
    }
    return ev.status === activeTab;
  });

  return (
    <AdminLayout
      title="Event Management"
      subtitle="Organize, publish, configure categories, and oversee race statuses"
      actions={
        <Link
          href="/admin/events/new"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>New Event</span>
        </Link>
      }
    >
      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl overflow-x-auto">
          {statusFilterTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                activeTab === tab.value
                  ? "bg-white text-slate-900 shadow-sm font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search events..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
      </div>

      {/* Events Table / Card Grid */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
          <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm">Loading events...</p>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-800">No events found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {searchQuery
              ? `No events matching "${searchQuery}". Try clearing your search.`
              : "Get started by creating your first running event."}
          </p>
          {!searchQuery && (
            <Link
              href="/admin/events/new"
              className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 bg-orange-600 text-white rounded-lg text-xs font-semibold hover:bg-orange-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create First Event</span>
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Event Details</th>
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEvents.map((ev) => (
                  <tr key={ev.id} className="hover:bg-slate-50/75 transition-colors">
                    <td className="py-4 px-4">
                      <div>
                        <Link
                          href={`/admin/events/${ev.id}/edit`}
                          className="font-semibold text-sm text-slate-900 hover:text-orange-600 transition-colors"
                        >
                          {ev.name}
                        </Link>
                        <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                          slug: /{ev.slug}
                        </p>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <Calendar className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        <span>
                          {ev.event_date ? new Date(ev.event_date).toLocaleDateString(undefined, {
                            weekday: "short",
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          }) : "TBD"}
                        </span>
                      </div>
                      {ev.start_time && (
                        <div className="flex items-center gap-1.5 text-slate-500 text-[11px] mt-0.5">
                          <Clock className="w-3 h-3 text-slate-400 flex-shrink-0" />
                          <span>
                            {new Date(ev.start_time).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-1.5 text-slate-700 max-w-xs truncate">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        <span className="truncate">{ev.location || "Online / TBD"}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <EventStatusBadge status={ev.status} />
                    </td>
                    <td className="py-4 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/events/${ev.slug}`}
                          target="_blank"
                          title="View public page"
                          className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Link>
                        <Link
                          href={`/admin/events/${ev.id}/edit`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md font-medium text-xs transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </Link>
                        {ev.status === "DRAFT" && (
                          <button
                            onClick={() => handleDeleteDraft(ev.id, ev.name)}
                            disabled={actionLoading === ev.id}
                            className="p-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-md transition-colors"
                            title="Delete Draft"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
