import { expect, test } from "@playwright/test";

// Link unfurlers and crawlers do not run JavaScript. These assertions read the raw HTTP
// response rather than the rendered DOM, so a regression to client-only <head> is caught:
// before this work every shared race link unfurled as a blank card.
test("public pages ship their metadata in the served HTML", async ({ request, baseURL }) => {
  const response = await request.get(`${baseURL}/events`);
  expect(response.ok()).toBeTruthy();
  const html = await response.text();

  expect(html).toContain('property="og:title"');
  expect(html).toContain('property="og:description"');
  expect(html).toContain('name="twitter:card"');
  expect(html).toMatch(/<title[^>]*>[^<]*Race calendar[^<]*<\/title>/);
  expect(html).toContain('name="description"');
});

test("an event page server-renders its own title and poster", async ({ request, baseURL }) => {
  // Uses whatever the API actually has; the event page is server-rendered, so its metadata
  // cannot be mocked from the browser.
  const api = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:8080";
  const list = await request.get(`${api}/api/v1/events/?limit=1`).catch(() => null);
  let slug = "";
  if (list?.ok()) {
    const body = await list.json().catch(() => null);
    slug = body?.data?.events?.[0]?.slug || "";
  }
  test.skip(!slug, "no published event available in this environment");

  const response = await request.get(`${baseURL}/events/${slug}`);
  const html = await response.text();
  expect(html).toMatch(/<meta property="og:title" content="[^"]+"/);
  expect(html).toMatch(/<meta property="og:url" content="[^"]+"/);
  expect(html).toContain('rel="canonical"');
});

test("robots and sitemap are served", async ({ request, baseURL }) => {
  const robots = await request.get(`${baseURL}/robots.txt`);
  expect(robots.ok()).toBeTruthy();
  const robotsBody = await robots.text();
  expect(robotsBody).toContain("Disallow: /admin");

  const sitemap = await request.get(`${baseURL}/sitemap.xml`);
  expect(sitemap.ok()).toBeTruthy();
  expect(await sitemap.text()).toContain("<urlset");
});
