import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";

// Issue #12: a judge sees what Muse did without tapping anything. Alex asks "hungry, 40 min,
// under $15"; the sheet shows what Muse read, how many plans and friends it checked, the
// ramen (too far) and sushi (over budget) it ruled out with numbers, and the dumpling pick
// with its why, all with no click after "Find a plan".
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
  await expect(page.getByTestId("muse-work-checked")).toHaveText(/^✨ Muse checked \d+ plans and \d+ friends · \d+ fit$/);
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
  // no internal field names or JSON leak into the sheet
  await expect(page.getByTestId("plan-sheet")).not.toContainText(/budgetMax|maxWalkMinutes|windowEnd|questId|[{}]/);

  await page.screenshot({ path: `${SHOTS}/plan-${phone ? 390 : 1440}.png` });

  // The first pick's Join / Invite buttons stay on screen with the panel open.
  await expect(pick.getByRole("button", { name: /^(Join|Invite [A-Z]\w*)$/ }).first()).toBeInViewport({ ratio: 1 });

  // The rest opens on "more": the off-topic count and how the picks were ranked.
  await page.getByTestId("muse-work-more").click();
  await expect(page.getByTestId("muse-work-details")).toContainText(/weren't what you asked for/);
  await expect(page.getByTestId("muse-work-details")).toContainText(/Ranked offline \(mock\)|Muse ranked \d+ of \d+/);
  await page.screenshot({ path: `${SHOTS}/plan-more-${phone ? 390 : 1440}.png` });
});

test("Muse filter: a one-line why shows while the filter is on", async ({ page }, info) => {
  const phone = info.project.name === "phone";
  if (phone) await page.setViewportSize({ width: 390, height: 844 });
  mkdirSync(SHOTS, { recursive: true });
  await page.goto("/out-here?as=alex");
  await page.getByTestId("muse-filter-toggle").click();
  await expect(page.getByTestId("muse-filter-status")).toContainText(/Muse is showing \d+ of \d+ plans/, { timeout: 15_000 });
  const line = page.getByTestId("muse-filter-why-line");
  await expect(line).toBeVisible();
  await expect(line).toHaveText(/\w{3,}/);
  await page.screenshot({ path: `${SHOTS}/filter-${phone ? 390 : 1440}.png` });
  await line.click();
  await expect(page.getByTestId("muse-filter-reasons")).toBeVisible();
  await expect(line).toHaveCount(0);
});
