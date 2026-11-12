import { expect, test } from "@playwright/test";

// Avatar looks: edit your own on your profile. Looks are for the 3D third-person view only; the
// 2D map and Memories keep profile photos.
test.describe("Avatar looks", () => {
  test("alex edits his avatar on his profile", async ({ page }) => {
    await page.goto("/profile/alex?as=alex");
    await expect(page.getByTestId("avatar-card")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("edit-avatar").click();
    await page.getByTestId("avatar-hair-pink").click();
    await expect(page.getByTestId("avatar-hair-pink")).toHaveAttribute("aria-checked", "true");
    await page.getByTestId("avatar-save").click();
    await expect(page.getByTestId("avatar-customizer")).toHaveCount(0);
    const saved = await page.evaluate(() => Object.entries(localStorage).find(([k]) => k.startsWith("outhere.avatar."))?.[1] ?? "");
    expect(JSON.parse(saved)).toMatchObject({ hair: "pink" });
  });

  test("the 2D Friends map and Memories show profile photos, not avatar looks", async ({ page }) => {
    await page.goto("/memories?as=alex&view=list");
    await expect(page.getByTestId("crew-card").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("look-avatar")).toHaveCount(0);
    await page.goto("/out-here?as=maya&mode=friends");
    await expect(page.getByTestId("map-mode-friends")).toHaveAttribute("aria-pressed", "true", { timeout: 15_000 });
    await expect(page.getByTestId("look-avatar")).toHaveCount(0);
  });
});
