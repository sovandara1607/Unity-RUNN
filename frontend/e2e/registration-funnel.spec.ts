import { expect, test } from "@playwright/test";

const now = "2026-08-26T08:00:00Z";
const event = {
  id: "event-funnel",
  name: "Riverside Night 10K",
  slug: "riverside-night-10k",
  description: "A community race along the Phnom Penh riverside.",
  cover_image: "",
  event_date: "2026-10-18T00:00:00Z",
  start_time: "0000-01-01T06:00:00Z",
  location: "Riverside",
  status: "REGISTRATION_OPEN",
  created_at: now,
  updated_at: now,
};
const category = {
  id: "category-10k", event_id: event.id, name: "10K", distance: "10 km",
  price_cents: 1500, currency: "USD", capacity: 300, status: "OPEN",
  created_at: now, updated_at: now,
};
const detail = { ...event, categories: [category], schedule: [], faqs: [], rules: [] };

const runner = {
  id: "runner-1", email: "demo@example.com", name: "Demo Runner", role: "USER",
  profile: { full_name: "Demo Runner", phone: "012345678", date_of_birth: "1995-04-02", gender: "OTHER", tshirt_size: "M", emergency_contact_name: "Sok", emergency_contact_phone: "011222333" },
};

async function mockRunner(page: import("@playwright/test").Page, registrations: unknown[] = []) {
  await page.route(/\/api\/v1\/me\/$/, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: runner }) }));
  await page.route("**/api/v1/me/registrations", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: registrations }) }));
  await page.route("**/availability", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { available: 120, capacity: 300 } }) }));
  await page.route(`**/api/v1/events/${event.slug}`, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: detail }) }));
}

test("a failed event load offers a retry instead of claiming the race does not exist", async ({ page }) => {
  await page.route(`**/api/v1/events/${event.slug}`, (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { message: "boom" } }) }));

  await page.goto(`/events/${event.slug}`);
  await expect(page.getByRole("heading", { name: /Could not load this race/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Try again/i })).toBeVisible();
  await expect(page.getByText("This run isn’t here.")).toHaveCount(0);
});

test("a genuinely missing race still says so", async ({ page }) => {
  await page.route("**/api/v1/events/no-such-race", (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: { message: "not found" } }) }));

  await page.goto("/events/no-such-race");
  await expect(page.getByText("This run isn’t here.")).toBeVisible();
});

test("signup keeps the race the runner was entering", async ({ page }) => {
  const target = `/events/${event.slug}/register?category=${category.id}`;
  await page.goto(`/auth/login?redirect=${encodeURIComponent(target)}`);
  await expect(page.getByText(/Sign in to finish your race entry/i)).toBeVisible();

  // Both switchers -- the frame's and the inline one -- must carry the destination.
  await page.locator("p", { hasText: "New?" }).getByRole("link", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/auth\/register\?redirect=/);
  await expect(page.getByText(/take you straight back to your race entry/i)).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" }).first()).toHaveAttribute("href", /redirect=/);
});

test("a runner who already holds a place is not handed the form again", async ({ page }) => {
  await mockRunner(page, [{
    id: "reg-1", user_id: runner.id, event_id: event.id, event_category_id: category.id,
    status: "CONFIRMED", registration_number: "URC-2026-000042", full_name: "Demo Runner",
    email: runner.email, phone: "012345678", tshirt_size: "M", created_at: now, updated_at: now,
  }]);

  await page.goto(`/events/${event.slug}/register?category=${category.id}`);
  await expect(page.getByRole("heading", { name: /Already entered/i })).toBeVisible();
  await expect(page.getByText("URC-2026-000042")).toBeVisible();
  await expect(page.getByRole("link", { name: /View my ticket/i })).toBeVisible();
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 780 } });

  test("the submit control is reachable without scrolling past the whole form", async ({ page }) => {
    await mockRunner(page);
    await page.goto(`/events/${event.slug}/register?category=${category.id}`);

    const submit = page.getByRole("button", { name: /Claim my place/i });
    await expect(submit).toBeVisible();
    // Pinned to the viewport bottom, so it is in reach before the form is scrolled.
    const box = await submit.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeLessThan(780);
    // And the chosen entry's price rides along with it.
    await expect(page.getByText("$15.00").first()).toBeVisible();
  });
});
