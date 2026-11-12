import { expect, test } from "@playwright/test";

// Avatar looks: edit your own on your profile; friends see looks on the Friends map and in Memories.
test.describe("Avatar looks", () => {
  test("alex edits his avatar; the look shows on his profile and on maya's Friends map", async ({ browser }) => {
    const ctx = await browser.newContext(); // one browser: looks are saved locally (demo)
    const alex = await ctx.newPage();
    await alex.goto("/profile/alex?as=alex");
    await expect(alex.getByTestId("avatar-card")).toBeVisible({ timeout: 15_000 });
    await alex.getByTestId("edit-avatar").click();
    await alex.getByTestId("avatar-hair-pink").click();
    await expect(alex.getByTestId("avatar-hair-pink")).toHaveAttribute("aria-checked", "true");
    await alex.getByTestId("avatar-save").click();
    await expect(alex.getByTestId("avatar-customizer")).toHaveCount(0);
    const saved = await alex.evaluate(() => Object.entries(localStorage).find(([k]) => k.startsWith("outhere.avatar."))?.[1] ?? "");
    expect(JSON.parse(saved)).toMatchObject({ hair: "pink" });

    const maya = await ctx.newPage();
    await maya.goto("/out-here?as=maya&mode=friends");
    await expect(maya.locator('[data-testid="look-avatar"][data-look-ready="true"]').first()).toBeVisible({ timeout: 20_000 });
  });

  test("crew faces in Memories are avatar looks", async ({ page }) => {
    await page.goto("/memories?as=alex&view=list");
    const card = page.getByTestId("crew-card").first();
    await expect(card.getByTestId("look-avatar").first()).toBeVisible({ timeout: 15_000 });
  });
});
