import type {
  Registration,
  Event,
  EventDetail,
  MeResponse,
  RegisterFormData,
  LoginFormData,
  AdminMetrics,
  Role,
  AuditLog,
} from "../types";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:8080";

const getHeaders = (hasBody = true): HeadersInit => {
  const headers: Record<string, string> = {};
  if (hasBody) {
    headers["Content-Type"] = "application/json";
  }
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("unity_access_token");
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }
  return headers;
};

const handleResponse = async <T>(res: Response): Promise<T> => {
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : null;

  if (!res.ok) {
    const message =
      data?.error?.message || data?.message || `API error: ${res.status} ${res.statusText}`;
    const code = data?.error?.code || "API_ERROR";
    const err = new Error(message) as Error & { code?: string; status?: number };
    err.code = code;
    err.status = res.status;
    throw err;
  }

  // Go backend wraps success responses in { data: ... } or returns directly
  return (data?.data !== undefined ? data.data : data) as T;
};

export const api = {
  // --- Auth ---
  async register(data: RegisterFormData): Promise<{ user: any; access_token: string }> {
    const res = await fetch(`${BASE_URL}/api/v1/auth/register`, {
      method: "POST",
      headers: getHeaders(true),
      body: JSON.stringify(data),
    });
    const result = await handleResponse<{ user: any; access_token: string }>(res);
    if (result?.access_token && typeof window !== "undefined") {
      localStorage.setItem("unity_access_token", result.access_token);
    }
    return result;
  },

  async login(data: LoginFormData): Promise<{ user: any; access_token: string }> {
    const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: getHeaders(true),
      body: JSON.stringify(data),
    });
    const result = await handleResponse<{ user: any; access_token: string }>(res);
    if (result?.access_token && typeof window !== "undefined") {
      localStorage.setItem("unity_access_token", result.access_token);
    }
    return result;
  },

  async refreshToken(): Promise<{ access_token: string }> {
    const res = await fetch(`${BASE_URL}/api/v1/auth/refresh`, {
      method: "POST",
      headers: getHeaders(false),
      credentials: "include", // sends httpOnly refresh token cookie
    });
    const result = await handleResponse<{ access_token: string }>(res);
    if (result?.access_token && typeof window !== "undefined") {
      localStorage.setItem("unity_access_token", result.access_token);
    }
    return result;
  },

  async logout(): Promise<void> {
    try {
      await fetch(`${BASE_URL}/api/v1/auth/logout`, {
        method: "POST",
        headers: getHeaders(false),
        credentials: "include",
      });
    } catch {
      // ignore network errors on logout
    } finally {
      if (typeof window !== "undefined") {
        localStorage.removeItem("unity_access_token");
      }
    }
  },

  async getMe(): Promise<MeResponse> {
    const res = await fetch(`${BASE_URL}/api/v1/me`, {
      headers: getHeaders(false),
    });
    return handleResponse<MeResponse>(res);
  },

  async updateMe(data: { name?: string; email?: string }): Promise<MeResponse> {
    const res = await fetch(`${BASE_URL}/api/v1/me`, {
      method: "PATCH",
      headers: getHeaders(true),
      body: JSON.stringify(data),
    });
    return handleResponse<MeResponse>(res);
  },

  // --- Events ---
  async listEvents(params?: {
    statuses?: string[];
    limit?: number;
    offset?: number;
  }): Promise<{ events: Event[]; total: number }> {
    const searchParams = new URLSearchParams();
    if (params?.statuses && params.statuses.length > 0) {
      searchParams.set("statuses", params.statuses.join(","));
    }
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());

    const url = `${BASE_URL}/api/v1/events${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
    const res = await fetch(url, {
      headers: getHeaders(false),
    });
    const result = await handleResponse<any>(res);
    if (Array.isArray(result)) {
      return { events: result, total: result.length };
    }
    return {
      events: result?.events || [],
      total: result?.total || 0,
    };
  },

  async getEvent(slug: string): Promise<EventDetail> {
    const res = await fetch(`${BASE_URL}/api/v1/events/${slug}`, {
      headers: getHeaders(false),
    });
    return handleResponse<EventDetail>(res);
  },

  async createEvent(data: Partial<Event>): Promise<Event> {
    const res = await fetch(`${BASE_URL}/api/v1/events`, {
      method: "POST",
      headers: getHeaders(true),
      body: JSON.stringify(data),
    });
    return handleResponse<Event>(res);
  },

  async updateEvent(id: string, data: Partial<Event>): Promise<Event> {
    const res = await fetch(`${BASE_URL}/api/v1/events/${id}`, {
      method: "PATCH",
      headers: getHeaders(true),
      body: JSON.stringify(data),
    });
    return handleResponse<Event>(res);
  },

  async deleteEvent(id: string): Promise<void> {
    const res = await fetch(`${BASE_URL}/api/v1/events/${id}`, {
      method: "DELETE",
      headers: getHeaders(false),
    });
    return handleResponse<void>(res);
  },

  // --- Registrations ---
  async listMyRegistrations(): Promise<Registration[]> {
    const res = await fetch(`${BASE_URL}/api/v1/me/registrations`, {
      headers: getHeaders(false),
    });
    return handleResponse<Registration[]>(res);
  },

  async registerForEvent(
    eventId: string,
    data: {
      event_category_id: string;
      full_name: string;
      email: string;
      phone: string;
      gender: string;
      emergency_contact_name: string;
      emergency_contact_phone: string;
      tshirt_size: string;
      date_of_birth?: string;
    }
  ): Promise<{ registration: Registration; ticket_token?: string }> {
    const res = await fetch(`${BASE_URL}/api/v1/events/${eventId}/registrations`, {
      method: "POST",
      headers: getHeaders(true),
      body: JSON.stringify(data),
    });
    return handleResponse<{ registration: Registration; ticket_token?: string }>(res);
  },

  async getRegistration(id: string): Promise<Registration> {
    const res = await fetch(`${BASE_URL}/api/v1/registrations/${id}`, {
      headers: getHeaders(false),
    });
    return handleResponse<Registration>(res);
  },

  async cancelRegistration(registrationId: string): Promise<void> {
    const res = await fetch(`${BASE_URL}/api/v1/registrations/${registrationId}/cancel`, {
      method: "POST",
      headers: getHeaders(false),
    });
    return handleResponse<void>(res);
  },

  // --- Admin & Staff Operations ---
  async adminListRegistrations(params?: {
    event_id?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ registrations: Registration[]; total: number }> {
    const searchParams = new URLSearchParams();
    if (params?.event_id) searchParams.set("event_id", params.event_id);
    if (params?.status) searchParams.set("status", params.status);
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());

    const url = `${BASE_URL}/api/v1/admin/registrations${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
    const res = await fetch(url, {
      headers: getHeaders(false),
    });
    const result = await handleResponse<any>(res);
    return {
      registrations: result?.registrations || [],
      total: result?.total || 0,
    };
  },

  async adminGetRegistration(registrationId: string): Promise<Registration> {
    const res = await fetch(`${BASE_URL}/api/v1/admin/registrations/${registrationId}`, {
      headers: getHeaders(false),
    });
    return handleResponse<Registration>(res);
  },

  async checkIn(data: {
    eventId: string;
    registrationId: string;
    qrToken: string;
  }): Promise<{ checked_in: boolean; checked_in_at: string }> {
    const res = await fetch(`${BASE_URL}/api/v1/check-in`, {
      method: "POST",
      headers: getHeaders(true),
      body: JSON.stringify({
        event_id: data.eventId,
        registration_id: data.registrationId,
        qr_token: data.qrToken,
      }),
    });
    return handleResponse<{ checked_in: boolean; checked_in_at: string }>(res);
  },

  // Helper for dashboard overview metrics
  async adminGetMetrics(): Promise<AdminMetrics> {
    try {
      const [eventsRes, regsRes] = await Promise.all([
        this.listEvents({ limit: 100 }),
        this.adminListRegistrations({ limit: 500 }),
      ]);

      const events = eventsRes.events || [];
      const regs = regsRes.registrations || [];

      const activeEvents = events.filter((e) =>
        ["PUBLISHED", "REGISTRATION_OPEN", "REGISTRATION_CLOSED"].includes(e.status)
      ).length;

      const confirmedRegs = regs.filter((r) => r.status === "CONFIRMED");

      return {
        total_events: events.length,
        active_events: activeEvents,
        total_registrations: regs.length,
        confirmed_registrations: confirmedRegs.length,
        total_revenue_cents: confirmedRegs.length * 2500, // Estimated aggregate
        total_checked_in: regs.filter((r) => Boolean(r.check_in)).length,
      };
    } catch {
      return {
        total_events: 0,
        active_events: 0,
        total_registrations: 0,
        confirmed_registrations: 0,
        total_revenue_cents: 0,
        total_checked_in: 0,
      };
    }
  },
};
