import { expect, test } from "@playwright/test";

const events = [
  { id: "a", name: "Riverside 10K", slug: "riverside-10k", description: "", cover_image: "", event_date: "2026-10-18T00:00:00Z", start_time: "0000-01-01T06:00:00Z", location: "Riverside", status: "REGISTRATION_OPEN", created_at: "2026-08-28T08:00:00Z", updated_at: "2026-08-28T08:00:00Z" },
  { id: "b", name: "Temple Trail Half", slug: "temple-trail", description: "", cover_image: "", event_date: "2026-11-02T00:00:00Z", start_time: "0000-01-01T05:30:00Z", location: "Temple Road", status: "PUBLISHED", created_at: "2026-08-28T08:00:00Z", updated_at: "2026-08-28T08:00:00Z" },
];

test("filters survive the URL and the back button", async ({ page }) => {
  await page.route(/\/api\/v1\/events\/\?/, (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ data: { events, total: events.length } }),
  }));

  await page.goto("/events");
  await page.getByRole("button", { name: /Open for entry/ }).click();
  await expect(page).toHaveURL(/status=REGISTRATION_OPEN/);
  await expect(page.getByRole("link", { name: /Riverside 10K/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Temple Trail Half/ })).toHaveCount(0);

  // A shared filtered link must reopen filtered.
  await page.goto("/events?status=REGISTRATION_OPEN");
  await expect(page.getByRole("link", { name: /Temple Trail Half/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Riverside 10K/ })).toBeVisible();

  // And typing a search must not spin the router.
  await page.getByPlaceholder("Search by name or location").fill("temple");
  await expect(page).toHaveURL(/q=temple/);
});
