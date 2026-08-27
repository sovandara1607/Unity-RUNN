import React, { useState, useEffect } from "react";
import {
  Search,
  Download,
  Users,
  Eye,
  Phone,
  Mail,
  X,
} from "lucide-react";
import { AdminLayout } from "../../../components/admin/AdminLayout";
import { SkeletonTable } from "../../../components/Skeleton";
import { withMinSkeleton } from "../../../lib/withMinSkeleton";
import { RegistrationStatusBadge } from "../../../components/admin/RegistrationStatusBadge";
import { useAlerts } from "../../../components/alerts/AlertSystem";
import { api } from "../../../lib/api";
import type { Registration, Event } from "../../../types";

export default function AdminRegistrationsPage() {
  const { notify } = useAlerts();
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedReg, setSelectedReg] = useState<Registration | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [regsRes, eventsRes] = await withMinSkeleton(() => Promise.all([
        api.adminListRegistrations({ limit: 200 }),
        api.listEvents({ limit: 100 }),
      ]));
      setRegistrations(regsRes.registrations || []);
      setEvents(eventsRes.events || []);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredRegistrations = registrations.filter((reg) => {
    if (selectedEventId !== "ALL" && reg.event_id !== selectedEventId) return false;
    if (selectedStatus !== "ALL" && reg.status !== selectedStatus) return false;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const match =
        (reg.full_name && reg.full_name.toLowerCase().includes(q)) ||
        (reg.email && reg.email.toLowerCase().includes(q)) ||
        (reg.phone && reg.phone.includes(q)) ||
        (reg.registration_number && reg.registration_number.toLowerCase().includes(q)) ||
        (reg.id && reg.id.toLowerCase().includes(q));
      if (!match) return false;
    }

    return true;
  });

  const exportToCSV = () => {
    if (filteredRegistrations.length === 0) {
      notify({ tone: "warning", title: "Nothing to export", message: "Adjust the filters or wait for registrations before downloading a roster." });
      return;
    }

    const headers = [
      "Registration Number",
      "Full Name",
      "Email",
      "Phone",
      "Gender",
      "Date of Birth",
      "T-shirt Size",
      "Emergency Contact Name",
      "Emergency Contact Phone",
      "Status",
      "Event ID",
      "Registered At",
    ];

    const rows = filteredRegistrations.map((r) => [
      `"${r.registration_number || r.id.slice(0, 8)}"`,
      `"${r.full_name || ""}"`,
      `"${r.email || ""}"`,
      `"${r.phone || ""}"`,
      `"${r.gender || ""}"`,
      `"${r.date_of_birth ? r.date_of_birth.slice(0, 10) : ""}"`,
      `"${r.tshirt_size || ""}"`,
      `"${r.emergency_contact_name || ""}"`,
      `"${r.emergency_contact_phone || ""}"`,
      `"${r.status}"`,
      `"${r.event_id}"`,
      `"${new Date(r.created_at).toISOString()}"`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `unity_registrations_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    notify({ tone: "success", title: "Roster exported", message: `${filteredRegistrations.length} registration${filteredRegistrations.length === 1 ? "" : "s"} saved as CSV.` });
  };

  return (
    <AdminLayout
      title="Runner roster"
      subtitle="View, search, filter participants, and export attendee rosters"
      actions={
        <button
          onClick={exportToCSV}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export CSV</span>
        </button>
      }
    >
      {/* Filters and Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Event Filter */}
          <div>
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="px-3 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="ALL">All Events ({events.length})</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-3 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="PENDING">Pending</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="REFUNDED">Refunded</option>
            </select>
          </div>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by name, email, ref #..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
      </div>

      {/* Registrations Data Table */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <SkeletonTable rows={8} cols={5} />
        </div>
      ) : filteredRegistrations.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-800">No registrations found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {searchQuery
              ? `No registrations matching "${searchQuery}".`
              : "No registrations match the selected filters."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="divide-y divide-slate-100 md:hidden">
            {filteredRegistrations.map((reg) => (
              <button key={reg.id} type="button" onClick={() => setSelectedReg(reg)} className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-4 text-left transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#3155ff]">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">{reg.full_name || "Runner"}</p>
                  <p className="mt-0.5 truncate text-[10px] text-slate-400">{reg.email}</p>
                  <p className="mt-2 font-mono text-[10px] font-bold text-slate-600">{reg.registration_number || `#${reg.id.slice(0, 8)}`}</p>
                </div>
                <div className="flex flex-col items-end justify-between gap-2">
                  <RegistrationStatusBadge status={reg.status} />
                  <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">Kit {reg.tshirt_size || "—"} · View</span>
                </div>
              </button>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Participant</th>
                  <th className="py-3 px-4">Ref Number</th>
                  <th className="py-3 px-4">T-shirt / Kit</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Registered</th>
                  <th className="py-3 px-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRegistrations.map((reg) => (
                  <tr key={reg.id} className="hover:bg-slate-50/75 transition-colors">
                    <td className="py-3.5 px-4">
                      <div>
                        <button
                          onClick={() => setSelectedReg(reg)}
                          className="font-semibold text-sm text-slate-900 hover:text-orange-600 transition-colors text-left"
                        >
                          {reg.full_name || "Runner"}
                        </button>
                        <p className="text-[11px] text-slate-400">{reg.email}</p>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono font-medium text-slate-800">
                      {reg.registration_number || `#${reg.id.slice(0, 8)}`}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="text-slate-700">
                        <span className="font-semibold">{reg.tshirt_size || "N/A"}</span>
                        {reg.gender && (
                          <span className="text-slate-400 text-[11px] ml-1">({reg.gender})</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <RegistrationStatusBadge status={reg.status} />
                    </td>
                    <td className="py-3.5 px-4 text-slate-500">
                      {new Date(reg.created_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => setSelectedReg(reg)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md font-medium text-xs transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
            <span>Showing {filteredRegistrations.length} of {registrations.length} registrations</span>
          </div>
        </div>
      )}

      {/* Participant Detail Drawer / Modal */}
      {selectedReg && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setSelectedReg(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center font-bold text-base">
                {selectedReg.full_name ? selectedReg.full_name.charAt(0) : "R"}
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">{selectedReg.full_name}</h3>
                <p className="text-xs text-slate-500 font-mono">
                  Ref: {selectedReg.registration_number || selectedReg.id}
                </p>
              </div>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Status</span>
                  <RegistrationStatusBadge status={selectedReg.status} />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">T-shirt Size</span>
                  <span className="font-semibold text-slate-800">{selectedReg.tshirt_size || "Standard"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Gender</span>
                  <span className="font-semibold text-slate-800">{selectedReg.gender || "Not specified"}</span>
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-slate-900 mb-2">Contact Details</h4>
                <div className="p-3.5 rounded-xl border border-slate-200 space-y-2">
                  <p className="flex items-center gap-2 text-slate-700">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    <span>{selectedReg.email}</span>
                  </p>
                  <p className="flex items-center gap-2 text-slate-700">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span>{selectedReg.phone || "No phone provided"}</span>
                  </p>
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-slate-900 mb-2">Emergency Contact</h4>
                <div className="p-3.5 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Contact Name:</span>
                    <span className="font-semibold text-slate-800">{selectedReg.emergency_contact_name || "N/A"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Contact Phone:</span>
                    <span className="font-semibold text-slate-800">{selectedReg.emergency_contact_phone || "N/A"}</span>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setSelectedReg(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
