import { expect, test } from "@playwright/test";

const now = "2026-08-29T08:00:00Z";

test("an admin schedules a confirmed-runner event transmission", async ({ page }) => {
  const event = { id: "event-1", name: "Riverside Run", slug: "riverside-run", description: "", cover_image: "", event_date: "2026-10-18T00:00:00Z", start_time: "0000-01-01T06:00:00Z", location: "Riverside", status: "REGISTRATION_OPEN", created_at: now, updated_at: now };
  let payload: Record<string, unknown> | null = null;

  await page.route(/\/api\/v1\/me\/$/, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { id: "admin-1", email: "admin@example.com", role: "ADMIN", profile: { full_name: "Race Director" }, created_at: now, updated_at: now } }) }));
  await page.route("**/api/v1/events/by-id/event-1", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: event }) }));
  await page.route("**/api/v1/events/riverside-run", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { ...event, categories: [], schedule: [], faqs: [], rules: [] } }) }));
  await page.route(/\/api\/v1\/events\/event-1\/automations\/?$/, async (route) => {
    if (route.request().method() === "POST") {
      payload = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { id: "automation-1", event_id: event.id, ...payload, status: "SCHEDULED", sent_count: 0, attempts: 0, created_at: now, updated_at: now } }) });
      return;
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: [] }) });
  });

  await page.goto("/admin/events/event-1/edit");
  await page.getByRole("button", { name: "Transmissions" }).click();
  await expect(page.getByText("Confirmed runners only")).toBeVisible();

  await page.getByLabel("Message title").fill("Bib collection moved indoors");
  await page.getByLabel("Runner message").fill("Use Hall B at the south gate. Bring a photo ID.");
  await page.getByLabel("Send date & time").fill("2026-09-01T08:30");
  await page.getByRole("button", { name: "Review & schedule" }).click();
  const preview = page.getByRole("dialog", { name: "Schedule this transmission?" });
  await expect(preview.getByText("Confirmed runners")).toBeVisible();
  await expect(preview.getByText("Telegram enabled")).toBeVisible();
  await preview.getByRole("button", { name: "Confirm schedule" }).click();

  await expect.poll(() => payload).toMatchObject({ name: "Bib collection moved indoors", message: "Use Hall B at the south gate. Bring a photo ID." });
  await expect.poll(() => typeof payload?.send_at).toBe("string");
  await expect(page.getByText("Bib collection moved indoors", { exact: true })).toBeVisible();
  await expect(page.getByText("Transmission scheduled")).toBeVisible();
});

test("an admin can schedule a draft, retry a failure, and confirm cancellation", async ({ page }) => {
  const event = { id: "event-1", name: "Riverside Run", slug: "riverside-run", description: "", cover_image: "", event_date: "2026-10-18T00:00:00Z", start_time: "0000-01-01T06:00:00Z", location: "Riverside", status: "REGISTRATION_OPEN", created_at: now, updated_at: now };
  const draft = { id: "automation-draft", event_id: event.id, name: "Parking plan", message: "Parking details are being finalized.", status: "DRAFT", sent_count: 0, attempts: 0, created_at: now, updated_at: now };
  const failed = { id: "automation-failed", event_id: event.id, name: "Weather briefing", message: "The start remains on schedule.", send_at: "2026-08-29T08:30:00Z", status: "FAILED", sent_count: 0, attempts: 5, last_error: "fan-out failed", created_at: now, updated_at: now };
  const scheduled = { id: "automation-cancel", event_id: event.id, name: "Old shuttle plan", message: "Use the east shuttle.", send_at: "2026-10-01T08:30:00Z", status: "SCHEDULED", sent_count: 0, attempts: 0, created_at: now, updated_at: now };
  const patches: Array<{ id: string; body: Record<string, unknown> }> = [];
  let cancelled = "";

  await page.route(/\/api\/v1\/me\/$/, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { id: "admin-1", email: "admin@example.com", role: "ADMIN", profile: { full_name: "Race Director" }, created_at: now, updated_at: now } }) }));
  await page.route("**/api/v1/events/by-id/event-1", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: event }) }));
  await page.route("**/api/v1/events/riverside-run", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { ...event, categories: [], schedule: [], faqs: [], rules: [] } }) }));
  await page.route(/\/api\/v1\/events\/event-1\/automations\/?(?:automation-[^/?]+)?$/, async (route) => {
    const request = route.request();
    const id = request.url().split("/").filter(Boolean).at(-1) || "";
    if (request.method() === "PATCH") {
      const body = request.postDataJSON() as Record<string, unknown>;
      patches.push({ id, body });
      const source = id === draft.id ? draft : failed;
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { ...source, ...body, status: body.send_at ? "SCHEDULED" : "DRAFT", attempts: 0, last_error: "", updated_at: now } }) });
      return;
    }
    if (request.method() === "DELETE") {
      cancelled = id;
      await route.fulfill({ status: 204 });
      return;
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: [scheduled, failed, draft] }) });
  });

  await page.goto("/admin/events/event-1/edit");
  await page.getByRole("button", { name: "Transmissions" }).click();
  await expect(page.getByText("3 total")).toBeVisible();

  const draftRow = page.locator("article").filter({ hasText: "Parking plan" });
  await draftRow.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Runner message").fill("Use the west lot and show your race bib.");
  await page.getByLabel("Send date & time").fill("2026-10-02T08:30");
  await page.getByRole("button", { name: "Review & schedule" }).click();
  await page.getByRole("dialog", { name: "Schedule this transmission?" }).getByRole("button", { name: "Confirm reschedule" }).click();
  await expect.poll(() => patches[0]).toMatchObject({ id: draft.id, body: { message: "Use the west lot and show your race bib." } });

  const failedRow = page.locator("article").filter({ hasText: "Weather briefing" });
  await failedRow.getByRole("button", { name: "Retry setup" }).click();
  await expect(page.getByLabel("Message title")).toHaveValue("Weather briefing");
  await expect(page.getByLabel("Send date & time")).not.toHaveValue("");

  const cancelRow = page.locator("article").filter({ hasText: "Old shuttle plan" });
  await cancelRow.getByRole("button", { name: "Cancel Old shuttle plan" }).click();
  const cancelDialog = page.getByRole("dialog", { name: /Cancel “Old shuttle plan”/ });
  await expect(cancelDialog.getByText("stays in the timeline")).toBeVisible();
  await cancelDialog.getByRole("button", { name: "Cancel transmission" }).click();
  await expect.poll(() => cancelled).toBe(scheduled.id);
  await expect(cancelRow.getByText("CANCELLED", { exact: true })).toBeVisible();
});
