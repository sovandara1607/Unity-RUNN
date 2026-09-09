// Milestone DTOs verified against Go auth/model.go, events/model.go and handlers.
// Replace with generated contracts once a reviewed OpenAPI source exists.
export type User = {
  id: string;
  email: string;
  role: "USER" | "STAFF" | "ADMIN" | "SUPER_ADMIN";
};
export type SessionResponse = {
  access_token: string;
  refresh_token: string;
  user: User;
};
export type EventStatus =
  | "DRAFT"
  | "PUBLISHED"
  | "REGISTRATION_OPEN"
  | "REGISTRATION_CLOSED"
  | "COMPLETED"
  | "CANCELLED"
  | "ARCHIVED";
export type RunEvent = {
  id: string;
  slug: string;
  name: string;
  description: string;
  cover_image: string;
  event_date: string;
  start_time: string;
  location: string;
  status: EventStatus;
  latitude: number | null;
  longitude: number | null;
  registration_open_at: string | null;
  registration_close_at: string | null;
};
export type EventPage = {
  events: RunEvent[];
  total: number;
  limit: number;
  offset: number;
};
export type Category = {
  id: string;
  name: string;
  distance: string;
  price_cents: number;
  currency: "USD" | "KHR";
  status: string;
  registration_deadline: string | null;
};
export type EventDetail = RunEvent & {
  categories: Category[];
  schedule: {
    id: string;
    time: string;
    title: string;
    description: string;
    sort_order: number;
  }[];
  faqs: { id: string; question: string; answer: string; sort_order: number }[];
  rules: { id: string; rule: string; sort_order: number }[];
};
export type Profile = {
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
};
export type Me = User & {
  name?: string | null;
  profile: Profile | null;
};
export type UpdateProfileRequest = Partial<{
  full_name: string;
  phone: string;
  date_of_birth: string;
  gender: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  tshirt_size: string;
  avatar_url: string;
}>;
export type Availability = {
  capacity: number;
  taken: number;
  available: number;
};
export type RegistrationStatus = "PENDING" | "CONFIRMED" | "CANCELLED" | "REFUNDED";
export type Registration = {
  id: string;
  registration_number: string;
  user_id: string;
  event_id: string;
  event_category_id: string;
  event_name?: string;
  category_name?: string;
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
  event?: RunEvent;
  category?: Category;
};
export type PaymentCheckout = {
  registration_id: string;
  provider: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED";
  amount_cents: number;
  currency: "USD" | "KHR";
  qr_string?: string;
  deep_link?: string;
  expires_at?: string;
};
export type PaymentVerificationResult = {
  registration: Registration;
  payment: PaymentCheckout;
};
export type RegisterForEventRequest = {
  event_category_id: string;
  full_name: string;
  email: string;
  phone: string;
  gender: string;
  date_of_birth?: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  tshirt_size: string;
};
export type RegisterForEventResponse = {
  registration: Registration;
  ticket_token?: string;
  payment?: PaymentCheckout;
};
