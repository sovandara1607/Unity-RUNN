import path from "node:path";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/auth/login");
  await page.locator("#login-email").fill("admin@unityrunclub.com");
  await page.locator("#login-password").fill("admin12345");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Club operations" })).toBeVisible();
});

test("an admin session survives a page reload", async ({ page }) => {
  await page.reload();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Club operations" })).toBeVisible();
});

test("an admin chooses the poster artboard before upload", async ({ page }) => {
  await page.goto("/admin/events/new");
  await expect(page.getByRole("heading", { name: "Create event" })).toBeVisible();

  const poster = path.resolve(process.cwd(), "public/images/club/race-start.jpg");
  await page.locator('input[type="file"][accept*="image/jpeg"]').setInputFiles(poster);
  const editor = page.getByRole("dialog", { name: "Set the final poster frame" });
  await expect(editor).toBeVisible();
  await editor.getByRole("button", { name: /Square/ }).click();
  await expect(editor.getByText("1200 × 1200 output")).toBeVisible();
  await editor.getByLabel("Zoom").fill("1.25");
  await expect(editor.getByText("125%")).toBeVisible();
  await editor.getByRole("button", { name: "Close poster editor" }).click();
  await expect(editor).toBeHidden();
});

test("an admin can add a precise event map pin", async ({ page }) => {
  await page.goto("/admin/events/new");
  await page.getByLabel("Location / venue").fill("Koh Pich, Phnom Penh, Cambodia");
  const map = page.locator(".leaflet-container");
  await expect(map).toBeVisible();
  await map.click({ position: { x: 190, y: 125 } });
  await page.getByText("Advanced coordinates").click();

  await expect(page.getByLabel("Latitude")).not.toHaveValue("");
  await expect(page.getByLabel("Longitude")).not.toHaveValue("");
  await expect(page.getByRole("link", { name: /Check in Google Maps/ })).toBeVisible();
});
