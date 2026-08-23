import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import {
  ArrowLeft,
  Save,
  Trash2,
  Calendar,
  Clock,
  MapPin,
  ExternalLink,
  CheckCircle,
  AlertTriangle,
  Play,
  Lock,
  Archive,
  Ban,
  Layers,
  HelpCircle,
  ShieldCheck,
  Plus,
} from "lucide-react";
import { AdminLayout } from "../../../../components/admin/AdminLayout";
import { EventStatusBadge } from "../../../../components/admin/EventStatusBadge";
import { api } from "../../../../lib/api";
import type { Event, EventDetail, EventStatus } from "../../../../types";

const statusTransitions: Record<EventStatus, { next: EventStatus; label: string; icon: any; color: string }[]> = {
  DRAFT: [
    { next: "PUBLISHED", label: "Publish Event", icon: Play, color: "bg-blue-600 hover:bg-blue-700 text-white" },
    { next: "CANCELLED", label: "Cancel Event", icon: Ban, color: "bg-rose-600 hover:bg-rose-700 text-white" },
  ],
  PUBLISHED: [
    { next: "REGISTRATION_OPEN", label: "Open Registrations", icon: Play, color: "bg-emerald-600 hover:bg-emerald-700 text-white" },
    { next: "CANCELLED", label: "Cancel Event", icon: Ban, color: "bg-rose-600 hover:bg-rose-700 text-white" },
  ],
  REGISTRATION_OPEN: [
    { next: "REGISTRATION_CLOSED", label: "Close Registrations", icon: Lock, color: "bg-amber-600 hover:bg-amber-700 text-white" },
    { next: "CANCELLED", label: "Cancel Event", icon: Ban, color: "bg-rose-600 hover:bg-rose-700 text-white" },
  ],
  REGISTRATION_CLOSED: [
    { next: "COMPLETED", label: "Mark as Completed", icon: CheckCircle, color: "bg-purple-600 hover:bg-purple-700 text-white" },
    { next: "CANCELLED", label: "Cancel Event", icon: Ban, color: "bg-rose-600 hover:bg-rose-700 text-white" },
  ],
  COMPLETED: [
    { next: "ARCHIVED", label: "Archive Event", icon: Archive, color: "bg-zinc-700 hover:bg-zinc-800 text-white" },
  ],
  CANCELLED: [
    { next: "ARCHIVED", label: "Archive Event", icon: Archive, color: "bg-zinc-700 hover:bg-zinc-800 text-white" },
  ],
  ARCHIVED: [],
};

