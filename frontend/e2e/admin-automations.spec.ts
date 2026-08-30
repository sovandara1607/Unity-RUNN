import { expect, test } from "@playwright/test";

const now = "2026-08-29T08:00:00Z";
const failedDeliveryId = "4ba87987-60f2-4bd4-a30e-221b4ce12bb1";

test("an admin can monitor automations and retry a failed Telegram delivery", async ({ page }) => {
  let retried = false;
  const snapshot = {
    configured: true,
    generated_at: now,
    window_days: 30,
    connected_runners: 42,
    preferences: { tickets: 40, reminders: 37, event_updates: 35 },
    counts: { total: 128, sent: 120, pending: 3, failed: 2, skipped: 3 },
    success_rate: 120 / 122,
    by_type: { REGISTRATION_CONFIRMATION: 55, PAYMENT_CONFIRMATION: 24, EVENT_REMINDER: 30, EVENT_UPDATE: 14, CANCELLATION: 5 },
    recent: [
      { id: failedDeliveryId, status: "FAILED", type: "EVENT_REMINDER", entity_id: "registration-1", runner_name: "Dara Runner", recipient_email: "dara@example.com", attempts: 5, failure_reason: "Telegram could not be reached", created_at: now, updated_at: now },
      { id: "86d69e73-525a-486e-9491-987b23263aa1", status: "SENT", type: "REGISTRATION_CONFIRMATION", entity_id: "registration-2", runner_name: "Sokha Runner", recipient_email: "sokha@example.com", attempts: 0, created_at: now, sent_at: now, updated_at: now },
    ],
  };

  await page.route(/\/api\/v1\/me\/$/, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { id: "admin-1", email: "admin@example.com", role: "ADMIN", profile: { full_name: "Race Director" }, created_at: now, updated_at: now } }) }));
  await page.route(/\/api\/v1\/admin\/automations(?:\/deliveries\/[0-9a-f-]+\/retry)?$/, async (route) => {
    if (route.request().method() === "POST") {
      retried = true;
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: snapshot }) });
  });

  await page.goto("/admin/automations");

  await expect(page.getByRole("heading", { name: "Automations" })).toBeVisible();
  await expect(page.getByText("Signals in motion.")).toBeVisible();
  await expect(page.getByText("42", { exact: true })).toBeVisible();
  await expect(page.getByText("Telegram could not be reached")).toBeVisible();
  await expect(page.getByText("Sokha Runner · sokha@example.com")).toBeVisible();

  await page.getByRole("button", { name: "Retry delivery to Dara Runner" }).click();
  await expect.poll(() => retried).toBe(true);
  await expect(page.getByText("Retry queued")).toBeVisible();
  await expect(page.getByText("PENDING", { exact: true })).toBeVisible();
});
