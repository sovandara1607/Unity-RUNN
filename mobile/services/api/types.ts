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
export type HeroSlide = {
  image_url: string;
  alt: string;
  eyebrow: string;
  title: string;
  copy: string;
};
// The fields the app reads from GET /api/v1/site-config (backend internal/
// siteconfig.Settings has more admin-editable fields -- announcement banner,
// colors -- not needed here yet). club_name/location_label/mission_*/
// value_messages back the Events home screen's header and mission strip.
export type SiteConfig = {
  club_name: string;
  location_label: string;
  mission_eyebrow: string;
  mission_text: string;
  mission_supporting_text: string;
  value_messages: string[];
  hero_slides: HeroSlide[];
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
// Mirrors backend/internal/liveactivities/model.go RaceStatus exactly.
export type RaceLiveActivityStatus =
  | "UPCOMING"
  | "CHECK_IN"
  | "STARTING"
  | "LIVE"
  | "FINISHED"
  | "CANCELLED";
// Mirrors backend/internal/liveactivities/model.go LiveActivity's JSON shape.
// push_token is intentionally absent -- the backend never returns it (see
// the Go struct's `json:"-"` tag), so there is nothing here for a client to
// leak even by accident.
export type LiveActivityRecord = {
  id: string;
  user_id: string;
  event_id: string;
  registration_id?: string;
  activity_id: string;
  device_id?: string;
  platform: "ios";
  status: "ACTIVE" | "ENDED" | "EXPIRED";
  race_status: RaceLiveActivityStatus;
  created_at: string;
  updated_at: string;
  expires_at?: string;
  ended_at?: string;
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
