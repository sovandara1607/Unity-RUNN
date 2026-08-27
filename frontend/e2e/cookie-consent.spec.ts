import { expect, test } from "@playwright/test";

test("a new visitor can save and revisit cookie preferences", async ({ context, page }) => {
  await page.goto("/");

  const preferences = page.getByRole("dialog", { name: "Set your cookie pace." });
  await expect(preferences).toBeVisible();
  await preferences.getByRole("button", { name: "Essential only" }).click();
  await expect(preferences).toBeHidden();

  await expect.poll(async () => (await context.cookies()).find((cookie) => cookie.name === "unity_cookie_consent")?.value).toBe("essential");
  await page.reload();
  await expect(preferences).toBeHidden();

  await page.getByRole("button", { name: "Cookie settings" }).click();
  await expect(preferences).toBeVisible();
  await preferences.getByRole("button", { name: /Accept all/ }).click();
  await expect.poll(async () => (await context.cookies()).find((cookie) => cookie.name === "unity_cookie_consent")?.value).toBe("all");
});
