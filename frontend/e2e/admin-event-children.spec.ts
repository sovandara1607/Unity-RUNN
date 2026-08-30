import { expect, test } from "@playwright/test";

const now = "2026-08-28T08:00:00Z";

test("an admin can maintain the event setup and runner guide", async ({ page }) => {
  const event = { id: "event-1", name: "Riverside Run", slug: "riverside-run", description: "", cover_image: "", event_date: "2026-10-18T00:00:00Z", start_time: "0000-01-01T06:00:00Z", location: "Riverside", status: "DRAFT", created_at: now, updated_at: now };
  const category = { id: "category-10k", event_id: event.id, name: "Riverside 10K", distance: "10 km", price_cents: 1500, currency: "USD", capacity: 100, registration_deadline: null, status: "OPEN", created_at: now, updated_at: now };
  const scheduleItem = { id: "schedule-checkin", event_id: event.id, time: "0000-01-01T05:30:00Z", title: "Runner check-in", description: "Collect bibs.", sort_order: 1, created_at: now, updated_at: now };
  let categoryPatch: Record<string, unknown> | null = null;
  let categoryPost: Record<string, unknown> | null = null;
  let schedulePatch: Record<string, unknown> | null = null;
  let faqPatch: Record<string, unknown> | null = null;
  let rulePatch: Record<string, unknown> | null = null;
  const deleted = new Set<string>();

  await page.route(/\/api\/v1\/me\/$/, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { id: "admin-1", email: "admin@example.com", role: "ADMIN", profile: { full_name: "Race Director" }, created_at: now, updated_at: now } }) }));
  await page.route("**/api/v1/events/by-id/event-1", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: event }) }));
  await page.route("**/api/v1/events/riverside-run", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { ...event, categories: [category], schedule: [scheduleItem], faqs: [], rules: [] } }) }));
  await page.route(/\/api\/v1\/events\/event-1\/categories\/?(?:category-[^/?]+)?$/, async (route) => {
    const request = route.request();
    const payload = request.postDataJSON() as Record<string, unknown> | null;
    if (request.method() === "PATCH") {
      categoryPatch = payload;
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { ...category, ...payload, updated_at: now } }) });
    } else if (request.method() === "POST") {
      categoryPost = payload;
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { ...category, ...payload, id: "category-fun-run", status: "OPEN", updated_at: now } }) });
    } else if (request.method() === "DELETE") {
      deleted.add("category");
      await route.fulfill({ status: 204 });
    } else await route.fallback();
  });
  await page.route(/\/api\/v1\/events\/event-1\/schedules\/?(?:schedule-[^/?]+)?$/, async (route) => {
    const request = route.request();
    const payload = request.postDataJSON() as Record<string, unknown> | null;
    if (request.method() === "PATCH") {
      schedulePatch = payload;
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { ...scheduleItem, ...payload, updated_at: now } }) });
    } else if (request.method() === "POST") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { ...scheduleItem, ...payload, id: "schedule-awards", updated_at: now } }) });
    } else if (request.method() === "DELETE") {
      deleted.add("schedule");
      await route.fulfill({ status: 204 });
    } else await route.fallback();
  });
  await page.route(/\/api\/v1\/events\/event-1\/faqs\/?(?:faq-[^/?]+)?$/, async (route) => {
    const request = route.request();
    const payload = request.postDataJSON() as Record<string, unknown> | null;
    const faq = { id: "faq-parking", event_id: event.id, question: "Where can I park?", answer: "Use the north lot.", sort_order: 1, created_at: now, updated_at: now };
    if (request.method() === "PATCH") {
      faqPatch = payload;
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { ...faq, ...payload, updated_at: now } }) });
    } else if (request.method() === "POST") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { ...faq, ...payload } }) });
    } else if (request.method() === "DELETE") {
      deleted.add("faq");
      await route.fulfill({ status: 204 });
    } else await route.fallback();
  });
  await page.route(/\/api\/v1\/events\/event-1\/rules\/?(?:rule-[^/?]+)?$/, async (route) => {
    const request = route.request();
    const payload = request.postDataJSON() as Record<string, unknown> | null;
    const rule = { id: "rule-bib", event_id: event.id, rule: "Keep your race bib visible.", sort_order: 1, created_at: now, updated_at: now };
    if (request.method() === "PATCH") {
      rulePatch = payload;
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { ...rule, ...payload, updated_at: now } }) });
    } else if (request.method() === "POST") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { ...rule, ...payload } }) });
    } else if (request.method() === "DELETE") {
      deleted.add("rule");
      await route.fulfill({ status: 204 });
    } else await route.fallback();
  });

  await page.goto("/admin/events/event-1/edit");
  await expect(page.getByRole("heading", { name: "Edit: Riverside Run" })).toBeVisible();

  await page.getByRole("button", { name: "Categories (1)" }).click();
  await page.getByRole("button", { name: "Edit" }).click();
  const categoryEditor = page.locator("section").filter({ hasText: "Editing category" });
  await categoryEditor.getByLabel("Category price").fill("18.50");
  await categoryEditor.getByLabel("Category capacity").fill("140");
  await categoryEditor.getByLabel("Category registration deadline").fill("2026-10-01T20:00");
  await categoryEditor.getByLabel("Category status").selectOption("CLOSED");
  await page.getByRole("button", { name: "Save category" }).click();
  await expect.poll(() => categoryPatch).toMatchObject({ price_cents: 1850, capacity: 140, status: "CLOSED", clear_registration_deadline: false });
  await expect.poll(() => typeof categoryPatch?.registration_deadline).toBe("string");

  await page.getByRole("button", { name: "Edit" }).click();
  await categoryEditor.getByLabel("Category registration deadline").fill("");
  await page.getByRole("button", { name: "Save category" }).click();
  await expect.poll(() => categoryPatch).toMatchObject({ clear_registration_deadline: true });

  const categoryForm = page.locator("form").filter({ hasText: "Add another category" });
  await categoryForm.getByLabel("Category name").fill("Fun Run");
  await categoryForm.getByLabel("Category distance").fill("3 km");
  await categoryForm.getByLabel("Category capacity").fill("80");
  await categoryForm.getByLabel("Category registration deadline").fill("2026-10-05T20:00");
  await page.getByRole("button", { name: "Add category" }).click();
  await expect.poll(() => typeof categoryPost?.registration_deadline).toBe("string");
  await expect(page.getByText("Fun Run", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove Fun Run" }).click();
  await page.getByRole("button", { name: "Confirm remove" }).click();
  await expect.poll(() => deleted.has("category")).toBe(true);

  await page.getByRole("button", { name: /Race Schedule/ }).click();
  await page.getByRole("button", { name: "Edit" }).click();
  const scheduleEditor = page.locator("section").filter({ hasText: "Editing race-day moment" });
  await scheduleEditor.getByLabel("Schedule time").fill("05:45");
  await scheduleEditor.getByLabel("Schedule title").fill("Bib collection opens");
  await page.getByRole("button", { name: "Save schedule" }).click();
  await expect.poll(() => schedulePatch).toMatchObject({ time: "05:45:00", title: "Bib collection opens" });

  const scheduleForm = page.locator("form").filter({ hasText: "Add to race day" });
  await scheduleForm.getByLabel("Schedule time").fill("09:30");
  await scheduleForm.getByLabel("Schedule title").fill("Awards");
  await scheduleForm.getByLabel("Schedule description").fill("Main stage presentation.");
  await page.getByRole("button", { name: "Add schedule item" }).click();
  await expect(page.getByText("Awards", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove Awards" }).click();
  await page.getByRole("button", { name: "Confirm remove" }).click();
  await expect.poll(() => deleted.has("schedule")).toBe(true);

  await page.getByRole("button", { name: "Runner Guide (0)" }).click();
  const faqSection = page.locator("section").filter({ has: page.getByRole("heading", { name: "Runner questions" }) });
  await faqSection.getByLabel("New FAQ question").fill("Where can I park?");
  await faqSection.getByLabel("New FAQ answer").fill("Use the north lot.");
  await faqSection.getByRole("button", { name: "Add FAQ" }).click();
  await expect(faqSection.getByText("Where can I park?", { exact: true })).toBeVisible();
  await faqSection.getByRole("button", { name: "Edit" }).click();
  await faqSection.getByLabel("Edit FAQ answer").fill("Use the north lot shuttle.");
  await faqSection.getByLabel("Edit FAQ order").fill("2");
  await faqSection.getByRole("button", { name: "Save FAQ" }).click();
  await expect.poll(() => faqPatch).toMatchObject({ answer: "Use the north lot shuttle.", sort_order: 2 });
  await faqSection.getByRole("button", { name: "Remove Where can I park?" }).click();
  await faqSection.getByRole("button", { name: "Confirm remove" }).click();
  await expect.poll(() => deleted.has("faq")).toBe(true);

  const ruleSection = page.locator("section").filter({ has: page.getByRole("heading", { name: "Participation rules" }) });
  await ruleSection.getByLabel("New rule text").fill("Keep your race bib visible.");
  await ruleSection.getByRole("button", { name: "Add rule" }).click();
  await expect(ruleSection.getByText("Keep your race bib visible.", { exact: true })).toBeVisible();
  await ruleSection.getByRole("button", { name: "Edit" }).click();
  await ruleSection.getByLabel("Edit rule text").fill("Keep your race bib visible at all times.");
  await ruleSection.getByRole("button", { name: "Save rule" }).click();
  await expect.poll(() => rulePatch).toMatchObject({ rule: "Keep your race bib visible at all times." });
  await ruleSection.getByRole("button", { name: "Remove Keep your race bib visible at all times." }).click();
  await ruleSection.getByRole("button", { name: "Confirm remove" }).click();
  await expect.poll(() => deleted.has("rule")).toBe(true);
});
