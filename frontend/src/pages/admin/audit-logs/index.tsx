import React, { useState, useEffect } from "react";
import { Search, User } from "lucide-react";
import { AdminLayout } from "../../../components/admin/AdminLayout";
import { Skeleton } from "../../../components/Skeleton";
import { api } from "../../../lib/api";
import { withMinSkeleton } from "../../../lib/withMinSkeleton";
import type { AuditLog } from "../../../types";

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entityFilter, setEntityFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    async function loadLogs() {
      try {
        setLoading(true);
        setError(null);
        const data = await withMinSkeleton(() => api.adminListAuditLogs({ entity_type: entityFilter, limit: 200 }));
        setLogs(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load audit logs");
        setLogs([]);
      } finally {
        setLoading(false);
      }
    }
    loadLogs();
  }, [entityFilter]);

  const filteredLogs = logs.filter((log) => {
    if (entityFilter !== "ALL" && log.entity_type !== entityFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const match =
        log.action.toLowerCase().includes(q) ||
        (log.entity_id || "").toLowerCase().includes(q) ||
        (log.actor_id || "").toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  return (
    <AdminLayout
      title="System Audit Trail"
      subtitle="Security and event activity history tracking sensitive operations and state transitions"
      minRole="ADMIN"
    >
      {/* Search and Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-6 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="px-3 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="ALL">All Domains ({logs.length})</option>
            <option value="events">Events</option>
            <option value="registrations">Registrations</option>
            <option value="check_ins">Check-ins</option>
            <option value="users">Users</option>
          </select>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by action, ID, actor..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Entity Target</th>
                <th className="py-3 px-4">Actor</th>
                <th className="py-3 px-4">Metadata</th>
                <th className="py-3 px-4 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
              {error && (
                <tr>
                  <td colSpan={5} className="py-10 px-4 text-center text-rose-600 font-sans">{error}</td>
                </tr>
              )}
              {!error && loading && [0, 1, 2, 3, 4, 5].map((i) => (
                <tr key={i}>
                  <td colSpan={5} className="px-4 py-3.5">
                    <div className="flex items-center gap-4">
                      <Skeleton tone="light" className="h-6 w-28 rounded-md" />
                      <Skeleton tone="light" className="h-4 flex-1 max-w-[220px]" />
                      <Skeleton tone="light" className="h-4 w-40" />
                      <Skeleton tone="light" className="h-4 w-16 ml-auto" />
                    </div>
                  </td>
                </tr>
              ))}
              {!error && !loading && filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 px-4 text-center text-slate-400 font-sans">
                    No audit entries yet. Check-ins and staff actions will appear here.
                  </td>
                </tr>
              )}
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/75 transition-colors">
                  <td className="py-3.5 px-4 font-bold text-slate-900 font-sans">
                    <span className="px-2 py-1 bg-slate-100 rounded-md text-slate-800 text-xs">
                      {log.action}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-700">
                    <span className="text-slate-400 uppercase text-[10px] mr-1 block">
                      [{log.entity_type}]
                    </span>
                    <span className="text-slate-800">{log.entity_id ?? "-"}</span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-600">
                    <div className="flex items-center gap-1.5 font-sans">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <span>{log.actor_id ?? "system"}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-slate-500 max-w-xs truncate">
                    {log.metadata && Object.keys(log.metadata).length > 0 ? JSON.stringify(log.metadata) : "-"}
                  </td>
                  <td className="py-3.5 px-4 text-right text-slate-500 font-sans">
                    {new Date(log.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
