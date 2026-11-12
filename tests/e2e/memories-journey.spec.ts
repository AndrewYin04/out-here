import { expect, test } from "@playwright/test";

// Memory journey: library -> journey -> moment sheet -> Do it again -> back. Uses only real
// seeded data (the Dumpling Den crew); the map is the 2D preview until the 3D map is wired in.
test.describe("Memory journey", () => {
  test("alex explores a memory, opens a moment and asks Muse to do it again", async ({ page }) => {
    await page.goto("/memories?as=alex");
    const card = page.getByTestId("crew-card").first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.getByTestId("explore-memory").click();

    const journey = page.getByTestId("memory-journey");
    await expect(journey).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("memory-map-preview")).toBeVisible();
    await expect(page.getByTestId("memory-timeline-item").first()).toHaveAttribute("aria-current", "true");

    const sheet = page.getByTestId("moment-sheet");
    await expect(sheet).toHaveAttribute("data-mode", "collapsed");
    await page.getByTestId("moment-sheet-toggle").click();
    await expect(sheet).toHaveAttribute("data-mode", "expanded");
    await expect(page.getByTestId("moment-photo").locator("img")).toBeVisible();

    await sheet.getByRole("button", { name: "Do it again" }).click();
    const s = sheet.getByTestId("regroup-suggestion");
    await expect(s).toBeVisible({ timeout: 15_000 });
    await expect(s).toContainText("✨ Muse");
    await expect(s.getByRole("button", { name: "Send to crew" })).toBeEnabled();

    await page.keyboard.press("Escape");
    await expect(sheet).toHaveAttribute("data-mode", "collapsed");
    await sheet.getByRole("button", { name: "Close details" }).click();
    await expect(sheet).toHaveCount(0);
    await page.getByTestId("memory-timeline-item").first().click();
    await expect(page.getByTestId("moment-sheet")).toBeVisible();

    await page.getByRole("link", { name: "Back to Memories" }).click();
    await expect(page.getByTestId("crew-card").first()).toBeVisible({ timeout: 15_000 });
  });

  test("an unknown crew shows a clear not-found state", async ({ page }) => {
    await page.goto("/memories/not-a-crew?as=alex");
    await expect(page.getByText("Memory not found")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("link", { name: "Back to Memories" })).toHaveAttribute("href", "/memories");
  });
});
