import { expect, test } from "@playwright/test";

// Muse picks on the map: after a plan, the picked pins get the "Muse pick" tag and the others
// dim; closing the plan restores every pin. Also the ?mode= deep link for the toggle.
const PLACEHOLDER = "hungry, got like 40 min, under $15";

test.describe("Muse picks on the map", () => {
  test("a plan highlights the dumpling pin and dims the rest; closing restores them", async ({ page }) => {
    await page.goto("/out-here?as=alex");
    const dumplings = page.getByTestId("quest-pin-dumplings");
    await expect(dumplings).toBeAttached({ timeout: 15_000 });
    await expect(page.getByTestId("muse-pick")).toHaveCount(0);
    await expect(page.locator("[data-dimmed]")).toHaveCount(0);

    await page.getByRole("button", { name: "I'm free" }).click();
    await page.locator("#imfree-text").fill(PLACEHOLDER);
    await page.getByRole("button", { name: "Find a plan" }).click();
    await expect(page.getByTestId("plan-summary")).toBeVisible({ timeout: 15_000 });

    // ✨ only when the live model ranked; mock and fallback plans say "Top pick".
    const mock = process.env.MUSE_MOCK === "1";
    await expect(dumplings.getByTestId("muse-pick")).toHaveText(mock ? "Top pick" : /^(✨ Muse pick|Top pick)$/);
    await expect(dumplings).toHaveAttribute("aria-label", mock ? /^Top pick: / : /^(Muse|Top) pick: /);
    // two tags never overlap (dumplings and boba sit about 45 px apart at 390 px)
    await page.waitForTimeout(900);
    const tagBoxes = (await Promise.all((await page.getByTestId("muse-pick").all()).map((t) => t.boundingBox()))).filter((b) => b !== null);
    for (let i = 0; i < tagBoxes.length; i++) for (let j = i + 1; j < tagBoxes.length; j++) {
      const a = tagBoxes[i]!, b = tagBoxes[j]!;
      const hit = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      expect(hit, "two Muse pick tags overlap").toBe(false);
    }
    const dimmed = page.locator("[data-dimmed]");
    expect(await dimmed.count()).toBeGreaterThan(0);
    await expect(dimmed.first().locator('[data-map-marker=quest]')).toHaveCSS("opacity", "0.4");
    // a dimmed pin is not a pick
    await expect(dimmed.first().getByTestId("muse-pick")).toHaveCount(0);

    // no reason line repeats the card's meta row ("4 min walk, $7, starts in 9 min")
    for (const r of await page.getByTestId("suggestion-reason").allTextContents()) {
      expect(r).not.toMatch(/min walk|starts in/);
    }
    // every pick and its pill sit fully above the plan sheet, after the fit animation
    await page.waitForTimeout(900);
    const sheet = await page.getByTestId("plan-sheet").boundingBox();
    for (const pill of await page.getByTestId("muse-pick").all()) {
      const box = await pill.boundingBox();
      if (!box || !sheet) continue;
      if ((page.viewportSize()?.width ?? 1440) < 768) expect(box.y + box.height + 40).toBeLessThanOrEqual(sheet.y);
    }
    await page.screenshot({ path: test.info().outputPath("plan.png") });

    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByTestId("muse-pick")).toHaveCount(0);
    await expect(page.locator("[data-dimmed]")).toHaveCount(0);
  });

  test("?mode=friends opens the Friends view; ?mode=explore opens Explore", async ({ page }) => {
    await page.goto("/out-here?as=alex&mode=friends");
    await expect(page.getByTestId("out-here-map")).toHaveAttribute("data-mode", "friends");
    await expect(page.getByTestId("map-mode-friends")).toHaveAttribute("aria-pressed", "true");
    await page.goto("/out-here?as=alex&mode=explore");
    await expect(page.getByTestId("out-here-map")).toHaveAttribute("data-mode", "explore");
    await expect(page.getByTestId("map-mode-explore")).toHaveAttribute("aria-pressed", "true");
  });
});
