import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import {
  ArrowLeft,
  Save,
  Clock,
  ExternalLink,
  CheckCircle,
  AlertTriangle,
  Play,
  Lock,
  Archive,
  Ban,
  Layers,
  type LucideIcon,
} from "lucide-react";
import { AdminLayout } from "../../../../components/admin/AdminLayout";
import { EventPosterField } from "../../../../components/admin/EventPosterField";
import { EventLocationField } from "../../../../components/admin/EventLocationField";
import { Skeleton, SkeletonText } from "../../../../components/Skeleton";
import { withMinSkeleton } from "../../../../lib/withMinSkeleton";
import { EventStatusBadge } from "../../../../components/admin/EventStatusBadge";
import { AlertBanner } from "../../../../components/alerts/AlertSystem";
import { api } from "../../../../lib/api";
import type { Event, EventDetail, EventStatus } from "../../../../types";
import { formatMoney } from "../../../../lib/money";
import { parseEventCoordinates } from "../../../../lib/eventLocation";

const statusTransitions: Record<EventStatus, { next: EventStatus; label: string; icon: LucideIcon; color: string }[]> = {
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
  const [posterUploading, setPosterUploading] = useState(false);
  const [posterError, setPosterError] = useState<string | null>(null);
  const coverImageRef = useRef("");
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
    latitude: "",
    longitude: "",
    registration_open_at: "",
    registration_close_at: "",
  });

  const loadEvent = useCallback(async () => {
    if (!id || typeof id !== "string") return;
    try {
      setLoading(true);
      const found = await withMinSkeleton(() => api.getEventById(id));
      setEvent(found);
      coverImageRef.current = found.cover_image || "";
      setFormData({
        name: found.name || "",
        slug: found.slug || "",
        description: found.description || "",
        cover_image: found.cover_image || "",
        event_date: found.event_date ? found.event_date.slice(0, 10) : "",
        start_time: found.start_time ? found.start_time.slice(11, 16) : "06:00",
        location: found.location || "",
        latitude: found.latitude == null ? "" : String(found.latitude),
        longitude: found.longitude == null ? "" : String(found.longitude),
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load event");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadEvent();
  }, [loadEvent]);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update event status");
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

      if (posterUploading) {
        throw new Error("Wait for the event poster to finish uploading before saving.");
      }
      if (posterError) {
        throw new Error(`Fix the event poster before saving: ${posterError}`);
      }

      const coordinates = parseEventCoordinates(formData.latitude, formData.longitude);
      const payload: Partial<Event> & { clear_coordinates?: boolean } = {
        name: formData.name,
        slug: formData.slug,
        description: formData.description,
        cover_image: coverImageRef.current.trim(),
        event_date: formData.event_date,
        start_time: formData.start_time,
        location: formData.location,
        latitude: coordinates?.latitude,
        longitude: coordinates?.longitude,
        clear_coordinates: !coordinates,
      };

      if (formData.registration_open_at) {
        payload.registration_open_at = new Date(formData.registration_open_at).toISOString();
      }
      if (formData.registration_close_at) {
        payload.registration_close_at = new Date(formData.registration_close_at).toISOString();
      }

      const updated = await api.updateEvent(event.id, payload);
      if (payload.cover_image && updated.cover_image !== payload.cover_image) {
        throw new Error("The event details were saved, but its poster was not attached. Please save again.");
      }
      coverImageRef.current = updated.cover_image || "";
      setEvent(updated);
      setFormData((current) => ({ ...current, cover_image: coverImageRef.current }));
      setSuccessMessage("Event details updated successfully");
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save event details");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout title="Edit Event" minRole="ADMIN">
        <div className="max-w-3xl space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 space-y-5">
            <Skeleton tone="light" className="h-3 w-40" />
            <Skeleton tone="light" className="h-10 w-full max-w-xl rounded-lg" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i}>
                  <Skeleton tone="light" className="h-3 w-20" />
                  <Skeleton tone="light" className="mt-1.5 h-[38px] w-full rounded-lg" />
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 space-y-4">
            <Skeleton tone="light" className="h-3 w-32" />
            <SkeletonText tone="light" lines={3} />
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (!event) {
    return (
      <AdminLayout title="Edit Event" minRole="ADMIN">
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
        <AlertBanner tone="success" title="Event updated" className="mb-6" onDismiss={() => setSuccessMessage(null)}>{successMessage}</AlertBanner>
      )}
      {error && (
        <AlertBanner tone="error" title="Event needs attention" className="mb-6" onDismiss={() => setError(null)}>{error}</AlertBanner>
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

            <div className="sm:col-span-2">
              <EventLocationField
                location={formData.location}
                latitude={formData.latitude}
                longitude={formData.longitude}
                disabled={saving}
                onChange={(location) => setFormData((current) => ({ ...current, ...location }))}
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
              <EventPosterField
                value={formData.cover_image}
                onChange={(cover_image) => {
                  coverImageRef.current = cover_image;
                  setFormData((current) => ({ ...current, cover_image }));
                }}
                disabled={saving}
                onUploadStateChange={setPosterUploading}
                onUploadError={setPosterError}
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
              disabled={saving || posterUploading}
              className="inline-flex items-center gap-2 px-5 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors"
            >
              <Save className="w-4 h-4" />
              <span>{posterUploading ? "Uploading poster..." : saving ? "Saving Changes..." : "Save Changes"}</span>
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
                    <p>Price: <span className="font-semibold text-slate-900">{formatMoney(cat.price_cents, cat.currency)}</span></p>
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
                    {item.time ? item.time.slice(11, 16) : "Time"}
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
