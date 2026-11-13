import { expect, test } from "@playwright/test";

// Daily Side Quests: the challenge arrives as a popup on the Out Here map at a random time, so
// these tests cover what is deterministic: the community board and your Side Quest photos in
// Memories, quiet hours, and the privacy rules of the API. The popup flow itself (camera, review,
// submit) is covered by the store tests and by manual verification (docs/DAILY_SIDE_QUESTS.md);
// the presenter button below drops a quest on demand in development.
test.describe("Daily Side Quest in Memories", () => {
  test("memories has a Side Quest section with the community board and your own photos", async ({ page }) => {
    await page.goto("/memories?as=alex");
    await expect(page.getByTestId("sq-section")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("sq-today")).toContainText(":");
    await expect(page.getByTestId("sq-board")).toBeVisible();
    await page.getByTestId("sq-tab-mine").click();
    await expect(page.getByTestId("sq-progress")).toBeVisible();
    await expect(page.getByTestId("sq-weeks")).toHaveText(/^\d+$/);
    await expect(page.getByTestId("sq-prefs")).toBeVisible();
  });

  test("quiet hours can be changed and need at least two hours", async ({ page }) => {
    await page.goto("/memories?as=maya#side-quest-mine");
    await expect(page.getByTestId("sq-prefs")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("sq-prefs-start").selectOption("540");
    await page.getByTestId("sq-prefs-end").selectOption("1260");
    await expect(page.getByTestId("sq-prefs-save")).toBeEnabled();
    await page.getByTestId("sq-prefs-end").selectOption("600");
    await expect(page.getByTestId("sq-prefs-save")).toBeDisabled();
  });

  test("the API serves the same challenge to everyone and keeps entries private", async ({ request }) => {
    const get = (who: string) => request.get("/api/daily/side-quest", { headers: { "x-persona": who } }).then((r) => r.json());
    const [a, m] = await Promise.all([get("alex"), get("maya")]);
    expect(a.challenge.id).toBe(m.challenge.id);
    expect(a.deadlineAt).toBe((await get("alex")).deadlineAt); // never rerolled
    // A photo nobody has submitted is a plain 404 for everyone.
    const res = await request.get(`/api/daily/photo?date=${a.date}&userId=${"00000000-0000-4000-8000-000000000000"}`, { headers: { "x-persona": "maya" } });
    expect(res.status()).toBe(404);
    // No board entries are visible to someone who has not entered.
    const board = await (await request.get("/api/daily/side-quest/board", { headers: { "x-persona": "maya" } })).json();
    expect(board.entries).toEqual([]);
  });

  test("the Drop a Side Quest button opens the popup on the map", async ({ page }) => {
    await page.goto("/out-here?as=alex");
    await expect(page.getByTestId("sq-drop")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("sq-drop").click();
    await expect(page.getByTestId("sq-reveal")).toBeVisible();
    await expect(page.getByTestId("countdown").first()).toHaveAttribute("data-ms", /^\d+$/);
    await page.getByTestId("sq-later").click();
    await expect(page.getByTestId("sq-pill")).toBeVisible();
  });
});
