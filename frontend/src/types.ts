export type Role = "USER" | "STAFF" | "ADMIN" | "SUPER_ADMIN";

export interface SiteHeroSlide {
  image_url: string;
  alt: string;
  eyebrow: string;
  title: string;
  copy: string;
}

export interface SiteConfig {
  club_name: string;
  location_label: string;
  logo_url: string;
  primary_color: string;
  accent_color: string;
  background_color: string;
  announcement_enabled: boolean;
  announcement_text: string;
  announcement_href: string;
  announcement_event_id: string | null;
  announcement_event_name: string;
  announcement_event_slug: string;
  hero_intro: string;
  hero_title_primary: string;
  hero_title_secondary: string;
  mission_eyebrow: string;
  mission_text: string;
  mission_supporting_text: string;
  primary_cta_label: string;
  primary_cta_href: string;
  footer_text: string;
  value_messages: string[];
  hero_slides: SiteHeroSlide[];
  updated_at?: string;
}

export interface SiteConfigVersion {
  id: number;
  settings: SiteConfig;
  created_by?: string;
  created_at: string;
}

export type EventStatus =
  | "DRAFT"
  | "PUBLISHED"
  | "REGISTRATION_OPEN"
  | "REGISTRATION_CLOSED"
  | "COMPLETED"
  | "CANCELLED"
  | "ARCHIVED";

export type RegistrationStatus =
  | "PENDING"
  | "CONFIRMED"
  | "CANCELLED"
  | "REFUNDED";

export interface User {
  id: string;
  email: string;
  role: Role;
  created_at: string;
  updated_at: string;
}

/** The minimal user shape returned inline by /auth/register and /auth/login. */
export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

export interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  phone: string;
  date_of_birth: string | null;
  gender: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  tshirt_size: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface MeResponse {
  id: string;
  email: string;
  role: Role;
  name?: string | null;
  profile?: Profile | null;
  created_at: string;
  updated_at: string;
}

export interface EventCategory {
  id: string;
  event_id: string;
  name: string;
  distance: string;
  price_cents: number;
  capacity: number;
  registration_deadline?: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface EventSchedule {
  id: string;
  event_id: string;
  time: string;
  title: string;
  description: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface EventFAQ {
  id: string;
  event_id: string;
  question: string;
  answer: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface EventRule {
  id: string;
  event_id: string;
  rule: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Event {
  id: string;
  name: string;
  slug: string;
  description: string;
  cover_image: string;
  event_date: string;
  start_time: string;
  location: string;
  latitude?: number | null;
  longitude?: number | null;
  registration_open_at?: string | null;
  registration_close_at?: string | null;
  status: EventStatus;
  created_at: string;
  updated_at: string;
}

export interface EventDetail extends Event {
  categories: EventCategory[];
  schedule: EventSchedule[];
  faqs: EventFAQ[];
  rules: EventRule[];
}

export interface Registration {
  id: string;
  registration_number: string;
  user_id: string;
  event_id: string;
  event_category_id: string;
  status: RegistrationStatus;
  full_name: string;
  email: string;
  phone: string;
  date_of_birth?: string | null;
  gender: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  tshirt_size: string;
  created_at: string;
  updated_at: string;
	checked_in_at?: string | null;
  // Hydrated references
  event?: Event;
  category?: EventCategory;
  payment?: Payment;
  check_in?: CheckIn;
}

export interface Payment {
  id: string;
  registration_id: string;
  provider: string;
  provider_reference: string;
  amount_cents: number;
  currency: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface PaymentCheckout {
	registration_id: string;
	provider: string;
	status: "PENDING" | "SUCCEEDED" | "FAILED";
	amount_cents: number;
	currency: string;
	qr_string?: string;
	deep_link?: string;
	expires_at?: string;
}

export interface PaymentVerificationResult {
	registration: Registration;
	payment: PaymentCheckout;
}

export interface CheckIn {
  id: string;
  registration_id: string;
  staff_user_id: string;
  checked_in_at: string;
  created_at: string;
}

export interface Availability {
  capacity: number;
  taken: number;
  available: number;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

export interface RegisterFormData {
  full_name: string;
  email: string;
  password: string;
}

export interface LoginFormData {
  email: string;
  password: string;
}

export interface AdminMetrics {
  total_events: number;
  active_events: number;
  total_registrations: number;
  confirmed_registrations: number;
  total_revenue_cents: number;
  total_checked_in: number;
}

export interface ClubStats {
  open_events: number;
  confirmed_runners: number;
  locations: number;
}

export type SystemState = "operational" | "configured" | "attention" | "unavailable" | "disabled";

export interface SystemServiceItem {
  name: string;
  role: string;
  status: SystemState;
  detail: string;
  latency_ms?: number;
}

export interface SystemIntegrationStatus {
  status: SystemState;
  provider: string;
  detail: string;
  endpoint: string;
  identity?: string;
  latency_ms?: number;
}

export interface SystemStatusSnapshot {
  generated_at: string;
  overall: "operational" | "degraded";
  summary: { operational: number; attention: number; unavailable: number };
  application: {
    environment: string; log_level: string; public_app_url: string; uptime_seconds: number;
    go_version: string; version: string; commit: string; build_time: string; modified_build: boolean;
    allowed_origins: string[];
  };
  services: SystemServiceItem[];
  data_stores: {
    postgres: {
      status: SystemState; detail: string; latency_ms: number; endpoint: string; database: string;
      size_bytes: number; table_count: number; migration: number; max_connections: number;
      total_connections: number; active_connections: number; idle_connections: number;
    };
    redis: {
      status: SystemState; detail: string; latency_ms: number; endpoint: string; database: number;
      used_memory_bytes: number; queue_depth: number; total_connections: number; idle_connections: number;
    };
    storage: {
      status: SystemState; detail: string; latency_ms: number; provider: string;
      endpoint: string; bucket: string; delivery: string;
    };
  };
  integrations: {
    realtime: SystemIntegrationStatus; email: SystemIntegrationStatus;
    oauth: SystemIntegrationStatus; payments: SystemIntegrationStatus;
  };
  security: {
    jwt_secret_configured: boolean; access_token_ttl: string; refresh_token_ttl: string;
    bcrypt_cost: number; secure_cookies: boolean; allowed_origins: string[];
    oauth_secret_configured: boolean; storage_secret_configured: boolean;
    smtp_secret_configured: boolean; payment_secret_configured: boolean;
  };
  workers: {
    notification_queue_depth: number; notifications_pending: number; notifications_failed: number;
    notification_sweep: string; notification_max_attempts: number; reminder_poll: string; reminder_window: string;
  };
  resilience: {
    database_role: string; redis_role: string; media_role: string;
    backup_status: string; backup_detail: string; migration: number;
  };
}
