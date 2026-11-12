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
    await page.getByPlaceholder(PLACEHOLDER).fill(PLACEHOLDER);
    await page.getByRole("button", { name: "Find a plan" }).click();
    await expect(page.getByTestId("plan-summary")).toBeVisible({ timeout: 15_000 });

    await expect(dumplings.getByTestId("muse-pick")).toHaveText("✨ Muse pick");
    await expect(dumplings).toHaveAttribute("aria-label", /^Muse pick: /);
    const dimmed = page.locator("[data-dimmed]");
    expect(await dimmed.count()).toBeGreaterThan(0);
    await expect(dimmed.first().locator('[data-map-marker=quest]')).toHaveCSS("opacity", "0.4");
    // a dimmed pin is not a pick
    await expect(dimmed.first().getByTestId("muse-pick")).toHaveCount(0);

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
