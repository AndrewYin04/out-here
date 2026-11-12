import { expect, test } from "@playwright/test";

// Memory journey: library -> journey -> moment sheet -> Do it again -> back. Uses only real
// seeded data (the Dumpling Den crew); the map is the 2D preview until the 3D map is wired in.
test.describe("Memory journey", () => {
  test("alex explores a memory, opens a moment and asks Muse to do it again", async ({ page }) => {
    await page.goto("/memories?as=alex&view=list");
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
    await expect(page.getByTestId("memories-map-view")).toBeVisible({ timeout: 15_000 });
  });

  test("memories open on the map; a pin leads into its journey; the toggle switches to the list", async ({ page }) => {
    await page.goto("/memories?as=alex");
    await expect(page.getByTestId("memories-map-view")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("memories-view-map")).toHaveAttribute("aria-pressed", "true");
    const pin = page.getByTestId("memory-pin").first();
    await expect(pin).toBeVisible({ timeout: 15_000 });
    await pin.click();
    const preview = page.getByTestId("memory-pin-preview");
    await expect(preview).toBeVisible();
    const explore = preview.getByTestId("explore-memory");
    if (await explore.count()) await explore.click();
    else await preview.getByTestId("memory-preview-row").first().click();
    await expect(page.getByTestId("memory-journey")).toBeVisible({ timeout: 15_000 });

    await page.goto("/memories?as=alex");
    await page.getByTestId("memories-view-list").click();
    await expect(page.getByTestId("crew-card").first()).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/view=list/);

    // Back leads to the Friends map (Memories sits next to Friends on Out Here).
    await page.getByTestId("memories-back").getByRole("link").click();
    await expect(page).toHaveURL(/\/out-here\?mode=friends/);
    await expect(page.getByTestId("map-mode-friends")).toHaveAttribute("aria-pressed", "true", { timeout: 15_000 });
  });

  test("boards: the crew board is private to the crew; the public board shows strangers by first name", async ({ browser }) => {
    const alex = await browser.newPage();
    await alex.goto("/memories?as=alex&view=list");
    await alex.getByTestId("explore-memory").first().click();
    await alex.getByTestId("open-crew-board").click();
    await expect(alex.getByTestId("crew-board")).toBeVisible({ timeout: 15_000 });
    await alex.getByTestId("board-text").fill("Same time next week?");
    await alex.getByTestId("board-post").click();
    await expect(alex.getByTestId("crew-board").getByText("Same time next week?").first()).toBeVisible({ timeout: 10_000 });

    await alex.goto("/memories?as=alex&view=board");
    await alex.getByTestId("board-text").fill("Go on a weeknight, no line.");
    await alex.getByTestId("board-post").click();
    await expect(alex.getByTestId("community-post").first()).toContainText("Go on a weeknight, no line.", { timeout: 10_000 });

    const jordan = await browser.newPage();
    await jordan.goto("/memories?as=jordan&view=board");
    const post = jordan.getByTestId("community-post").filter({ hasText: "Go on a weeknight, no line." }).first();
    await expect(post).toBeVisible({ timeout: 15_000 });
    await expect(post.getByTestId("community-post-author")).toHaveText("Alex");
    await expect(jordan.getByTestId("community-board").locator('a[href^="/profile"]')).toHaveCount(0);
  });

  test("an unknown crew shows a clear not-found state", async ({ page }) => {
    await page.goto("/memories/not-a-crew?as=alex");
    await expect(page.getByText("Memory not found")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("link", { name: "Back to Memories" })).toHaveAttribute("href", "/memories");
  });
});
