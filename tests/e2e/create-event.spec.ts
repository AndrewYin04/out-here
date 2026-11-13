import { expect, test, type Page } from "@playwright/test";

// Event creation in Out Here: drop a pin, let Muse draft it from one line, pick who sees it,
// add a pop-up, post. Sam posts a Group plan for "Peninsula Board Game Night" (Sam and Nina are
// members; Alex and Maya are not), so the other specs' maps (Alex) never see these plans.
// The two-persona flow runs in the desktop project only; the phone project checks the sheet.

async function openMap(page: Page, persona: string) {
  await page.goto(`/out-here?as=${persona}&mode=explore`);
  await expect(page.getByTestId("out-here-map")).toBeVisible();
  await expect(page.getByTestId("map-canvas")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-map-marker="quest"]').first()).toBeAttached({ timeout: 20_000 });
}

test.describe("Post a plan", () => {
  test("＋ opens the create sheet; Close leaves it", async ({ page }) => {
    await page.goto(`/out-here?as=jordan&view=3d`);
    await expect(page.getByTestId("map-canvas")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("map-mode-explore").click();
    await page.getByTestId("create-plan-btn").click();
    await expect(page.getByTestId("create-plan-sheet")).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByTestId("create-plan-sheet")).toHaveCount(0);
  });

  test("＋ opens the sheet with a draft pin, and Muse fills it in", async ({ page }) => {
    await openMap(page, "jordan");
    await page.getByTestId("map-mode-explore").click();
    await page.getByTestId("create-plan-btn").click();
    const sheet = page.getByTestId("create-plan-sheet");
    await expect(sheet).toBeVisible();
    await expect(page.getByTestId("draft-pin")).toBeVisible();
    // Step 1: What · When · Where. The title is the one line Muse fills the rest in from.
    await expect(page.getByTestId("create-next")).toHaveText(/Who's coming/);
    await expect(page.getByTestId("create-next")).toBeDisabled();
    await page.getByTestId("create-muse-input").fill("boba after class at 4");
    await page.getByTestId("create-muse-btn").click();
    await expect(page.getByTestId("create-muse-pitch")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("create-title")).not.toHaveValue("");
    await expect(page.getByTestId("draft-pin")).toHaveAttribute("data-category", "food");
    // Step 2: invite friends from the Free now row, then the cover step holds Post.
    await page.getByTestId("create-next").click();
    await page.locator('[data-testid^="create-invite-"]').first().click();
    await expect(page.getByTestId("create-invited-count")).toContainText("invited");
    await page.getByTestId("create-next-cover").click();
    await expect(page.getByTestId("create-post")).toHaveText("Post");
    await page.getByTestId("create-back").click();
    await page.getByTestId("create-back").click();

    await page.getByRole("button", { name: "Close" }).click();
    await expect(sheet).toHaveCount(0);
    await expect(page.getByTestId("draft-pin")).toHaveCount(0);
  });

  test("a Group plan: members see it live, others never; plan page, posts and check-in", async ({ browser, isMobile }) => {
    test.skip(isMobile, "two-persona flow runs on desktop");
    const samCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const ninaCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const mayaCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const sam = await samCtx.newPage();
    const nina = await ninaCtx.newPage();
    const maya = await mayaCtx.newPage();
    try {
      await Promise.all([openMap(sam, "sam"), openMap(nina, "nina"), openMap(maya, "maya")]);
      const title = `Game night ${Date.now() % 100000}`;

      // Right-click (long-press on touch) drops the pin and opens the sheet.
      const canvas = sam.getByTestId("map-canvas");
      const box = (await canvas.boundingBox())!;
      await canvas.click({ button: "right", position: { x: box.width * 0.6, y: box.height * 0.5 } });
      await expect(sam.getByTestId("create-plan-sheet")).toBeVisible();
      await expect(sam.getByTestId("draft-pin")).toBeVisible();

      await sam.getByTestId("create-title").fill(title);
      await sam.getByTestId("create-venue").fill("Ravenswood Board Game Cafe");
      await sam.getByTestId("create-when-0").click();
      await sam.getByTestId("create-next").click();
      await sam.getByTestId('create-plan-sheet').getByText('Peninsula Board Game Night').click();
      await sam.getByTestId("create-next-cover").click();
      await sam.getByTestId("create-bubble").fill("Bringing Wingspan 🐦");
      await sam.getByTestId("create-post").click();

      await expect(sam.getByTestId("create-plan-sheet")).toHaveCount(0);
      const panel = sam.getByTestId("quest-sheet");
      await expect(panel).toContainText(title);
      await expect(panel.getByTestId("quest-visibility")).toContainText("Peninsula Board Game Night");
      await expect(panel.getByTestId("quest-bubble")).toHaveText("Bringing Wingspan 🐦");

      // Nina (a member) gets the pin without a reload; Maya (not a member) never does.
      await expect(nina.locator(`[data-map-marker="quest"][aria-label^="${title},"]`)).toHaveCount(1, { timeout: 10_000 });
      await maya.waitForTimeout(1500);
      await expect(maya.locator(`[data-map-marker="quest"][aria-label^="${title},"]`)).toHaveCount(0);

      // The plan page: live stats, guest list, posts, check-in.
      await panel.getByTestId("quest-open-page").click();
      await expect(sam.getByTestId("plan-page")).toBeVisible();
      const planUrl = sam.url();
      await expect(sam.getByTestId("quest-live")).toBeVisible();
      await expect(sam.getByTestId("quest-here")).toHaveText("0 here");
      await sam.getByTestId("plan-checkin").click();
      await sam.getByTestId("plan-demo-checkin").click();
      await expect(sam.getByTestId("quest-here")).toHaveText("1 here");
      await expect(sam.getByTestId("plan-checked-in")).toBeVisible();

      await sam.getByTestId("plan-composer").fill("Table by the window");
      await sam.getByTestId("plan-composer-post").click();
      await expect(sam.getByTestId("plan-posts")).toContainText("Table by the window");

      // Nina opens the page, joins, and sees Sam's post; Maya gets "not available".
      await nina.goto(`${new URL(planUrl).pathname}?as=nina`);
      await expect(nina.getByTestId("plan-posts")).toContainText("Table by the window");
      await nina.getByTestId("plan-join").click();
      await expect(nina.getByTestId("quest-stats")).toContainText("2 going");
      await expect(sam.getByTestId("quest-stats")).toContainText("2 going", { timeout: 10_000 });

      await maya.goto(`${new URL(planUrl).pathname}?as=maya`);
      await expect(maya.getByText("This plan isn't available")).toBeVisible();
    } finally {
      await Promise.all([samCtx.close(), ninaCtx.close(), mayaCtx.close()]);
    }
  });
});
