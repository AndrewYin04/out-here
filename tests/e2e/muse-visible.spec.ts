import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";

// Issue #12: a judge sees what Muse did without tapping anything. Alex asks "hungry, 40 min,
// under $15"; the sheet shows what was read, how many plans and friends were checked, the
// ramen (too far) and sushi (over budget) ruled out with numbers, and the dumpling pick
// with its why, all with no click after "Find a plan". Code counts and filters, so only the
// rank line may carry ✨ Muse, and only when the live model ranked.
const SHOTS = ".verify/muse-visible";

// Headless Chromium's default GL backend drops the map canvas after a few idle seconds at phone
// size, so screenshots showed a gray map with pins. SwiftShader keeps the tiles drawn.
test.use({ launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } });

test("Muse's reasoning is visible on the plan sheet without a tap", async ({ page }, info) => {
  const phone = info.project.name === "phone";
  if (phone) await page.setViewportSize({ width: 390, height: 844 });
  mkdirSync(SHOTS, { recursive: true });

  // Hold the answer briefly so the step-by-step progress can be seen.
  await page.route("**/api/muse/plan", async (route) => {
    await new Promise((r) => setTimeout(r, 1_200));
    await route.continue().catch(() => undefined);
  });

  await page.goto("/out-here?as=alex");
  await page.getByRole("button", { name: "I'm free" }).click();
  await page.locator("#imfree-text").fill("hungry, 40 min, under $15");
  await page.getByRole("button", { name: "Find a plan" }).click();

  const loading = page.getByTestId("muse-steps-loading");
  await expect(loading).toBeVisible();
  await expect(loading).toContainText("Reading what you asked for");
  await expect(page.getByTestId("plan-loading")).toHaveCount(0, { timeout: 15_000 });

  const work = page.getByTestId("muse-work");
  await expect(work).toBeVisible();
  await expect(page.getByTestId("muse-work-checked")).toHaveText(/^Checked \d+ plans and \d+ friends · \d+ fit$/);
  const rank = page.getByTestId("muse-work-rank");
  await expect(rank).toBeVisible();
  await expect(rank).toHaveText(/^(✨ Muse ranked \d+ of \d+ and explained why|Sorted offline by who's free)/);
  if ((await rank.getAttribute("data-by")) === "code") await expect(work).not.toContainText("✨");
  await expect(page.getByTestId("muse-work-read")).toContainText("under $15");
  await expect(page.getByTestId("muse-work-read")).toContainText("40 min");
  // The walk cap was never typed: a muted default, not part of what was read. Mock: no ✨ on it.
  await expect(page.getByTestId("muse-work-walk-default")).toHaveText(" · walks up to 25 min (default)");
  await expect(page.getByTestId("muse-work-read")).toHaveAttribute("data-by", "code");

  const ramen = page.getByTestId("ruled-out").filter({ hasText: "Ramen run" });
  await expect(ramen).toBeVisible();
  await expect(ramen).toHaveAttribute("data-reason", "walk");
  await expect(ramen).toContainText(/\d+ min walk, over your 25/);
  const sushi = page.getByTestId("ruled-out").filter({ hasText: "Conveyor sushi lunch" });
  await expect(sushi).toBeVisible();
  await expect(sushi).toHaveAttribute("data-reason", "budget");
  await expect(sushi).toContainText("$26, over your $15");

  const pick = page.getByTestId("suggestion").first();
  await expect(pick).toContainText("Dumplings before the rush");
  const reason = pick.getByTestId("suggestion-reason");
  await expect(reason).toBeVisible();
  // Maya's bubble is paraphrased, not pasted; the overlap line would only repeat it.
  await expect(reason).toContainText("Maya's craving dumplings");
  await expect(reason).not.toContainText("·");
  await expect(reason).not.toContainText("status says");
  await expect(pick.getByTestId("suggestion-overlap")).toHaveCount(0);
  // No card's reason is the budget line alone.
  for (const r of await page.getByTestId("suggestion-reason").all()) await expect(r).not.toHaveText(/^(✨ Muse: )?Within your \$\d+ budget\.$/);
  // The summary does not repeat the top card.
  await expect(page.getByTestId("plan-summary")).not.toContainText("Dumplings before the rush");
  // Price is in the plan answer, so every card's meta row has it on first paint.
  for (const card of await page.getByTestId("suggestion").all()) await expect(card).toContainText(/Up to \$\d+|Free/);
  await expect(page.getByTestId("plan-sheet")).not.toContainText(/under your \$\d+ budget/);
  // no internal field names or JSON leak into the sheet
  await expect(page.getByTestId("plan-sheet")).not.toContainText(/budgetMax|maxWalkMinutes|windowEnd|questId|[{}]/);

  await page.screenshot({ path: `${SHOTS}/plan-${phone ? 390 : 1440}.png` });

  // The first pick's main action (Join, or "Go with Maya" when a friend is matched) stays on screen with the panel open.
  await expect(pick.getByRole("button", { name: /^(Join|Go with [A-Z]\w*|Invite [A-Z]\w*)$/ }).first()).toBeInViewport({ ratio: 1 });
  // What the pick says it is, no fact twice: Maya's "likely down" pill is on the card, so the
  // pre-check line waits behind "See all".
  await expect(page.getByTestId("precheck-line")).toHaveCount(0);

  // "N more" reveals exactly N more ruled-out rows, then the off-topic count.
  const more = page.getByTestId("muse-work-more");
  const before = await page.getByTestId("ruled-out").count();
  const label = (await more.textContent()) ?? "";
  await more.click();
  const n = /(\d+) more/.exec(label);
  await expect(page.getByTestId("ruled-out")).toHaveCount(before + (n ? Number(n[1]) : 0));
  await expect(page.getByTestId("muse-work-details")).toContainText(/weren't what you asked for/);
  await page.screenshot({ path: `${SHOTS}/plan-more-${phone ? 390 : 1440}.png` });
});

test("Muse filter: the why stays clear of the map", async ({ page }, info) => {
  const phone = info.project.name === "phone";
  if (phone) await page.setViewportSize({ width: 390, height: 844 });
  mkdirSync(SHOTS, { recursive: true });
  await page.goto("/out-here?as=alex");
  await page.getByTestId("muse-filter-toggle").click();
  await expect(page.getByTestId("muse-filter-status")).toContainText(/Muse is showing \d+ of \d+ plans/, { timeout: 15_000 });
  const line = page.getByTestId("muse-filter-why-line");
  if (phone) {
    // Phones keep one pill row under the toggles; "Why these?" opens the reasons.
    await expect(line).toBeHidden();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOTS}/filter-390.png` });
    await page.getByTestId("muse-filter-why").click();
    await expect(page.getByTestId("muse-filter-reasons")).toBeVisible();
    return;
  }
  await expect(line).toBeVisible();
  await expect(line).toHaveText(/\w{3,}/);
  // Let the fitBounds animation (600 ms) finish, then check no pin sits under the pills.
  await page.waitForTimeout(1_000);
  const lb = (await line.boundingBox())!;
  const tops = await page.locator('[data-map-marker="quest"]').evaluateAll((els) =>
    els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => e.getBoundingClientRect()));
  for (const r of tops) {
    const overlapsX = r.right > lb.x && r.left < lb.x + lb.width;
    if (overlapsX) expect(r.top).toBeGreaterThan(lb.y + lb.height);
  }
  await page.screenshot({ path: `${SHOTS}/filter-1440.png` });
  await line.click();
  await expect(page.getByTestId("muse-filter-reasons")).toBeVisible();
  await expect(line).toHaveCount(0);
});

test("after an ask: the reopened composer says free, and the Muse filter keeps only plans inside the free time", async ({ page }, info) => {
  const phone = info.project.name === "phone";
  if (phone) await page.setViewportSize({ width: 390, height: 844 });
  // A persona other tests do not ask as, so its free window is this test's own.
  await page.goto("/out-here?as=lena");
  await page.getByRole("button", { name: "I'm free" }).click();
  await page.locator("#imfree-text").fill("hungry, 40 min, under $15");
  await page.getByRole("button", { name: "Find a plan" }).click();
  await expect(page.getByTestId("plan-loading")).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByTestId("picked-summary")).toContainText(/Free till \d{1,2}:\d{2} [AP]M/, { timeout: 15_000 });
  await page.getByTestId("picked-summary").getByRole("button", { name: "Change" }).click();
  await expect(page.getByTestId("status-row")).toHaveAttribute("data-status", "free");
  await expect(page.getByTestId("status-row")).toContainText(/Free till \d{1,2}:\d{2} [AP]M/);

  await page.reload();
  await page.getByTestId("muse-filter-toggle").click();
  const status = page.getByTestId("muse-filter-status");
  await expect(status).not.toContainText("filtering", { timeout: 15_000 });
  // The both-free card never covers the pins Muse kept.
  await expect(page.getByTestId("both-free")).toHaveCount(0);
  if (!(await page.getByTestId("muse-filter-why").count())) {
    await expect(status).toContainText(/Nothing fits before \d{1,2}:\d{2} [AP]M/);
    return;
  }
  await page.getByTestId("muse-filter-why").first().click();
  const items = page.getByTestId("muse-filter-reason-item");
  await expect(items.first()).toBeVisible();
  for (const r of await items.allInnerTexts()) expect(r).toMatch(/(starts in [\d.]+ (min|h)|happening now), inside your free time/);
});

test("the 15 min time picker narrows the picks to boba, and the work panel reads it", async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true });
  await page.goto("/out-here?as=alex");
  await page.getByRole("button", { name: "I'm free" }).click();
  const box = page.locator("#imfree-text");
  await box.fill("hungry, 40 min, under $15");
  await page.getByRole("button", { name: "Find a plan" }).click();
  await expect(page.getByTestId("suggestion").first()).toContainText("Dumplings before the rush", { timeout: 15_000 });
  // After an ask the composer folds into one line; "Change" opens the pickers again.
  await page.getByTestId("picked-summary").getByRole("button", { name: "Change" }).click();
  await page.getByRole("button", { name: "15 min", exact: true }).click();
  await box.fill("hungry, under $15");
  await page.getByRole("button", { name: "Find a plan" }).click();
  await expect(page.getByTestId("muse-work-read")).toContainText("15 min", { timeout: 15_000 });
  await expect(page.getByTestId("suggestion")).toHaveCount(1);
  await expect(page.getByTestId("suggestion").first()).toContainText(/boba/i);
  await page.screenshot({ path: `${SHOTS}/time15-${page.viewportSize()!.width}.png` });
});

test("a shorter ask explains the pick that dropped out first, and the map strip keeps its tiles", async ({ page }, info) => {
  const phone = info.project.name === "phone";
  if (phone) await page.setViewportSize({ width: 390, height: 844 });
  mkdirSync(SHOTS, { recursive: true });
  await page.goto("/out-here?as=alex");
  await page.getByRole("button", { name: "I'm free" }).click();
  const box = page.locator("#imfree-text");
  await box.fill("hungry, 40 min, under $15");
  await page.getByRole("button", { name: "Find a plan" }).click();
  await expect(page.getByTestId("suggestion").first()).toContainText("Dumplings before the rush", { timeout: 15_000 });
  // The composer folded after the ask: tapping what was asked opens it again, focused.
  await page.getByTestId("picked-ask").click();
  await expect(box).toBeFocused();
  await box.fill("hungry, 15 min, under $15");
  await page.getByRole("button", { name: "Find a plan" }).click();
  await expect(page.getByTestId("muse-work-read")).toContainText("15 min", { timeout: 15_000 });
  // The dumplings were the top pick a moment ago: their row is first, shown without a tap, and
  // it names the time. (Whether boba still fits 15 min depends on the clock, so it is not checked.)
  const rows = page.getByTestId("ruled-out");
  await expect(rows.first()).toContainText("Dumplings before the rush");
  await expect(rows.first()).toHaveAttribute("data-reason", /^(window|late)$/);
  await expect(rows.first()).toContainText(/starts \d+:\d\d [AP]M/);
  await page.waitForTimeout(2_000);
  await page.screenshot({ path: `${SHOTS}/short-ask-${phone ? 390 : 1440}.png` });
  // The strip above the sheet shows map detail, not a flat background: count distinct colors.
  const strip = await page.screenshot({ clip: { x: 0, y: 120, width: phone ? 390 : 1000, height: 120 } });
  const colors = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const set = new Set<number>();
    for (let i = 0; i < d.length; i += 4) set.add(((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3));
    return set.size;
  }, strip.toString("base64"));
  expect(colors).toBeGreaterThan(60);
});

test("live mode credits Muse for reading the words, and keeps the default walk cap apart", async ({ page }, info) => {
  const phone = info.project.name === "phone";
  if (phone) await page.setViewportSize({ width: 390, height: 844 });
  mkdirSync(SHOTS, { recursive: true });
  // Present the mock answer as a live one: Ember parsed the words, Spark ranked.
  await page.route("**/api/muse/plan", async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    body.meta = { ...body.meta, mode: "live", source: "muse", models: { parse: "muse-ember-1.0", rank: "muse-spark-1.0" } };
    body.summary = String(body.summary).replace(/^\[mock\]\s*/, "");
    await route.fulfill({ response: res, json: body, headers: { ...res.headers(), "x-muse-mode": "live", "x-muse-source": "muse" } });
  });
  await page.goto("/out-here?as=alex");
  await page.getByRole("button", { name: "I'm free" }).click();
  await page.locator("#imfree-text").fill("hungry, got like 40 min, under $15");
  await page.getByRole("button", { name: "Find a plan" }).click();
  const read = page.getByTestId("muse-work-read");
  await expect(read).toHaveAttribute("data-by", "muse", { timeout: 15_000 });
  await expect(read).toContainText(/^✨ Muse read: food · 40 min · under \$15/);
  await expect(page.getByTestId("muse-work-walk-default")).toContainText("walks up to 25 min (default)");
  // The plan answers before the map has drawn: wait for the tiles and the picks' camera move.
  await expect(page.locator('[data-tiles="ready"]')).toHaveCount(1, { timeout: 15_000 });
  await page.waitForTimeout(2_000);
  await page.screenshot({ path: `${SHOTS}/live-${phone ? 390 : 1440}.png` });
});
