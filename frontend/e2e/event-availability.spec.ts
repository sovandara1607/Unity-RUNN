import { expect, test } from "@playwright/test";

const now = "2026-08-28T08:00:00Z";
const event = {
  id: "event-riverside",
  name: "Riverside Run",
  slug: "riverside-run",
  description: "Two distances along the river.",
  cover_image: "/images/club/race-start.jpg",
  event_date: "2026-10-18",
  start_time: "0000-01-01T06:00:00Z",
  location: "Riverside",
  status: "REGISTRATION_OPEN",
  created_at: now,
  updated_at: now,
  categories: [
    { id: "category-5k", event_id: "event-riverside", name: "Community 5K", distance: "5 km", price_cents: 1000, currency: "USD", capacity: 100, registration_deadline: "2026-08-27T12:00:00Z", status: "OPEN", created_at: now, updated_at: now },
    { id: "category-10k", event_id: "event-riverside", name: "Riverside 10K", distance: "10 km", price_cents: 1500, currency: "USD", capacity: 100, status: "OPEN", created_at: now, updated_at: now },
  ],
  schedule: [],
  faqs: [],
  rules: [],
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/events/riverside-run", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: event }) }));
  await page.route("**/api/v1/events/event-riverside/categories/category-5k/availability", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { capacity: 100, taken: 80, available: 20 } }) }));
  await page.route("**/api/v1/events/event-riverside/categories/category-10k/availability", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { capacity: 100, taken: 93, available: 7 } }) }));
});

test("event details identify closed and low-availability entries", async ({ page }) => {
  await page.goto("/events/riverside-run");
  await expect(page.getByText("Entry closed")).toBeVisible();
  await expect(page.getByText("Only 7 places left")).toBeVisible();
  await expect(page.getByLabel("Community 5K entry closed")).toBeVisible();
  await expect(page.getByRole("link", { name: /Riverside 10K/ })).toHaveAttribute("href", "/events/riverside-run/register?category=category-10k");
});

test("registration prevents selection after a category cutoff", async ({ page }) => {
  await page.route(/\/api\/v1\/me\/$/, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { id: "runner-1", email: "runner@example.com", role: "USER", profile: { full_name: "Demo Runner" }, created_at: now, updated_at: now } }) }));
  await page.goto("/events/riverside-run/register?category=category-5k");

  const fullEntry = page.getByRole("button", { name: /5 km/i });
  await expect(fullEntry).toBeDisabled();
  await expect(fullEntry).toContainText("Entry closed");
  const availableEntry = page.getByRole("button", { name: /10 km/i });
  await expect(availableEntry).toBeEnabled();
  await expect(availableEntry).toContainText("Only 7 places left");
  await availableEntry.click();
  await expect(availableEntry).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Claim my place" })).toBeEnabled();
});
