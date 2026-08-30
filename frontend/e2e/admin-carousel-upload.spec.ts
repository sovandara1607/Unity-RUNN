import { expect, test } from "@playwright/test";

const now = "2026-08-30T08:00:00Z";
const uploadedPath = "/uploads/site/admin-hero.png";
const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

test("an admin-uploaded carousel image renders on the public homepage", async ({ page }) => {
  let imageRequested = false;
  let published: Record<string, unknown> | null = null;
  let config = {
    club_name: "Unity Runn Club", location_label: "Phnom Penh · KH", logo_url: "/Unity-Logos/logo%20UNTR-02.png",
    primary_color: "#d9ff00", accent_color: "#3155ff", background_color: "#111111",
    announcement_enabled: false, announcement_text: "", announcement_href: "", announcement_event_id: null,
    announcement_event_name: "", announcement_event_slug: "", hero_intro: "Run together.",
    hero_title_primary: "Unity", hero_title_secondary: "Run Club", mission_eyebrow: "Founded 2026",
    mission_text: "Cambodia-born runners.", mission_supporting_text: "Move together.", primary_cta_label: "Explore events",
    primary_cta_href: "/events", footer_text: "Unity Runn Club", value_messages: ["Grow the sport"],
    hero_slides: [{ image_url: "/images/club/riverside-run.jpg", alt: "Runners at sunrise", eyebrow: "Dawn miles", title: "Move as a crew.", copy: "Easy starts." }],
    updated_at: now,
  };

  await page.route(/\/api\/v1\/me\/$/, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { id: "admin-1", email: "admin@example.com", role: "ADMIN", profile: { full_name: "Race Director" }, created_at: now, updated_at: now } }) }));
  await page.route(/\/api\/v1\/site-config$/, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: config }) }));
  await page.route(/\/api\/v1\/admin\/site-config\/versions(?:\?.*)?$/, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { versions: [] } }) }));
  await page.route(/\/api\/v1\/events\/?(?:\?.*)?$/, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { events: [], total: 0 } }) }));
  await page.route(/\/api\/v1\/admin\/site-config\/assets$/, (route) => route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ data: { url: uploadedPath } }) }));
  await page.route(/\/api\/v1\/admin\/site-config$/, async (route) => {
    published = route.request().postDataJSON() as Record<string, unknown>;
    config = { ...config, ...(published as typeof config), updated_at: "2026-08-30T08:01:00Z" };
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: config }) });
  });
  await page.route(`**${uploadedPath}`, (route) => {
    imageRequested = true;
    return route.fulfill({ status: 200, contentType: "image/png", body: pixel });
  });
  await page.route(/\/api\/v1\/stats$/, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { open_events: 0, confirmed_runners: 0, locations: 0 } }) }));

  await page.goto("/admin/public-site");
  const firstSlide = page.locator("article").filter({ hasText: "Slide 01" });
  await firstSlide.locator('input[type="file"]').setInputFiles({ name: "hero.png", mimeType: "image/png", buffer: pixel });
  const adminPreview = firstSlide.getByAltText("Brand asset preview");
  await expect(adminPreview).toHaveAttribute("src", `http://localhost:8080${uploadedPath}`);
  await page.getByRole("button", { name: "Publish changes" }).click();
  await expect.poll(() => ((published?.hero_slides as Array<{ image_url: string }> | undefined)?.[0]?.image_url)).toBe(uploadedPath);

  await page.goto("/");
  const hero = page.getByRole("region", { name: "Unity Runn Club hero" });
  const publicImage = hero.locator('figure[aria-hidden="false"] img');
  await expect(publicImage).toHaveAttribute("src", `http://localhost:8080${uploadedPath}`);
  await expect.poll(() => publicImage.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  expect(imageRequested).toBe(true);
});
