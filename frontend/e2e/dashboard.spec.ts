import { expect, test } from "@playwright/test";

const now = "2026-08-26T08:00:00Z";
const events = [
  { id: "event-confirmed", name: "Riverside 10K", slug: "riverside-10k", description: "", cover_image: "", event_date: "2026-08-30", start_time: "06:00", location: "Riverside", status: "REGISTRATION_OPEN", created_at: now, updated_at: now },
  { id: "event-pending", name: "Night Relay", slug: "night-relay", description: "", cover_image: "", event_date: "2026-09-20", start_time: "18:00", location: "Koh Pich", status: "REGISTRATION_OPEN", created_at: now, updated_at: now },
];

const registrationBase = {
  user_id: "runner-1",
  event_category_id: "category-1",
  full_name: "Demo Runner",
  email: "demo@example.com",
  phone: "012345678",
  gender: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  tshirt_size: "M",
  created_at: now,
  updated_at: now,
};

test("the dashboard prioritizes an entry that still needs payment", async ({ page }) => {
  await page.route(/\/api\/v1\/me\/$/, (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ data: { id: "runner-1", email: "demo@example.com", name: "Demo Runner", role: "USER", created_at: now, updated_at: now } }),
  }));
  await page.route("**/api/v1/me/registrations", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ data: { registrations: [
      { ...registrationBase, id: "registration-confirmed", registration_number: "URC-2026-000010", event_id: "event-confirmed", status: "CONFIRMED" },
      { ...registrationBase, id: "registration-pending", registration_number: "URC-2026-000011", event_id: "event-pending", status: "PENDING" },
    ] } }),
  }));
  await page.route("**/api/v1/events/**", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ data: { events, total: events.length } }),
  }));

  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "Hi, Demo." })).toBeVisible();
  const ticket = page.locator("#ticket");
  await expect(ticket.getByText("Action needed")).toBeVisible();
  await expect(ticket.getByRole("heading", { name: "Night Relay" })).toBeVisible();
  await expect(ticket.getByRole("button", { name: "Pay now" })).toBeVisible();
  await expect(page.locator("#entries").getByText("Riverside 10K")).toBeVisible();
});
