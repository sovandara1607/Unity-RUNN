import React, { useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { ArrowLeft, Save, Sparkles, Calendar, MapPin, Clock, Image as ImageIcon } from "lucide-react";
import { AdminLayout } from "../../../components/admin/AdminLayout";
import { api } from "../../../lib/api";

export default function AdminNewEventPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    cover_image: "",
    event_date: "",
    start_time: "06:00",
    location: "Koh Pich, Phnom Penh, Cambodia",
    registration_open_at: "",
    registration_close_at: "",
  });

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    setFormData((prev) => ({
      ...prev,
      name,
      slug: prev.slug === "" || prev.slug === generateSlug(prev.name) ? generateSlug(name) : prev.slug,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!formData.name || !formData.event_date || !formData.start_time || !formData.location) {
        throw new Error("Please fill out all required fields marked with *");
      }

      const payload: any = {
        name: formData.name,
        slug: formData.slug || generateSlug(formData.name),
        description: formData.description,
        cover_image: formData.cover_image || "https://images.unsplash.com/photo-1452626038306-9aae5e071dd3",
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

      const created = await api.createEvent(payload);
      router.push(`/admin/events/${created.id}/edit`);
    } catch (err: any) {
      console.error("Create event error:", err);
      setError(err?.message || "Failed to create event");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminLayout
      title="Create New Running Event"
      subtitle="Define race details and create in Draft mode"
      minRole="ADMIN"
      actions={
        <Link
          href="/admin/events"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Events</span>
        </Link>
      }
    >
      <div className="max-w-3xl mx-auto">
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
          {/* Section: Basic Details */}
          <div>
            <h3 className="text-base font-bold text-slate-900 mb-4 pb-2 border-b border-slate-100">
              Basic Event Information
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Event Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Unity Phnom Penh Half Marathon 2026"
                  value={formData.name}
                  onChange={handleNameChange}
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
                    placeholder="unity-half-marathon-2026"
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-r-xl focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Event Location / Venue *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Koh Pich Convention Center, Phnom Penh"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Event Date * (YYYY-MM-DD)
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
                  placeholder="Describe the race course, amenities, aid stations, and what participants can expect..."
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
                  placeholder="https://images.unsplash.com/photo-..."
                  value={formData.cover_image}
                  onChange={(e) => setFormData({ ...formData, cover_image: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>
          </div>

          {/* Section: Registration Schedule */}
          <div>
            <h3 className="text-base font-bold text-slate-900 mb-4 pb-2 border-b border-slate-100">
              Registration Window (Optional)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          </div>

          {/* Actions */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <Link
              href="/admin/events"
              className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 px-5 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors"
            >
              <Save className="w-4 h-4" />
              <span>{loading ? "Creating Draft..." : "Save Draft & Configure"}</span>
            </button>
          </div>
        </form>
      </div>
    </AdminLayout>
  );
}
