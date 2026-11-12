import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";

// Issue #12: a judge sees what Muse did without tapping anything. Alex asks "hungry, 40 min,
// under $15"; the sheet shows what was read, how many plans and friends were checked, the
// ramen (too far) and sushi (over budget) ruled out with numbers, and the dumpling pick
// with its why, all with no click after "Find a plan". Code counts and filters, so only the
// rank line may carry ✨ Muse, and only when the live model ranked.
const PLACEHOLDER = "hungry, got like 40 min, under $15";
const SHOTS = ".verify/muse-visible";

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
  await page.getByPlaceholder(PLACEHOLDER).fill("hungry, 40 min, under $15");
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
  await expect(page.getByTestId("muse-work-read")).toContainText("up to 25 min walk");

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
  await expect(pick.getByTestId("suggestion-reason")).toBeVisible();
  await expect(pick.getByTestId("suggestion-overlap")).toContainText("Maya");
  // Price is in the plan answer, so every card's meta row has it on first paint.
  for (const card of await page.getByTestId("suggestion").all()) await expect(card).toContainText(/Up to \$\d+|Free/);
  await expect(page.getByTestId("plan-sheet")).not.toContainText(/under your \$\d+ budget/);
  // no internal field names or JSON leak into the sheet
  await expect(page.getByTestId("plan-sheet")).not.toContainText(/budgetMax|maxWalkMinutes|windowEnd|questId|[{}]/);

  await page.screenshot({ path: `${SHOTS}/plan-${phone ? 390 : 1440}.png` });

  // The first pick's Join / Invite buttons stay on screen with the panel open.
  await expect(pick.getByRole("button", { name: /^(Join|Invite [A-Z]\w*)$/ }).first()).toBeInViewport({ ratio: 1 });

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

test("a time chip replaces the time in the ask, and 15 min narrows to boba", async ({ page }, info) => {
  const phone = info.project.name === "phone";
  test.skip(phone, "phones hide the chips while picks show; the chip text logic is unit-tested");
  mkdirSync(SHOTS, { recursive: true });
  await page.goto("/out-here?as=alex");
  await page.getByRole("button", { name: "I'm free" }).click();
  const box = page.getByPlaceholder(PLACEHOLDER);
  await box.fill("hungry, 40 min, under $15");
  await page.getByRole("button", { name: "Find a plan" }).click();
  await expect(page.getByTestId("suggestion").first()).toContainText("Dumplings before the rush", { timeout: 15_000 });
  await page.getByRole("button", { name: "15 min", exact: true }).click();
  await expect(box).toHaveValue("hungry, 15 min, under $15");
  await page.getByRole("button", { name: "Find a plan" }).click();
  await expect(page.getByTestId("muse-work-read")).toContainText("15 min", { timeout: 15_000 });
  await expect(page.getByTestId("suggestion")).toHaveCount(1);
  await expect(page.getByTestId("suggestion").first()).toContainText(/boba/i);
  await page.screenshot({ path: `${SHOTS}/chip15-1440.png` });
});
