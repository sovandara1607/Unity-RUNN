import React, { useState, useEffect } from "react";
import {
  FileText,
  Search,
  Filter,
  ShieldAlert,
  Clock,
  User,
  Activity,
  CheckCircle,
  Tag,
} from "lucide-react";
import { AdminLayout } from "../../../components/admin/AdminLayout";
import { api } from "../../../lib/api";
import type { AuditLog } from "../../../types";

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [entityFilter, setEntityFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    async function loadLogs() {
      try {
        setLoading(true);
        // Fallback / initial sample logs
        const sampleLogs: AuditLog[] = [
          {
            id: "log-101",
            actor_user_id: "admin-001",
            action: "event.created",
            entity_type: "events",
            entity_id: "ev-phnom-penh-half-2026",
            metadata: { name: "Unity Phnom Penh Half Marathon 2026", status: "DRAFT" },
            created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
          },
          {
            id: "log-102",
            actor_user_id: "admin-001",
            action: "event.status_changed",
            entity_type: "events",
            entity_id: "ev-phnom-penh-half-2026",
            metadata: { old_status: "DRAFT", new_status: "REGISTRATION_OPEN" },
            created_at: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
          },
          {
            id: "log-103",
            actor_user_id: "system",
            action: "registration.confirmed",
            entity_type: "registrations",
            entity_id: "reg-94819",
            metadata: { full_name: "Chann Vuthy", category: "10K", amount_cents: 2500 },
            created_at: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
          },
          {
            id: "log-104",
            actor_user_id: "staff-sokha",
            action: "checkin.verified",
            entity_type: "check_ins",
            entity_id: "reg-94819",
            metadata: { station: "Gate A", tshirt_given: "L" },
            created_at: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
          },
          {
            id: "log-105",
            actor_user_id: "superadmin-001",
            action: "user.role_promoted",
            entity_type: "users",
            entity_id: "u-volunteer-02",
            metadata: { new_role: "STAFF" },
            created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
          },
        ];
        setLogs(sampleLogs);
      } finally {
        setLoading(false);
      }
    }
    loadLogs();
  }, []);

  const filteredLogs = logs.filter((log) => {
    if (entityFilter !== "ALL" && log.entity_type !== entityFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const match =
        log.action.toLowerCase().includes(q) ||
        log.entity_id.toLowerCase().includes(q) ||
        log.actor_user_id.toLowerCase().includes(q);
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
                    <span className="text-slate-800">{log.entity_id}</span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-600">
                    <div className="flex items-center gap-1.5 font-sans">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <span>{log.actor_user_id}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-slate-500 max-w-xs truncate">
                    {log.metadata ? JSON.stringify(log.metadata) : "-"}
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
