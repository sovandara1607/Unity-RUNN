import { expect, test } from "@playwright/test";

test("a runner can discover an event and see its complete poster", async ({ page }) => {
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
});

