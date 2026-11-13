import path from "node:path";
import { expect, test } from "@playwright/test";

// Daily Side Quests: the two-persona demo, end to end. Uses the demo controls (enabled in
// development) and the file-upload path, so it needs no camera. Run in MemoryStore mode.
const PHOTO = path.join(process.cwd(), "public/seed/posts/p006.webp");

test.describe("Daily Side Quest", () => {
  test("alex and maya complete the same quest and see each other on the board", async ({ browser }) => {
    const ctx = await browser.newContext();

    const alex = await ctx.newPage();
    await alex.goto("/side-quest?as=alex");
    await expect(alex.getByTestId("sq-demo")).toBeVisible({ timeout: 20_000 });
    await alex.getByTestId("sq-demo-trigger").click();
    await expect(alex.getByTestId("sq-active")).toBeVisible();
    const title = await alex.getByTestId("sq-title").textContent();
    await expect(alex.getByTestId("countdown").first()).toHaveAttribute("data-ms", /^\d+$/);

    await alex.getByTestId("sq-demo-seed").click();
    await expect(alex.getByTestId("sq-board-locked")).toBeVisible(); // count only until you enter

    await alex.getByTestId("sq-take-photo").click();
    await alex.locator("input[type=file]").setInputFiles(PHOTO);
    await expect(alex.getByTestId("audience-only_me")).toHaveAttribute("aria-checked", "true"); // private by default
    await alex.getByTestId("audience-community").click();
    await alex.getByTestId("submit-photo").click();
    await expect(alex.getByTestId("sq-celebration")).toBeVisible({ timeout: 20_000 });
    await alex.getByTestId("see-board").click();
    await expect(alex.getByTestId("sq-board-grid")).toBeVisible();
    await expect(alex.getByTestId("sq-board-entry")).toHaveCount(6); // alex + 5 fictional

    await alex.reload(); // a refresh keeps the completed state
    await expect(alex.getByTestId("sq-completed")).toBeVisible({ timeout: 20_000 });

    const maya = await ctx.newPage();
    await maya.goto("/side-quest?as=maya");
    await maya.getByTestId("sq-demo-trigger").click();
    await expect(maya.getByTestId("sq-title")).toHaveText(title ?? "");
    await maya.getByTestId("sq-take-photo").click();
    await maya.locator("input[type=file]").setInputFiles(PHOTO);
    await maya.getByTestId("audience-community").click();
    await maya.getByTestId("submit-photo").click();
    await expect(maya.getByTestId("sq-celebration")).toBeVisible({ timeout: 20_000 });
    await maya.getByTestId("see-board").click();
    await expect(maya.getByTestId("sq-board-entry")).toHaveCount(7);

    const memories = await ctx.newPage();
    await memories.goto("/memories?as=alex");
    await expect(memories.getByTestId("sq-memories")).toBeVisible({ timeout: 20_000 });

    await alex.getByTestId("sq-demo-reset").click();
    await expect(alex.getByTestId("sq-completed")).toHaveCount(0);
  });

  test("a private entry is never readable by another persona", async ({ request }) => {
    await request.post("/api/daily/side-quest/demo", { headers: { "x-persona": "alex" }, data: { action: "trigger", deadlineSeconds: 300 } });
    const submit = await request.post("/api/daily/side-quest/submit", {
      headers: { "x-persona": "alex" },
      multipart: { photo: { name: "a.webp", mimeType: "image/webp", buffer: Buffer.alloc(400, 7) }, audience: "only_me" },
    });
    expect(submit.status()).toBe(200);
    const { entry } = await submit.json();
    const date = entry.date as string;
    const alexId = new URL(entry.photoUrl, "http://x").searchParams.get("userId")!;
    expect((await request.get(`/api/daily/photo?date=${date}&userId=${alexId}`, { headers: { "x-persona": "alex" } })).status()).toBe(200);
    expect((await request.get(`/api/daily/photo?date=${date}&userId=${alexId}`, { headers: { "x-persona": "maya" } })).status()).toBe(404);
    const board = await (await request.get("/api/daily/side-quest/board", { headers: { "x-persona": "maya" } })).json();
    expect(JSON.stringify(board)).not.toContain(alexId);
    await request.post("/api/daily/side-quest/demo", { headers: { "x-persona": "alex" }, data: { action: "reset" } });
  });
});
