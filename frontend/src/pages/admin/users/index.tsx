import React, { useState, useEffect } from "react";
import { Search } from "lucide-react";
import { AdminLayout } from "../../../components/admin/AdminLayout";
import { AlertBanner } from "../../../components/alerts/AlertSystem";
import { Skeleton } from "../../../components/Skeleton";
import { api, type ApiError } from "../../../lib/api";
import type { Role, User } from "../../../types";

const roleDescriptions: Record<Role, { label: string; badge: string; desc: string }> = {
  USER: {
    label: "User (Participant)",
    badge: "bg-slate-100 text-slate-700 border-slate-200",
    desc: "Standard runner account. Can register for events and manage their tickets.",
  },
  STAFF: {
    label: "Staff (Volunteer)",
    badge: "bg-blue-50 text-blue-700 border-blue-200",
    desc: "Race-day volunteer. Can operate the QR check-in terminal and view attendee lists.",
  },
  ADMIN: {
    label: "Admin (Organizer)",
    badge: "bg-orange-50 text-orange-700 border-orange-200",
    desc: "Race organizer. Full access to create and manage events, categories, and export rosters.",
  },
  SUPER_ADMIN: {
    label: "Super Admin",
    badge: "bg-purple-50 text-purple-700 border-purple-200",
    desc: "Full system administrative control, user role management, and audit inspection.",
  },
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    async function loadUsers() {
      try {
        setLoading(true);
        const result = await api.adminListUsers({ limit: 500 });
        setUsers(result.users);
      } catch (caught: unknown) {
        const err = caught as ApiError;
        const endpoint = err.method && err.path ? ` (${err.method} ${err.path})` : "";
        setFeedback({
          type: "error",
          text: `${err.message || "Failed to load users"}${endpoint}`,
        });
      } finally {
        setLoading(false);
      }
    }
    loadUsers();
  }, []);

  const handleRoleChange = async (userId: string, targetUserEmail: string, newRole: Role) => {
    if (!confirm(`Are you sure you want to change the role of ${targetUserEmail} to ${newRole}?`)) {
      return;
    }

    try {
      setUpdatingUserId(userId);
      setFeedback(null);

      const updated = await api.adminUpdateUserRole(userId, newRole);
      setUsers((current) => current.map((user) => user.id === userId ? updated : user));
      setFeedback({ type: "success", text: `${targetUserEmail} is now ${newRole}.` });
      setTimeout(() => setFeedback(null), 4000);
    } catch (caught: unknown) {
      const err = caught instanceof Error ? caught : null;
      setFeedback({
        type: "error",
        text: err?.message || "Failed to update user role",
      });
    } finally {
      setUpdatingUserId(null);
    }
  };

  const filteredUsers = users.filter((u) => {
    if (roleFilter !== "ALL" && u.role !== roleFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!u.email.toLowerCase().includes(q) && !u.id.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  return (
    <AdminLayout
      title="Team access"
      subtitle="Super Admin permissions: assign roles, manage staff access, and oversee privileges"
      minRole="SUPER_ADMIN"
    >
      {feedback && (
        <AlertBanner tone={feedback.type} title={feedback.type === "success" ? "Access updated" : "Access update failed"} className="mb-6" onDismiss={() => setFeedback(null)}>{feedback.text}</AlertBanner>
      )}

      {/* Role Hierarchy Explainer Cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:mb-8 lg:grid-cols-4 lg:gap-4">
        {(Object.keys(roleDescriptions) as Role[]).map((r) => {
          const info = roleDescriptions[r];
          return (
            <div key={r} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${info.badge}`}>
                {r}
              </span>
              <p className="mt-2 text-[11px] font-bold text-slate-800 sm:text-xs">{info.label}</p>
              <p className="mt-1 line-clamp-3 text-[10px] leading-4 text-slate-500 sm:text-[11px] sm:leading-relaxed">{info.desc}</p>
            </div>
          );
        })}
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-6 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="ALL">All Roles ({users.length})</option>
            <option value="SUPER_ADMIN">Super Admins</option>
            <option value="ADMIN">Admins</option>
            <option value="STAFF">Staff</option>
            <option value="USER">Users</option>
          </select>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by email or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="divide-y divide-slate-100 md:hidden">
          {loading && [0, 1, 2].map((index) => <div key={index} className="space-y-3 p-4"><Skeleton tone="light" className="h-4 w-48" /><Skeleton tone="light" className="h-9 w-full rounded-xl" /></div>)}
          {!loading && filteredUsers.map((user) => (
            <div key={user.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{user.email}</p><p className="mt-1 font-mono text-[9px] text-slate-400">Joined {new Date(user.created_at).toLocaleDateString()}</p></div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold ${roleDescriptions[user.role]?.badge || "bg-slate-100"}`}>{user.role}</span>
              </div>
              <label className="mt-3 block text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400" htmlFor={`mobile-role-${user.id}`}>Access level</label>
              <select id={`mobile-role-${user.id}`} value={user.role} disabled={updatingUserId === user.id} onChange={(event) => handleRoleChange(user.id, user.email, event.target.value as Role)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#3155ff]">
                <option value="USER">USER</option><option value="STAFF">STAFF</option><option value="ADMIN">ADMIN</option><option value="SUPER_ADMIN">SUPER_ADMIN</option>
              </select>
            </div>
          ))}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">User Account</th>
                <th className="py-3 px-4">Current Role</th>
                <th className="py-3 px-4">Account Created</th>
                <th className="py-3 px-4 text-right">Assign Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && [0, 1, 2, 3, 4].map((i) => (
                <tr key={i}>
                  <td colSpan={4} className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <Skeleton tone="light" className="h-8 w-8 rounded-full" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton tone="light" className="h-3.5 w-48" />
                        <Skeleton tone="light" className="h-3 w-32" />
                      </div>
                      <Skeleton tone="light" className="h-6 w-20 rounded-full" />
                      <Skeleton tone="light" className="h-7 w-24 rounded-lg ml-auto" />
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filteredUsers.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/75 transition-colors">
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs">
                        {u.email.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{u.email}</p>
                        <p className="text-[11px] text-slate-400 font-mono">ID: {u.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                        roleDescriptions[u.role]?.badge || "bg-slate-100"
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-slate-500">
                    {new Date(u.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </td>
                  <td className="py-4 px-4 text-right">
                    <select
                      value={u.role}
                      disabled={updatingUserId === u.id}
                      onChange={(e) => handleRoleChange(u.id, u.email, e.target.value as Role)}
                      className="px-2.5 py-1 text-xs font-semibold bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 shadow-sm"
                    >
                      <option value="USER">USER</option>
                      <option value="STAFF">STAFF</option>
                      <option value="ADMIN">ADMIN</option>
                      <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                    </select>
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
