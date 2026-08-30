import React, { useState, useEffect } from "react";
import {
  Search,
  Download,
  Users,
  Eye,
  Phone,
  Mail,
  X,
  FileSpreadsheet,
  LoaderCircle,
  ShieldCheck,
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
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const activeFilters = React.useMemo(() => ({
    event_id: selectedEventId === "ALL" ? undefined : selectedEventId,
    status: selectedStatus === "ALL" ? undefined : selectedStatus,
    search: searchQuery.trim() || undefined,
  }), [selectedEventId, selectedStatus, searchQuery]);

  useEffect(() => {
    void api.listEvents({ limit: 100 }).then((result) => setEvents(result.events || [])).catch(() => {
      notify({ tone: "error", title: "Events unavailable", message: "The event filter could not be loaded." });
    });
  }, [notify]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const result = await withMinSkeleton(() => api.adminListRegistrations({ ...activeFilters, limit: 200, offset: 0 }));
        if (active) { setRegistrations(result.registrations || []); setTotal(result.total || 0); }
      } catch (caught) {
        if (active) notify({ tone: "error", title: "Roster unavailable", message: caught instanceof Error ? caught.message : "Could not load registrations." });
      } finally { if (active) setLoading(false); }
    }, activeFilters.search ? 250 : 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [activeFilters, notify]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const result = await api.adminListRegistrations({ ...activeFilters, limit: 200, offset: registrations.length });
      setRegistrations((current) => [...current, ...(result.registrations || [])]);
      setTotal(result.total || 0);
    } catch (caught) {
      notify({ tone: "error", title: "More runners not loaded", message: caught instanceof Error ? caught.message : "Try again." });
    } finally { setLoadingMore(false); }
  };

  const exportToCSV = async () => {
    setExporting(true);
    try {
      const { blob, filename } = await api.adminExportRegistrations(activeFilters);
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = filename || "unity-roster.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 1000);
      setExportOpen(false);
      notify({ tone: "success", title: "Roster exported", message: `${total} filtered registration${total === 1 ? "" : "s"} saved as CSV.` });
    } catch (caught) {
      notify({ tone: "error", title: "Roster not exported", message: caught instanceof Error ? caught.message : "Could not download the roster." });
    } finally { setExporting(false); }
  };

  const selectedEvent = events.find((event) => event.id === selectedEventId);

  return (
    <AdminLayout
      title="Runner roster"
      subtitle="View, search, filter participants, and export attendee rosters"
      actions={
        <button
          onClick={() => total > 0 ? setExportOpen(true) : notify({ tone: "warning", title: "Nothing to export", message: "Adjust the filters or wait for registrations before downloading a roster." })}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Review export</span>
        </button>
      }
    >
      {/* Filters and Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Event Filter */}
          <div>
            <select
              aria-label="Filter roster by event"
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
              aria-label="Filter roster by status"
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
            aria-label="Search runner roster"
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
      ) : registrations.length === 0 ? (
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
            {registrations.map((reg) => (
              <button key={reg.id} type="button" onClick={() => setSelectedReg(reg)} className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-4 text-left transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#3155ff]">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">{reg.full_name || "Runner"}</p>
                  <p className="mt-0.5 truncate text-[10px] text-slate-400">{reg.email}</p>
                  {(reg.event_name || reg.category_name) && <p className="mt-1 truncate text-[10px] font-semibold text-[#3155ff]">{[reg.event_name, reg.category_name].filter(Boolean).join(" · ")}</p>}
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
                {registrations.map((reg) => (
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
                        {(reg.event_name || reg.category_name) && <p className="mt-0.5 text-[10px] font-semibold text-[#3155ff]">{[reg.event_name, reg.category_name].filter(Boolean).join(" · ")}</p>}
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

          <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 p-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <span>Showing {registrations.length} of {total} matching registrations</span>
            {registrations.length < total && <button type="button" disabled={loadingMore} onClick={() => void loadMore()} className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-[10px] font-black uppercase tracking-[.08em] text-slate-700 hover:border-slate-400 disabled:opacity-50">{loadingMore && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}{loadingMore ? "Loading" : "Load more"}</button>}
          </div>
        </div>
      )}

      {exportOpen && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/55 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !exporting) setExportOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="roster-export-title" className="w-full max-w-md overflow-hidden rounded-2xl bg-[#151515] text-white shadow-2xl">
            <div className="border-b border-white/10 p-5"><p className="font-mono text-[9px] font-black uppercase tracking-[.16em] text-[#d9ff00]">Roster manifest</p><h3 id="roster-export-title" className="mt-2 text-xl font-black">Review CSV export</h3><p className="mt-2 text-xs leading-5 text-white/45">This file contains runner contact and emergency information. Store it only where race staff can access it.</p></div>
            <div className="p-5">
              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-white/10"><ExportFact label="Rows" value={String(total)} /><ExportFact label="Event" value={selectedEvent?.name || "All events"} /><ExportFact label="Status" value={selectedStatus === "ALL" ? "All statuses" : selectedStatus.toLowerCase()} /><ExportFact label="Search" value={searchQuery.trim() || "No search filter"} /></dl>
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#d9ff00]/20 bg-[#d9ff00]/[.07] p-3"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#d9ff00]" /><p className="text-[10px] font-medium leading-4 text-white/55">The server exports every matching runner, including results not loaded on this screen, and neutralizes spreadsheet formulas.</p></div>
            </div>
            <div className="flex justify-end gap-2 border-t border-white/10 p-4"><button type="button" autoFocus disabled={exporting} onClick={() => setExportOpen(false)} className="h-10 rounded-xl border border-white/15 px-4 text-[10px] font-black uppercase tracking-[.08em] text-white/60">Keep browsing</button><button type="button" disabled={exporting} onClick={() => void exportToCSV()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#d9ff00] px-4 text-[10px] font-black uppercase tracking-[.08em] text-black disabled:opacity-50">{exporting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}{exporting ? "Preparing" : `Download ${total} rows`}</button></div>
          </section>
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

function ExportFact({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 bg-[#1d1d1d] p-3"><dt className="font-mono text-[8px] font-black uppercase tracking-[.12em] text-white/30">{label}</dt><dd className="mt-1 truncate text-[11px] font-bold capitalize text-white/75" title={value}>{value}</dd></div>;
}
