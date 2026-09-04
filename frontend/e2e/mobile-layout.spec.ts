import { expect, test } from "@playwright/test";

const now = "2026-08-31T08:00:00Z";
const event = {
  id: "event-mobile",
  name: "Phnom Penh Riverside Community Championship",
  slug: "mobile-championship",
  description: "Lorem ipsum placeholder copy that must not reach the public site.",
  cover_image: "/images/club/race-start.jpg",
  event_date: "2026-10-18",
  start_time: "2026-10-18T06:00:00Z",
  location: "Phnom Penh Riverside",
  status: "REGISTRATION_OPEN",
  created_at: now,
  updated_at: now,
  categories: [{ id: "category-10k", event_id: "event-mobile", name: "Community 10K", distance: "10 km", price_cents: 1500, currency: "USD", capacity: 300, status: "OPEN", created_at: now, updated_at: now }],
  schedule: [{ id: "schedule-1", event_id: "event-mobile", time: "2026-10-18T05:30:00Z", title: "Runner check-in", description: "Collect your bib and meet the crew.", sort_order: 1, created_at: now, updated_at: now }],
  faqs: [],
  rules: [],
};

test.beforeEach(async ({ page, context }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await context.addCookies([{ name: "unity_cookie_consent", value: "essential", url: "http://localhost:3000" }]);
  await page.route("**/api/v1/site-config", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: {} }) }));
  await page.route(/\/api\/v1\/events\/\?/, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { events: [event], total: 1 } }) }));
  await page.route("**/api/v1/events/mobile-championship", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: event }) }));
  await page.route("**/api/v1/events/event-mobile/categories/category-10k/availability", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { capacity: 300, taken: 12, available: 288 } }) }));
  await page.route("**/api/v1/stats", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { members: 240, events: 12, registrations: 480 } }) }));
  await page.route("**/api/v1/auth/providers", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { google: false } }) }));
  await page.route(/\/api\/v1\/me\/$/, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { id: "runner-mobile", email: "runner@example.com", name: "Mobile Runner", role: "USER", profile: { full_name: "Mobile Runner", tshirt_size: "M" }, created_at: now, updated_at: now } }) }));
});

async function expectNoPageOverflow(page: import("@playwright/test").Page) {
  await expect.poll(() => page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }))).toEqual({ viewport: 320, content: 320 });
}

test("public and authentication pages stay inside a 320px viewport", async ({ page }) => {
  const pages = [
    { path: "/", ready: /Run with the crew/i },
    { path: "/about", ready: /Behind every/i },
    { path: "/events", ready: /Find your next race/i },
    { path: "/events/mobile-championship", ready: /Phnom Penh Riverside Community Championship/i },
    { path: "/events/mobile-championship/register?category=category-10k", ready: /Claim your start line/i },
    { path: "/auth/login", ready: /^Sign in/i },
    { path: "/auth/register", ready: /^Join/i },
  ];

  for (const item of pages) {
    await page.goto(item.path);
    await expect(page.getByText(item.ready).first()).toBeVisible();
    await expectNoPageOverflow(page);
  }
});

test("the mobile navigation fits the visible viewport", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  const menu = page.locator("#public-mobile-menu");
  await expect(menu).toBeVisible();
  await expect.poll(() => menu.evaluate((element) => Math.round(element.getBoundingClientRect().bottom))).toBeLessThanOrEqual(720);
  await expectNoPageOverflow(page);
});

test("placeholder event descriptions stay out of public views", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/Lorem ipsum/i)).toHaveCount(0);

  await page.goto("/events/mobile-championship");
  await expect(page.getByText(/Lorem ipsum/i)).toHaveCount(0);
});
