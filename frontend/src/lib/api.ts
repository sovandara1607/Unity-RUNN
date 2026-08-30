import type {
  Registration,
  Event,
  EventCategory,
  EventDetail,
  MeResponse,
  User,
  Profile,
  RegisterFormData,
  LoginFormData,
  AdminMetrics,
  ClubStats,
  SystemStatusSnapshot,
  SiteConfig,
  SiteConfigVersion,
  AuditLog,
  CheckIn,
  Role,
  AuthUser,
  EventSchedule,
	EventFAQ,
	EventRule,
	Availability,
	PaymentCheckout,
	PaymentVerificationResult,
	TelegramDeliveryStatus,
	TelegramDeliveryPreferences,
	TelegramDelivery,
	AdminAutomationSnapshot,
	TelegramLink,
	EventAutomation,
} from "../types";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:8080";

/** Resolve API-owned upload paths without redirecting frontend public assets
 * such as /images/... to the API origin. */
export const resolveApiAssetUrl = (value?: string | null): string => {
  const url = value?.trim() || "";
  if (!url || !url.startsWith("/")) return url;
  if (url.startsWith("/api/") || url.startsWith("/uploads/")) {
    return `${BASE_URL.replace(/\/$/, "")}${url}`;
  }
  return url;
};

export const eventPosterVariantUrl = (value: string | null | undefined, variant: "card" | "hero"): string => {
  const original = value?.trim() || "";
  if (!original || !original.includes("/events/") || !/\.jpe?g(?:$|\?)/i.test(original)) return resolveApiAssetUrl(original);
  const variantURL = original.replace(/\.jpe?g(?=$|\?)/i, `@${variant}.jpg`);
  return resolveApiAssetUrl(variantURL);
};

// Keep the short-lived access token in memory. Persisting bearer tokens in
// localStorage makes them directly recoverable after an XSS; the HttpOnly,
// rotating refresh cookie restores the session after a page reload instead.
let accessToken = "";
if (typeof window !== "undefined") {
  localStorage.removeItem("unity_access_token");
}

const getHeaders = (hasBody = true): HeadersInit => {
  const headers: Record<string, string> = {};
  if (hasBody) {
    headers["Content-Type"] = "application/json";
  }
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }
  return headers;
};

export type ApiError = Error & {
  code?: string;
  status?: number;
  method?: string;
  path?: string;
};

const handleResponse = async <T>(
  res: Response,
  context?: { method: string; path: string }
): Promise<T> => {
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : null;

  if (!res.ok) {
    const message =
      data?.error?.message || data?.message || `API error: ${res.status} ${res.statusText}`;
    const code = data?.error?.code || "API_ERROR";
    const err = new Error(message) as ApiError;
    err.code = code;
    err.status = res.status;
    err.method = context?.method;
    err.path = context?.path;
    throw err;
  }

  // Go backend wraps success responses in { data: ... } or returns directly
  return (data?.data !== undefined ? data.data : data) as T;
};

// Single-flight refresh so concurrent 401s only trigger one refresh call
let refreshPromise: Promise<boolean> | null = null;

const tryRefreshToken = (): Promise<boolean> => {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        await api.refreshToken();
        return true;
      } catch {
        // Refresh failed (e.g. session expired). The calling request decides
        // whether this should redirect or remain a silent public-session probe.
        if (typeof window !== "undefined") {
          accessToken = "";
        }
        return false;
      }
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
};

interface RequestOptions {
  method?: string;
  body?: unknown;
  credentials?: RequestCredentials;
  /** Skip the 401 -> refresh retry (used by auth endpoints themselves) */
  skipAuthRetry?: boolean;
  /** Do not send public visitors to login when no refresh session exists. */
  suppressAuthRedirect?: boolean;
}

const request = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  const method = options.method || "GET";
  const doFetch = () =>
    fetch(`${BASE_URL}${path}`, {
      method,
      headers: getHeaders(Boolean(options.body)),
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      // The API is commonly served from a different origin/port. Include
      // credentials by default so login can store the HttpOnly refresh cookie.
      credentials: options.credentials ?? "include",
    });

  let res = await doFetch();

  // Access token missing/expired: try to refresh once, then retry the request
  if (res.status === 401 && !options.skipAuthRetry && typeof window !== "undefined") {
    if (await tryRefreshToken()) {
      res = await doFetch();
    } else if (!options.suppressAuthRedirect) {
      // This module has no Router/Client Component context (it's called from
      // anywhere, not just event handlers), so a hard navigation is the
      // deliberate choice: it forces a fresh page load rather than a
      // client-side transition, guaranteeing stale in-memory state is gone.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(
        `/auth/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`
      );
    }
  }

  return handleResponse<T>(res, { method, path });
};

