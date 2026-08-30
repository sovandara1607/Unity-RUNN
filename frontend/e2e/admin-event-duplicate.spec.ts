import { expect, test } from "@playwright/test";

const now = "2026-08-29T08:00:00Z";

test("an admin can create a clean next edition from an existing event", async ({ page }) => {
  const source = {
    id: "event-1",
    name: "Riverside Run 2026",
    slug: "riverside-run-2026",
    description: "A community race along the river.",
    cover_image: "/images/club/race-start.jpg",
    event_date: "2026-10-18T00:00:00Z",
    start_time: "0000-01-01T06:00:00Z",
    location: "Riverside",
    status: "REGISTRATION_OPEN",
    created_at: now,
    updated_at: now,
  };
  const clone = { ...source, id: "event-copy", name: "Riverside Run 2027", slug: "riverside-run-2027", event_date: "2027-10-18T00:00:00Z", status: "DRAFT" };
  let duplicatePayload: Record<string, unknown> | null = null;

  await page.route(/\/api\/v1\/me\/$/, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { id: "admin-1", email: "admin@example.com", role: "ADMIN", profile: { full_name: "Race Director" }, created_at: now, updated_at: now } }) }));
  await page.route(/\/api\/v1\/events\/?\?limit=100$/, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { events: [source], total: 1 } }) }));
  await page.route("**/api/v1/events/event-1/duplicate", async (route) => {
    duplicatePayload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ data: clone }) });
  });
  await page.route("**/api/v1/events/by-id/event-copy", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: clone }) }));
  await page.route("**/api/v1/events/riverside-run-2027", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { ...clone, categories: [], schedule: [], faqs: [], rules: [] } }) }));

  await page.goto("/admin/events");
  await expect(page.getByRole("heading", { name: "Events" })).toBeVisible();
  await page.getByRole("button", { name: "Duplicate Riverside Run 2026" }).click();

  const dialog = page.getByRole("dialog", { name: "Carry the race forward." });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("New event name")).toHaveValue("Riverside Run 2027");
  await expect(dialog.getByLabel("New event date")).toHaveValue("2027-10-18");
  await expect(dialog.getByText("Categories, prices, and capacity")).toBeVisible();
  await expect(dialog.getByText("Registrants, payments, and tickets")).toBeVisible();
  await expect(dialog.getByText("Registration open and close dates")).toBeVisible();

  await dialog.getByRole("button", { name: "Create next edition" }).click();
  await expect.poll(() => duplicatePayload).toEqual({ name: "Riverside Run 2027", event_date: "2027-10-18" });
  await expect(page).toHaveURL("/admin/events/event-copy/edit");
});
