import { expect, test } from "@playwright/test";

const now = "2026-09-16T00:00:00Z";
const event = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Riverside Run",
  slug: "riverside-run",
  event_date: "2026-10-18T00:00:00Z",
  start_time: "0000-01-01T06:00:00Z",
  location: "Riverside",
  status: "REGISTRATION_OPEN",
  created_at: now,
  updated_at: now,
};
const registration = {
  id: "22222222-2222-4222-8222-222222222222",
  registration_number: "URC-2026-000042",
  user_id: "33333333-3333-4333-8333-333333333333",
  event_id: event.id,
  event_category_id: "44444444-4444-4444-8444-444444444444",
  event_name: event.name,
  category_name: "10K",
  status: "CONFIRMED",
  full_name: "Dara Runner",
  email: "dara@example.com",
  phone: "+85512345678",
  gender: "OTHER",
  emergency_contact_name: "Sokha",
  emergency_contact_phone: "+85598765432",
  tshirt_size: "M",
  created_at: now,
  updated_at: now,
};

async function mockDesk(page: import("@playwright/test").Page, registrations = [registration], events = [event]) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: async () => [{ deviceId: "gate-camera", kind: "videoinput", label: "Gate camera", groupId: "gate" }],
        getSupportedConstraints: () => ({}),
        getUserMedia: async () => { throw new DOMException("Permission denied", "NotAllowedError"); },
      },
    });
  });
  await page.route(/\/api\/v1\/me\/$/, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { id: "staff-1", email: "staff@example.com", role: "STAFF", profile: { full_name: "Gate Desk" }, created_at: now, updated_at: now } }) }));
  await page.route(/\/api\/v1\/site-config$/, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: {} }) }));
  await page.route(/\/api\/v1\/events\/?\?.*$/, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { events, total: events.length } }) }));
  await page.route(/\/api\/v1\/admin\/registrations\?.*$/, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { registrations, total: registrations.length } }) }));
}

test("check-in remains usable when camera access is blocked", async ({ page }) => {
  await mockDesk(page);
  await page.route(/\/api\/v1\/check-in$/, async (route) => {
    const request = route.request().postDataJSON();
    expect(request).toEqual({ token: registration.registration_number, event_id: event.id });
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { registration, check_in: { id: "checkin-1", registration_id: registration.id, checked_in_by: "staff-1", checked_in_at: now } } }) });
  });

  await page.goto("/admin/checkin");
  await expect(page.getByRole("heading", { name: "Scan tickets" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Camera unavailable" })).toBeVisible();
  await expect(page.getByText("Camera access is blocked.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Mute check-in sounds" }).click();
  await expect(page.getByRole("button", { name: "Enable check-in sounds" })).toBeVisible();
  await page.getByRole("button", { name: "Retry camera" }).click();
  await expect(page.getByRole("heading", { name: "Camera unavailable" })).toBeVisible();
  const viewport = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.clientWidth);
  await page.getByLabel("Ticket lookup").fill(registration.registration_number);
  await page.getByRole("button", { name: "Check ticket" }).click();
  await expect(page.getByRole("heading", { name: "Entry confirmed" })).toBeVisible();
  await expect(page.getByRole("status").getByText("Dara Runner", { exact: true })).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
});

test("check-in loading failure gives staff a working retry", async ({ page }) => {
  let eventRequests = 0;
  await mockDesk(page, []);
  await page.unroute(/\/api\/v1\/events\/?\?.*$/);
  await page.route(/\/api\/v1\/events\/?\?.*$/, (route) => {
    eventRequests++;
    if (eventRequests === 1) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "Event service is offline" } }) });
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { events: [event], total: 1 } }) });
  });

  await page.goto("/admin/checkin");
  await expect(page.getByRole("heading", { name: "The check-in desk did not load" })).toBeVisible();
  await page.getByRole("button", { name: "Retry loading" }).click();
  await expect(page.getByRole("heading", { name: "Scan tickets" })).toBeVisible();
  expect(eventRequests).toBe(2);
});

test("check-in explains when no event is available", async ({ page }) => {
  await mockDesk(page, [], []);

  await page.goto("/admin/checkin");
  await expect(page.getByRole("heading", { name: "No event is ready for check-in" })).toBeVisible();
  await expect(page.getByText("Publish an event before opening this station.")).toBeVisible();
});