const upload = async <T>(path: string, body: FormData): Promise<T> => {
  const doFetch = () => fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: getHeaders(false),
    body,
    credentials: "include",
  });

  let res = await doFetch();
  if (res.status === 401 && typeof window !== "undefined") {
    if (await tryRefreshToken()) {
      res = await doFetch();
    } else {
      // See the matching comment in `request` above: hard navigation is
      // deliberate here, not a Client Component event handler.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(
        `/auth/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`
      );
    }
  }
  return handleResponse<T>(res, { method: "POST", path });
};

const download = async (path: string): Promise<{ blob: Blob; filename?: string }> => {
  const doFetch = () => fetch(`${BASE_URL}${path}`, { headers: getHeaders(false), credentials: "include" });
  let res = await doFetch();
  if (res.status === 401 && typeof window !== "undefined") {
    if (await tryRefreshToken()) res = await doFetch();
    else {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/auth/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    }
  }
  if (!res.ok) await handleResponse<never>(res, { method: "GET", path });
  const disposition = res.headers.get("content-disposition") || "";
  const filename = disposition.match(/filename="([^"]+)"/)?.[1];
  return { blob: await res.blob(), filename };
};

export const api = {
  // --- Public club summary ---
  async getClubStats(): Promise<ClubStats> {
    return request<ClubStats>("/api/v1/stats");
  },

  async getSiteConfig(): Promise<SiteConfig> {
    return request<SiteConfig>("/api/v1/site-config", { skipAuthRetry: true });
  },

  async updateSiteConfig(data: SiteConfig): Promise<SiteConfig> {
    const payload: Partial<SiteConfig> = { ...data };
    delete payload.updated_at;
    delete payload.announcement_event_name;
    delete payload.announcement_event_slug;
    return request<SiteConfig>("/api/v1/admin/site-config", { method: "PATCH", body: payload });
  },

  async uploadSiteAsset(file: File): Promise<{ url: string }> {
    const body = new FormData();
    body.append("asset", file);
    return upload<{ url: string }>("/api/v1/admin/site-config/assets", body);
  },

  async listSiteConfigVersions(limit = 25): Promise<SiteConfigVersion[]> {
    const result = await request<{ versions: SiteConfigVersion[] }>(`/api/v1/admin/site-config/versions?limit=${limit}`);
    return result.versions || [];
  },

  async restoreSiteConfigVersion(versionId: number): Promise<SiteConfig> {
    return request<SiteConfig>(`/api/v1/admin/site-config/versions/${versionId}/restore`, { method: "POST" });
  },

  // --- Auth ---
  async getAuthProviders(): Promise<{ google: boolean }> {
    return request<{ google: boolean }>("/api/v1/auth/providers", {
      skipAuthRetry: true,
      suppressAuthRedirect: true,
    });
  },

  googleOAuthURL(redirect = "/dashboard"): string {
    const safeRedirect = redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : "/dashboard";
    return `${BASE_URL}/api/v1/auth/google?redirect=${encodeURIComponent(safeRedirect)}`;
  },

  async register(data: RegisterFormData): Promise<{ user: AuthUser; access_token: string }> {
    const result = await request<{ user: AuthUser; access_token: string }>("/api/v1/auth/register", {
      method: "POST",
      body: data,
      skipAuthRetry: true,
    });
    if (result?.access_token && typeof window !== "undefined") {
      accessToken = result.access_token;
    }
    return result;
  },

  async login(data: LoginFormData): Promise<{ user: AuthUser; access_token: string }> {
    const result = await request<{ user: AuthUser; access_token: string }>("/api/v1/auth/login", {
      method: "POST",
      body: data,
      skipAuthRetry: true,
    });
    if (result?.access_token && typeof window !== "undefined") {
      accessToken = result.access_token;
    }
    return result;
  },

  async refreshToken(): Promise<{ access_token: string; user?: { id: string; email: string; role: Role } }> {
    const result = await request<{ access_token: string; user?: { id: string; email: string; role: Role } }>("/api/v1/auth/refresh", {
      method: "POST",
      credentials: "include", // sends httpOnly refresh token cookie
      skipAuthRetry: true,
    });
    if (result?.access_token && typeof window !== "undefined") {
      accessToken = result.access_token;
    }
    return result;
  },

  async logout(): Promise<void> {
    try {
      await request<void>("/api/v1/auth/logout", {
        method: "POST",
        credentials: "include",
        skipAuthRetry: true,
      });
    } catch {
      // ignore network errors on logout
    } finally {
      if (typeof window !== "undefined") {
        accessToken = "";
      }
    }
  },

  async getMe(options?: { allowUnauthenticated?: boolean }): Promise<MeResponse> {
    // The Go router mounts the handler at the collection root (`/me/`).
    // Calling `/me` enters the auth middleware but does not match the handler,
    // which makes a restored session look unauthorized/404 after refresh.
    return request<MeResponse>("/api/v1/me/", {
      suppressAuthRedirect: options?.allowUnauthenticated === true,
    });
  },

  async updateMe(data: Partial<Pick<Profile,
    "full_name" | "phone" | "date_of_birth" | "gender" |
    "emergency_contact_name" | "emergency_contact_phone" | "tshirt_size" | "avatar_url"
  >>): Promise<Profile> {
    return request<Profile>("/api/v1/me/", { method: "PATCH", body: data });
  },

  async getTelegramDelivery(): Promise<TelegramDeliveryStatus> {
    return request<TelegramDeliveryStatus>("/api/v1/me/telegram");
  },

  async createTelegramLink(): Promise<TelegramLink> {
    return request<TelegramLink>("/api/v1/me/telegram/link", { method: "POST" });
  },

  async updateTelegramPreferences(preferences: TelegramDeliveryPreferences): Promise<TelegramDeliveryStatus> {
    return request<TelegramDeliveryStatus>("/api/v1/me/telegram/preferences", { method: "PATCH", body: preferences });
  },

  async sendTelegramTest(): Promise<void> {
    return request<void>("/api/v1/me/telegram/test", { method: "POST" });
  },

  async listTelegramDeliveries(): Promise<TelegramDelivery[]> {
    return request<TelegramDelivery[]>("/api/v1/me/telegram/deliveries");
  },

  async disconnectTelegram(): Promise<void> {
    return request<void>("/api/v1/me/telegram", { method: "DELETE" });
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

    const query = searchParams.toString();
    const result = await request<Event[] | { events: Event[]; total: number }>(
      `/api/v1/events/${query ? `?${query}` : ""}`
    );
    if (Array.isArray(result)) {
      return { events: result, total: result.length };
    }
    return {
      events: result?.events || [],
      total: result?.total || 0,
    };
  },

  async getEvent(slug: string): Promise<EventDetail> {
    return request<EventDetail>(`/api/v1/events/${slug}`);
  },

  async getEventById(id: string): Promise<Event> {
    return request<Event>(`/api/v1/events/by-id/${id}`);
  },

  async getCategoryAvailability(eventId: string, categoryId: string): Promise<Availability> {
    return request<Availability>(`/api/v1/events/${eventId}/categories/${categoryId}/availability`, {
      suppressAuthRedirect: true,
    });
  },

  async createEvent(data: Partial<Event>): Promise<Event> {
    return request<Event>("/api/v1/events/", { method: "POST", body: data });
  },

  async duplicateEvent(id: string, data: { name: string; event_date: string }): Promise<Event> {
    return request<Event>(`/api/v1/events/${id}/duplicate`, { method: "POST", body: data });
  },

  async uploadEventPoster(file: File, artboard?: { width: number; height: number }): Promise<{ url: string; card_url: string; hero_url: string; width: number; height: number; format: "jpeg" }> {
    const body = new FormData();
    body.append("poster", file);
    if (artboard) {
      body.append("width", String(artboard.width));
      body.append("height", String(artboard.height));
    }
    return upload<{ url: string; card_url: string; hero_url: string; width: number; height: number; format: "jpeg" }>("/api/v1/events/posters", body);
  },

  async updateEvent(id: string, data: Partial<Event>): Promise<Event> {
    return request<Event>(`/api/v1/events/${id}`, { method: "PATCH", body: data });
  },

  async deleteEvent(id: string): Promise<void> {
    return request<void>(`/api/v1/events/${id}`, { method: "DELETE" });
  },

  // --- Registrations ---
  async listMyRegistrations(): Promise<Registration[]> {
    const result = await request<Registration[] | { registrations: Registration[] }>(
      "/api/v1/me/registrations"
    );
    if (Array.isArray(result)) return result;
    return result?.registrations || [];
  },

  // Legacy method name retained for compatibility. The API now returns the
  // stable registration number, so saved and screenshotted QRs remain valid.
  async issueTicketToken(registrationId: string): Promise<string> {
    const result = await request<{ ticket_token: string }>(
      `/api/v1/registrations/${registrationId}/ticket`,
      { method: "POST" }
    );
    return result?.ticket_token || "";
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
  ): Promise<{ registration: Registration; ticket_token?: string; payment?: PaymentCheckout }> {
	return request<{ registration: Registration; ticket_token?: string; payment?: PaymentCheckout }>(
      `/api/v1/events/${eventId}/registrations`,
      { method: "POST", body: data }
    );
  },

  async getRegistration(id: string): Promise<Registration> {
    return request<Registration>(`/api/v1/registrations/${id}`);
  },

	async getRegistrationPayment(id: string): Promise<PaymentCheckout> {
		return request<PaymentCheckout>(`/api/v1/registrations/${id}/payment`);
	},

	async verifyRegistrationPayment(id: string): Promise<PaymentVerificationResult> {
		return request<PaymentVerificationResult>(`/api/v1/registrations/${id}/payment/verify`, { method: "POST" });
	},

  async cancelRegistration(registrationId: string): Promise<void> {
    return request<void>(`/api/v1/registrations/${registrationId}/cancel`, { method: "POST" });
  },

  // --- Admin & Staff Operations ---
  async adminListRegistrations(params?: {
    event_id?: string;
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ registrations: Registration[]; total: number }> {
    const searchParams = new URLSearchParams();
    if (params?.event_id) searchParams.set("event_id", params.event_id);
    if (params?.status) searchParams.set("status", params.status);
    if (params?.search) searchParams.set("search", params.search);
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());

    const query = searchParams.toString();
    const result = await request<{ registrations?: Registration[]; total?: number }>(
      `/api/v1/admin/registrations${query ? `?${query}` : ""}`
    );
    return {
      registrations: result?.registrations || [],
      total: result?.total || 0,
    };
  },

  async adminExportRegistrations(params?: { event_id?: string; status?: string; search?: string }): Promise<{ blob: Blob; filename?: string }> {
    const searchParams = new URLSearchParams();
    if (params?.event_id) searchParams.set("event_id", params.event_id);
    if (params?.status) searchParams.set("status", params.status);
    if (params?.search) searchParams.set("search", params.search);
    const query = searchParams.toString();
    return download(`/api/v1/admin/registrations/export.csv${query ? `?${query}` : ""}`);
  },

  async adminGetRegistration(registrationId: string): Promise<Registration> {
    return request<Registration>(`/api/v1/admin/registrations/${registrationId}`);
  },

  async adminListAuditLogs(params?: { entity_type?: string; limit?: number; offset?: number }): Promise<AuditLog[]> {
    const qs = new URLSearchParams();
    if (params?.entity_type && params.entity_type !== "ALL") qs.set("entity_type", params.entity_type);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const result = await request<{ logs: AuditLog[] }>(`/api/v1/admin/audit-logs?${qs.toString()}`);
    return result?.logs || [];
  },

  async adminListUsers(params?: { role?: Role; limit?: number; offset?: number }): Promise<{ users: User[]; total: number }> {
    const qs = new URLSearchParams();
    if (params?.role) qs.set("role", params.role);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const query = qs.toString();
    return request<{ users: User[]; total: number }>(`/api/v1/admin/users${query ? `?${query}` : ""}`);
  },

  async adminUpdateUserRole(userId: string, role: Role): Promise<User> {
    return request<User>(`/api/v1/admin/users/${userId}/role`, { method: "PATCH", body: { role } });
  },

  // --- Event categories & schedules (admin) ---
  async createCategory(eventId: string, data: { name: string; distance: string; price_cents: number; currency: "USD" | "KHR"; capacity: number; registration_deadline?: string }): Promise<EventCategory> {
    return request<EventCategory>(`/api/v1/events/${eventId}/categories/`, { method: "POST", body: data });
  },
  async updateCategory(eventId: string, categoryId: string, data: Partial<{ name: string; distance: string; price_cents: number; currency: "USD" | "KHR"; capacity: number; status: string; registration_deadline: string; clear_registration_deadline: boolean }>): Promise<EventCategory> {
    return request<EventCategory>(`/api/v1/events/${eventId}/categories/${categoryId}`, { method: "PATCH", body: data });
  },
  async deleteCategory(eventId: string, categoryId: string): Promise<void> {
    await request<void>(`/api/v1/events/${eventId}/categories/${categoryId}`, { method: "DELETE" });
  },
  async createScheduleItem(eventId: string, data: { time: string; title: string; description?: string; sort_order?: number }): Promise<EventSchedule> {
    const time = data.time.length === 5 ? `${data.time}:00` : data.time;
    return request<EventSchedule>(`/api/v1/events/${eventId}/schedules/`, { method: "POST", body: { ...data, time } });
  },
  async updateScheduleItem(eventId: string, scheduleId: string, data: Partial<{ time: string; title: string; description: string; sort_order: number }>): Promise<EventSchedule> {
    const body = { ...data };
    if (body.time && body.time.length === 5) body.time = `${body.time}:00`;
    return request<EventSchedule>(`/api/v1/events/${eventId}/schedules/${scheduleId}`, { method: "PATCH", body });
  },
  async deleteScheduleItem(eventId: string, scheduleId: string): Promise<void> {
    await request<void>(`/api/v1/events/${eventId}/schedules/${scheduleId}`, { method: "DELETE" });
  },

  async createFAQ(eventId: string, data: { question: string; answer: string; sort_order: number }): Promise<EventFAQ> {
    return request<EventFAQ>(`/api/v1/events/${eventId}/faqs/`, { method: "POST", body: data });
  },
  async updateFAQ(eventId: string, faqId: string, data: Partial<{ question: string; answer: string; sort_order: number }>): Promise<EventFAQ> {
    return request<EventFAQ>(`/api/v1/events/${eventId}/faqs/${faqId}`, { method: "PATCH", body: data });
  },
  async deleteFAQ(eventId: string, faqId: string): Promise<void> {
    await request<void>(`/api/v1/events/${eventId}/faqs/${faqId}`, { method: "DELETE" });
  },
  async createRule(eventId: string, data: { rule: string; sort_order: number }): Promise<EventRule> {
    return request<EventRule>(`/api/v1/events/${eventId}/rules/`, { method: "POST", body: data });
  },
  async updateRule(eventId: string, ruleId: string, data: Partial<{ rule: string; sort_order: number }>): Promise<EventRule> {
    return request<EventRule>(`/api/v1/events/${eventId}/rules/${ruleId}`, { method: "PATCH", body: data });
  },
  async deleteRule(eventId: string, ruleId: string): Promise<void> {
    await request<void>(`/api/v1/events/${eventId}/rules/${ruleId}`, { method: "DELETE" });
  },

  async listEventAutomations(eventId: string): Promise<EventAutomation[]> {
    return request<EventAutomation[]>(`/api/v1/events/${eventId}/automations/`);
  },
  async createEventAutomation(eventId: string, data: { name: string; message: string; send_at: string | null }): Promise<EventAutomation> {
    return request<EventAutomation>(`/api/v1/events/${eventId}/automations/`, { method: "POST", body: data });
  },
  async updateEventAutomation(eventId: string, automationId: string, data: { name: string; message: string; send_at: string | null }): Promise<EventAutomation> {
    return request<EventAutomation>(`/api/v1/events/${eventId}/automations/${automationId}`, { method: "PATCH", body: data });
  },
  async cancelEventAutomation(eventId: string, automationId: string): Promise<void> {
    return request<void>(`/api/v1/events/${eventId}/automations/${automationId}`, { method: "DELETE" });
  },

  async checkIn(data: {
    eventId?: string;
    qrToken: string;
  }): Promise<{ registration: Registration; check_in: CheckIn }> {
    return request<{ registration: Registration; check_in: CheckIn }>("/api/v1/check-in", {
      method: "POST",
      body: { token: data.qrToken, event_id: data.eventId || undefined },
    });
  },

  // Helper for dashboard overview metrics
  async adminGetMetrics(): Promise<AdminMetrics> {
    return request<AdminMetrics>("/api/v1/admin/stats");
  },

  async adminGetSystemStatus(): Promise<SystemStatusSnapshot> {
    return request<SystemStatusSnapshot>("/api/v1/admin/system");
  },

  async adminGetAutomations(): Promise<AdminAutomationSnapshot> {
    return request<AdminAutomationSnapshot>("/api/v1/admin/automations");
  },

  async adminRetryAutomationDelivery(deliveryId: string): Promise<void> {
    return request<void>(`/api/v1/admin/automations/deliveries/${deliveryId}/retry`, { method: "POST" });
  },
};
