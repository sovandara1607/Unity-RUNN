import { expect, test } from "@playwright/test";

const now = "2026-08-29T08:00:00Z";

test("staff can review and download the complete filtered roster", async ({ page }) => {
  const event = { id: "11111111-1111-4111-8111-111111111111", name: "Riverside Run", slug: "riverside-run", event_date: "2026-10-18T00:00:00Z", start_time: "0000-01-01T06:00:00Z", location: "Riverside", status: "REGISTRATION_OPEN", created_at: now, updated_at: now };
  const registration = { id: "22222222-2222-4222-8222-222222222222", registration_number: "URC-2026-000042", user_id: "33333333-3333-4333-8333-333333333333", event_id: event.id, event_category_id: "44444444-4444-4444-8444-444444444444", event_name: event.name, category_name: "10K", status: "CONFIRMED", full_name: "Dara Runner", email: "dara@example.com", phone: "+85512345678", gender: "OTHER", emergency_contact_name: "Sokha", emergency_contact_phone: "+85598765432", tshirt_size: "M", created_at: now, updated_at: now };
  const listURLs: string[] = [];
  let exportURL = "";

  await page.route(/\/api\/v1\/me\/$/, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { id: "staff-1", email: "staff@example.com", role: "STAFF", profile: { full_name: "Roster Desk" }, created_at: now, updated_at: now } }) }));
  await page.route(/\/api\/v1\/events\/?\?.*$/, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { events: [event], total: 1 } }) }));
  await page.route(/\/api\/v1\/admin\/registrations\?.*$/, (route) => {
    listURLs.push(route.request().url());
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { registrations: [registration], total: 425 } }) });
  });
  await page.route(/\/api\/v1\/admin\/registrations\/export\.csv(?:\?.*)?$/, (route) => {
    exportURL = route.request().url();
    return route.fulfill({
      status: 200,
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="unity-roster-2026-08-29.csv"', "access-control-expose-headers": "Content-Disposition" },
      body: "Registration Number,Full Name\nURC-2026-000042,Dara Runner\n",
    });
  });

  await page.goto("/admin/registrations");
  await expect(page.getByRole("button", { name: "Dara Runner" })).toBeVisible();
  await expect(page.locator("p:visible").filter({ hasText: "Riverside Run · 10K" })).toBeVisible();
  await expect(page.getByText("Showing 1 of 425 matching registrations")).toBeVisible();

  await page.getByLabel("Filter roster by event").selectOption(event.id);
  await page.getByLabel("Filter roster by status").selectOption("CONFIRMED");
  await page.getByLabel("Search runner roster").fill("Dara");
  await expect.poll(() => listURLs.some((url) => url.includes(`event_id=${event.id}`) && url.includes("status=CONFIRMED") && url.includes("search=Dara"))).toBe(true);

  await page.getByRole("button", { name: "Review export" }).click();
  const dialog = page.getByRole("dialog", { name: "Review CSV export" });
  await expect(dialog.getByText("425", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Riverside Run", { exact: true })).toBeVisible();
  await expect(dialog.getByText("neutralizes spreadsheet formulas")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download 425 rows" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("unity-roster-2026-08-29.csv");
  expect(exportURL).toContain(`event_id=${event.id}`);
  expect(exportURL).toContain("status=CONFIRMED");
  expect(exportURL).toContain("search=Dara");
});
