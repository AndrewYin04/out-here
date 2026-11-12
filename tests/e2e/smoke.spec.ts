import { expect, test } from "@playwright/test";

test("home page renders", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle(/Out Here/);
  await expect(page.getByRole("heading", { name: "Out Here" })).toBeVisible();
});
