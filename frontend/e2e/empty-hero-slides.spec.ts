import { expect, test } from "@playwright/test";

// An admin who removes every hero slide used to white-screen the homepage: ClubCarousel
// read slides[active] with no guard and computed `% slides.length` as NaN.
test("the homepage survives an empty hero carousel", async ({ page }) => {
  await page.route("**/api/v1/site-config", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ data: {
      club_name: "Unity Runn Club",
      location_label: "Phnom Penh · KH",
      logo_url: "",
      primary_color: "#d9ff00",
      accent_color: "#3155ff",
      background_color: "#111111",
      announcement_enabled: false,
      hero_intro: "Community runs for Phnom Penh runners.",
      hero_title_primary: "Unity",
      hero_title_secondary: "Run Club",
      mission_text: "We run together.",
      mission_supporting_text: "Every week.",
      primary_cta_label: "Browse races",
      primary_cta_href: "/events",
      hero_slides: [],
    } }),
  }));

  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Unity", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Browse races/i }).first()).toBeVisible();
  expect(errors).toEqual([]);
});
