import { expect, test } from "@playwright/test";

const now = "2026-08-28T08:00:00Z";
const profile = {
  id: "profile-1",
  user_id: "runner-1",
  full_name: "Dara Runner",
  phone: "012345678",
  date_of_birth: "1998-06-12T00:00:00Z",
  gender: "OTHER",
  emergency_contact_name: "Sokha Runner",
  emergency_contact_phone: "098765432",
  tshirt_size: "M",
  created_at: now,
  updated_at: now,
};

test("a runner can update the details reused by race registration", async ({ page }) => {
  let savedPayload: Record<string, unknown> | null = null;

  await page.route(/\/api\/v1\/me\/telegram$/, (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ data: { available: false, connected: false, preferences: { tickets: true, reminders: true, event_updates: true } } }),
  }));
  await page.route(/\/api\/v1\/me\/telegram\/deliveries$/, (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ data: [] }),
  }));

  await page.route(/\/api\/v1\/me\/$/, async (route) => {
    if (route.request().method() === "PATCH") {
      savedPayload = route.request().postDataJSON();
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ data: { ...profile, ...savedPayload, tshirt_size: "L", updated_at: "2026-08-28T09:00:00Z" } }),
      });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ data: { id: "runner-1", email: "dara@example.com", role: "USER", profile, created_at: now, updated_at: now } }),
    });
  });

  await page.goto("/profile");

  await expect(page.getByRole("heading", { name: /Ready before race day/i })).toBeVisible();
  await expect(page.getByText("5", { exact: true })).toBeVisible();
  await expect(page.getByText("dara@example.com")).toBeVisible();

  await page.getByLabel("Phone", { exact: true }).fill("+855 10 222 333");
  await page.getByLabel("Unisex shirt size").selectOption("L");
  await page.getByRole("button", { name: "Save runner card" }).click();

  await expect.poll(() => savedPayload).toMatchObject({ phone: "+855 10 222 333", tshirt_size: "L", date_of_birth: "1998-06-12" });
  await expect(page.getByText("New race forms will start with these details.")).toBeVisible();
  await expect(page.getByText("Your runner card is up to date.")).toBeVisible();
});

test("a runner can connect Telegram delivery for ticket automations", async ({ page }) => {
  let linkRequested = false;
  let connected = false;
  let testSent = false;
  let preferences = { tickets: true, reminders: true, event_updates: true };

  await page.route(/\/api\/v1\/me\/$/, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ data: { id: "runner-1", email: "dara@example.com", role: "USER", profile, created_at: now, updated_at: now } }),
    });
  });
  await page.route(/\/api\/v1\/me\/telegram(?:\/(?:link|preferences|test|deliveries))?$/, async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith("/deliveries")) {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: [{
        id: "delivery-1", channel: "TELEGRAM", status: "SENT", type: "EVENT_REMINDER",
        entity_id: "registration-1", attempts: 0, created_at: now, sent_at: now, updated_at: now,
      }] }) });
      return;
    }
    if (pathname.endsWith("/test")) {
      testSent = true;
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    if (route.request().method() === "PATCH") {
      preferences = route.request().postDataJSON();
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { available: true, connected: true, bot_name: "unity_runn_bot", account: { username: "dara_runs", first_name: "Dara", linked_at: now }, preferences } }) });
      return;
    }
    if (pathname.endsWith("/link")) {
      linkRequested = true;
      connected = true;
      await route.fulfill({ contentType: "application/json", status: 201, body: JSON.stringify({ data: { url: "https://t.me/unity_runn_bot?start=link_demo", expires_at: "2099-08-29T10:10:00Z" } }) });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ data: connected
        ? { available: true, connected: true, bot_name: "unity_runn_bot", account: { username: "dara_runs", first_name: "Dara", linked_at: now }, preferences }
        : { available: true, connected: false, bot_name: "unity_runn_bot", preferences } }),
    });
  });
  page.on("popup", (popup) => popup.close());

  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Delivery automations" })).toBeVisible();
  await page.getByRole("button", { name: "Connect Telegram" }).click();

  await expect.poll(() => linkRequested).toBe(true);
  await expect(page.getByText("Signal live")).toBeVisible({ timeout: 6000 });
  await expect(page.getByText("Connected as @dara_runs")).toBeVisible();
  await expect(page.getByText("Race tickets and important updates will now arrive there too.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent signals" })).toBeVisible();
  await expect(page.getByText("Race reminder", { exact: true })).toBeVisible();
  await expect(page.getByText("Delivered", { exact: true })).toBeVisible();

  await page.getByRole("switch", { name: "Disable Race reminders" }).click();
  await expect.poll(() => preferences.reminders).toBe(false);
  await expect(page.getByText("Paused on Telegram")).toBeVisible();

  await page.getByRole("button", { name: "Send test" }).click();
  await expect.poll(() => testSent).toBe(true);
  await expect(page.getByText("Check your Telegram chat for the Unity Runn Club message.")).toBeVisible();
});
