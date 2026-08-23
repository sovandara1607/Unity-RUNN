export type Role = "USER" | "STAFF" | "ADMIN" | "SUPER_ADMIN";

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
  actor_user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface RegisterFormData {
  name: string;
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
