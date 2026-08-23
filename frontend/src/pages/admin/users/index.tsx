import React, { useState, useEffect } from "react";
import {
  Shield,
  Search,
  UserCheck,
  ShieldAlert,
  Mail,
  Calendar,
  AlertCircle,
  CheckCircle,
  ChevronDown,
} from "lucide-react";
import { AdminLayout } from "../../../components/admin/AdminLayout";
import { api } from "../../../lib/api";
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

  // Initial mock/loaded users list
  useEffect(() => {
    async function loadUsers() {
      try {
        setLoading(true);
        // Try fetching current user profile and fallback demo users
        const me = await api.getMe().catch(() => null);
        const demoUsers: User[] = [
          {
            id: me?.id || "u-001",
            email: me?.email || "admin@unityrunclub.com",
            role: (me?.role as Role) || "SUPER_ADMIN",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: "u-002",
            email: "staff.sarah@unityrunclub.com",
            role: "STAFF",
            created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: "u-003",
            email: "director.alex@unityrunclub.com",
            role: "ADMIN",
            created_at: new Date(Date.now() - 86400000 * 12).toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: "u-004",
            email: "runner.chann@gmail.com",
            role: "USER",
            created_at: new Date(Date.now() - 86400000 * 20).toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: "u-005",
            email: "volunteer.sokha@unityrunclub.com",
            role: "STAFF",
            created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
            updated_at: new Date().toISOString(),
          },
        ];
        setUsers(demoUsers);
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

      // Update in state
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );

      setFeedback({
        type: "success",
        text: `Role for ${targetUserEmail} updated to ${newRole}.`,
      });
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: any) {
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
      title="User & Staff RBAC Management"
      subtitle="Super Admin permissions: assign roles, manage staff access, and oversee privileges"
      minRole="SUPER_ADMIN"
    >
      {feedback && (
        <div
          className={`mb-6 p-4 rounded-xl text-xs font-semibold flex items-center gap-2 ${
            feedback.type === "success"
              ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
              : "bg-rose-50 border border-rose-200 text-rose-800"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle className="w-4 h-4 text-emerald-600" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Role Hierarchy Explainer Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {(Object.keys(roleDescriptions) as Role[]).map((r) => {
          const info = roleDescriptions[r];
          return (
            <div key={r} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${info.badge}`}>
                {r}
              </span>
              <p className="text-xs font-medium text-slate-800 mt-2">{info.label}</p>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{info.desc}</p>
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
        <div className="overflow-x-auto">
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
              {filteredUsers.map((u) => (
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
