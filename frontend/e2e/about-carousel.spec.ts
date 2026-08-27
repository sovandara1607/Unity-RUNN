import { expect, test } from "@playwright/test";

test("a visitor can browse the About page gallery", async ({ page }) => {
  await page.goto("/about");

  const carousel = page.getByRole("region", { name: "Club moments" });
  await expect(carousel).toBeVisible();
  const activeImage = carousel.locator('figure[aria-hidden="false"] img');
  await expect(activeImage).toBeVisible();
  await expect.poll(() => activeImage.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);

  const firstSource = await activeImage.getAttribute("src");
  await carousel.getByRole("button", { name: "Next image" }).click();
  await expect.poll(() => carousel.locator('figure[aria-hidden="false"] img').getAttribute("src")).not.toBe(firstSource);
});
