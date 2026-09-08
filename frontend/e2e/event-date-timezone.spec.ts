import { expect, test } from "@playwright/test";

// `event_date` is a SQL DATE, which the Go API serializes as "2026-09-05T00:00:00Z".
// Formatting that instant in the viewer's own zone shifts it backward anywhere west of
// UTC, so a runner in Los Angeles was shown a Saturday race as Friday the 4th.
// lib/eventFormat.ts pins date-only values to UTC. This locks that in.
test.use({ timezoneId: "America/Los_Angeles" });

const event = {
  id: "event-timezone",
  name: "Riverside Night 10K",
  slug: "riverside-night-10k",
  description: "A community race along the Phnom Penh riverside.",
  cover_image: "",
  event_date: "2026-09-05T00:00:00Z",
  start_time: "0000-01-01T06:00:00Z",
  location: "Riverside",
  status: "REGISTRATION_OPEN",
  created_at: "2026-08-28T08:00:00Z",
  updated_at: "2026-08-28T08:00:00Z",
};

test("a race date does not shift for a runner viewing from a western timezone", async ({ page }) => {
  await page.route(/\/api\/v1\/events\/\?/, (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ data: { events: [event], total: 1 } }),
  }));
  await page.route(`**/api/v1/events/${event.slug}`, (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ data: { ...event, categories: [], schedule: [], faqs: [], rules: [] } }),
  }));

  await page.goto("/events");
  const card = page.getByRole("link", { name: /Riverside Night 10K/ }).first();
  await expect(card).toBeVisible();
  // The calendar date, not the viewer's local rendering of UTC midnight.
  await expect(card).toContainText("05 Sep 2026");
  await expect(card).not.toContainText("04 Sep 2026");

  await page.goto(`/events/${event.slug}`);
  await expect(page.getByText("Saturday, 5 September 2026")).toBeVisible();
  // A 06:00 start is a bare wall clock and must never be zone-converted either.
  await expect(page.getByText("06:00", { exact: true })).toBeVisible();
});