export default function AdminEditEventPage() {
  const router = useRouter();
  const { id } = router.query;

  const [event, setEvent] = useState<Event | null>(null);
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"details" | "categories" | "schedule" | "faqs">("details");

  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    cover_image: "",
    event_date: "",
    start_time: "06:00",
    location: "",
    registration_open_at: "",
    registration_close_at: "",
  });

  const loadEvent = async () => {
    if (!id || typeof id !== "string") return;
    try {
      setLoading(true);
      // Fetch event from list by ID
      const listRes = await api.listEvents({ limit: 100 });
      const found = listRes.events?.find((e) => e.id === id);
      if (found) {
        setEvent(found);
        setFormData({
          name: found.name || "",
          slug: found.slug || "",
          description: found.description || "",
          cover_image: found.cover_image || "",
          event_date: found.event_date ? found.event_date.slice(0, 10) : "",
          start_time: found.start_time ? found.start_time.slice(11, 16) : "06:00",
          location: found.location || "",
          registration_open_at: found.registration_open_at ? found.registration_open_at.slice(0, 16) : "",
          registration_close_at: found.registration_close_at ? found.registration_close_at.slice(0, 16) : "",
        });

        // Try to fetch child detail
        try {
          const detailRes = await api.getEvent(found.slug);
          setDetail(detailRes);
        } catch {
          // child detail optional
        }
      } else {
        setError("Event not found");
      }
    } catch (err: any) {
      console.error("Load event error:", err);
      setError(err?.message || "Failed to load event");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvent();
  }, [id]);

  const handleStatusChange = async (nextStatus: EventStatus) => {
    if (!event) return;
    if (
      nextStatus === "CANCELLED" &&
      !confirm("Are you sure you want to cancel this event? Confirmed participants will receive cancellation notifications.")
    ) {
      return;
    }

    try {
      setStatusUpdating(true);
      setError(null);
      const updated = await api.updateEvent(event.id, { status: nextStatus });
      setEvent(updated);
      setSuccessMessage(`Event status successfully moved to ${nextStatus}`);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      console.error("Status transition error:", err);
      setError(err?.message || "Failed to update event status");
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!event) return;
    try {
      setSaving(true);
      setError(null);

      const payload: any = {
        name: formData.name,
        slug: formData.slug,
        description: formData.description,
        cover_image: formData.cover_image,
        event_date: formData.event_date,
        start_time: formData.start_time,
        location: formData.location,
      };

      if (formData.registration_open_at) {
        payload.registration_open_at = new Date(formData.registration_open_at).toISOString();
      }
      if (formData.registration_close_at) {
        payload.registration_close_at = new Date(formData.registration_close_at).toISOString();
      }

      const updated = await api.updateEvent(event.id, payload);
      setEvent(updated);
      setSuccessMessage("Event details updated successfully");
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      console.error("Save event error:", err);
      setError(err?.message || "Failed to save event details");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout title="Edit Event">
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
          <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm">Loading event details...</p>
        </div>
      </AdminLayout>
    );
  }

  if (!event) {
    return (
      <AdminLayout title="Edit Event">
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-900">Event Not Found</h3>
          <p className="text-xs text-slate-500 mt-1">The requested event could not be loaded.</p>
          <Link
            href="/admin/events"
            className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-orange-600 text-white rounded-xl text-xs font-semibold"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Events
          </Link>
        </div>
      </AdminLayout>
    );
  }

  const nextTransitions = statusTransitions[event.status] || [];

  return (
    <AdminLayout
      title={`Edit: ${event.name}`}
      subtitle={`Manage event configurations, categories, and lifecycle state`}
      minRole="ADMIN"
      actions={
        <div className="flex items-center gap-2">
          <Link
            href={`/events/${event.slug}`}
            target="_blank"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Public Page</span>
          </Link>
          <Link
            href="/admin/events"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </Link>
        </div>
      }
    >
      {/* Notifications */}
      {successMessage && (
        <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600" />
          <span>{successMessage}</span>
        </div>
      )}
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
          {error}
        </div>
      )}

      {/* Lifecycle Status & Transitions Bar */}
      <div className="mb-6 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider block">Current Status</span>
          <div className="mt-1 flex items-center gap-3">
            <EventStatusBadge status={event.status} />
            <span className="text-xs text-slate-400 font-mono">ID: {event.id}</span>
          </div>
        </div>

        {/* Transition Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {nextTransitions.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.next}
                onClick={() => handleStatusChange(t.next)}
                disabled={statusUpdating}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold shadow-sm transition-all disabled:opacity-50 ${t.color}`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
          {nextTransitions.length === 0 && (
            <span className="text-xs text-slate-400 italic">No further status transitions (Terminal state)</span>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 mb-6 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab("details")}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${
            activeTab === "details"
              ? "bg-orange-50 text-orange-700"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          Event Details
        </button>
        <button
          onClick={() => setActiveTab("categories")}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
            activeTab === "categories"
              ? "bg-orange-50 text-orange-700"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Categories ({detail?.categories?.length ?? 0})</span>
        </button>
        <button
          onClick={() => setActiveTab("schedule")}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
            activeTab === "schedule"
              ? "bg-orange-50 text-orange-700"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Race Schedule ({detail?.schedule?.length ?? 0})</span>
        </button>
      </div>

      {/* Tab: Event Details */}
      {activeTab === "details" && (
        <form onSubmit={handleSaveDetails} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Event Name *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                URL Slug
              </label>
              <div className="flex items-center">
                <span className="text-xs text-slate-400 bg-slate-50 px-3 py-2 border border-r-0 border-slate-200 rounded-l-xl">
                  /events/
                </span>
                <input
                  type="text"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-r-xl focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Location / Venue *
              </label>
              <input
                type="text"
                required
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Event Date *
              </label>
              <input
                type="date"
                required
                value={formData.event_date}
                onChange={(e) => setFormData({ ...formData, event_date: e.target.value })}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Start Time * (HH:MM)
              </label>
              <input
                type="time"
                required
                value={formData.start_time}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Description
              </label>
              <textarea
                rows={4}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Cover Image URL
              </label>
              <input
                type="url"
                value={formData.cover_image}
                onChange={(e) => setFormData({ ...formData, cover_image: e.target.value })}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Registration Opens At
              </label>
              <input
                type="datetime-local"
                value={formData.registration_open_at}
                onChange={(e) => setFormData({ ...formData, registration_open_at: e.target.value })}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Registration Closes At
              </label>
              <input
                type="datetime-local"
                value={formData.registration_close_at}
                onChange={(e) => setFormData({ ...formData, registration_close_at: e.target.value })}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? "Saving Changes..." : "Save Changes"}</span>
            </button>
          </div>
        </form>
      )}

      {/* Tab: Categories */}
      {activeTab === "categories" && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-900">Race Categories & Capacities</h3>
              <p className="text-xs text-slate-500">Configured distances, pricing, and slots</p>
            </div>
          </div>

          {detail?.categories && detail.categories.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {detail.categories.map((cat) => (
                <div key={cat.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-sm text-slate-900">{cat.name}</h4>
                    <span className="text-xs px-2 py-0.5 rounded bg-orange-100 text-orange-800 font-semibold">
                      {cat.distance}
                    </span>
                  </div>
                  <div className="mt-3 space-y-1 text-xs text-slate-600">
                    <p>Price: <span className="font-semibold text-slate-900">${(cat.price_cents / 100).toFixed(2)}</span></p>
                    <p>Capacity: <span className="font-semibold text-slate-900">{cat.capacity} runners</span></p>
                    <p>Status: <span className="capitalize">{cat.status}</span></p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-400 text-xs">
              No categories configured for this event.
            </div>
          )}
        </div>
      )}

      {/* Tab: Schedule */}
      {activeTab === "schedule" && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-bold text-slate-900 mb-1">Event Timeline</h3>
          <p className="text-xs text-slate-500 mb-4">Day-of schedule for participants</p>

          {detail?.schedule && detail.schedule.length > 0 ? (
            <div className="space-y-3">
              {detail.schedule.map((item) => (
                <div key={item.id} className="flex items-start gap-4 p-3.5 rounded-xl border border-slate-100 bg-slate-50/50">
                  <div className="text-xs font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded">
                    {item.time ? new Date(item.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Time"}
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-slate-900">{item.title}</h4>
                    {item.description && <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-400 text-xs">
              No schedule items configured.
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  );
}
