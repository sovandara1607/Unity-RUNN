import { expect, test } from "@playwright/test";

test("a runner can discover an event and see its complete poster", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (value: string) => { (window as typeof window & { __copiedRaceLink?: string }).__copiedRaceLink = value; } },
    });
  });
  const event = {
    id: "event-riverside",
    name: "Riverside 10K",
    slug: "riverside-10k",
    description: "A community race along the Phnom Penh riverside.",
    cover_image: "/images/club/race-start.jpg",
    event_date: "2026-10-18",
    start_time: "2026-10-18T06:00:00Z",
    location: "Riverside",
    status: "REGISTRATION_OPEN",
    created_at: "2026-08-28T08:00:00Z",
    updated_at: "2026-08-28T08:00:00Z",
  };
  await page.route(/\/api\/v1\/events\/\?/, (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ data: { events: [event], total: 1 } }),
  }));
  await page.route("**/api/v1/events/riverside-10k", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ data: {
      ...event,
      categories: [{ id: "category-10k", event_id: event.id, name: "10K", distance: "10 km", price_cents: 1500, currency: "USD", capacity: 300, status: "OPEN", created_at: event.created_at, updated_at: event.updated_at }],
      schedule: [{ id: "schedule-1", event_id: event.id, time: "2026-10-18T05:30:00Z", title: "Runner check-in", description: "Collect your bib and meet the crew.", sort_order: 1, created_at: event.created_at, updated_at: event.updated_at }],
      faqs: [{ id: "faq-parking", event_id: event.id, question: "Where can I park?", answer: "Use the north lot shuttle.", sort_order: 1, created_at: event.created_at, updated_at: event.updated_at }],
      rules: [{ id: "rule-bib", event_id: event.id, rule: "Keep your race bib visible at all times.", sort_order: 1, created_at: event.created_at, updated_at: event.updated_at }],
    } }),
  }));

  await page.goto("/events");
  await expect(page.getByRole("heading", { name: "Find your next race." })).toBeVisible();

  const eventLink = page.locator('main a[href^="/events/"]').first();
  await expect(eventLink).toBeVisible();
  await eventLink.click();

  await expect(page).toHaveURL(/\/events\/[^/?]+$/);
  const title = page.getByRole("heading", { level: 1 });
  await expect(title).toBeVisible();
  const poster = page.getByRole("img", { name: /event poster$/ });
  await expect(poster).toBeVisible();
  await expect.poll(() => poster.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await expect(poster).toHaveCSS("object-fit", "contain");
  await expect(page.getByText("Race day", { exact: true })).toBeVisible();
  await expect(page.getByText("Meet", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Where can I park?" })).toBeVisible();
  await expect(page.getByText("Use the north lot shuttle.", { exact: true })).toBeVisible();
  await expect(page.getByText("Keep your race bib visible at all times.", { exact: true })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Add to calendar" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("riverside-10k.ics");
  const stream = await download.createReadStream();
  let calendar = "";
  for await (const chunk of stream) calendar += chunk.toString();
  expect(calendar).toContain("DTSTART;TZID=Asia/Phnom_Penh:20261018T060000");
  expect(calendar).toContain("SUMMARY:Riverside 10K");

  await page.getByRole("button", { name: "Share race" }).click();
  await expect(page.getByText("Share it with the people you want on the start line.")).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __copiedRaceLink?: string }).__copiedRaceLink)).toMatch(/\/events\/riverside-10k$/);
});
