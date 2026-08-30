import { expect, test } from "@playwright/test";

const now = "2026-08-28T08:00:00Z";
const events = [
  { id: "event-1", name: "Riverside 10K", slug: "riverside-10k", description: "", cover_image: "", event_date: "2026-09-06", start_time: "06:00", location: "Riverside", status: "REGISTRATION_OPEN", created_at: now, updated_at: now },
  { id: "event-2", name: "Night Relay", slug: "night-relay", description: "", cover_image: "", event_date: "2026-09-20", start_time: "18:00", location: "Koh Pich", status: "PUBLISHED", created_at: now, updated_at: now },
  { id: "event-3", name: "Angkor Sunrise Half", slug: "angkor-sunrise-half", description: "", cover_image: "", event_date: "2026-10-11", start_time: "05:30", location: "Siem Reap", status: "REGISTRATION_OPEN", created_at: now, updated_at: now },
  { id: "event-4", name: "Riverside Family 5K", slug: "riverside-family-5k", description: "", cover_image: "", event_date: "2026-10-25", start_time: "06:30", location: "Riverside", status: "REGISTRATION_CLOSED", created_at: now, updated_at: now },
];

test("the race board can be refined by month, location, status, and search", async ({ page }) => {
  await page.route(/\/api\/v1\/events\/\?/, (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ data: { events, total: events.length } }),
  }));

  await page.goto("/events");
  await expect(page.getByText("4 starts on the board")).toBeVisible();

  await page.getByLabel("Race month").selectOption("2026-10");
  await expect(page.getByText("2 starts on the board")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Angkor Sunrise Half" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Riverside Family 5K" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Riverside 10K" })).toBeHidden();

  await page.getByLabel("Start location").selectOption("Riverside");
  await expect(page.getByText("1 start on the board")).toBeVisible();
  await page.getByRole("button", { name: /^Closed/ }).click();
  await expect(page.getByRole("heading", { name: "Riverside Family 5K" })).toBeVisible();

  await page.getByRole("button", { name: "Clear all" }).click();
  await expect(page.getByText("4 starts on the board")).toBeVisible();
  await page.getByPlaceholder("Search by name or location").fill("Night");
  await expect(page.getByText("1 start on the board")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Night Relay" })).toBeVisible();
});
