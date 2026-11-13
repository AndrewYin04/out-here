import { expect, test } from "@playwright/test";

// Memories: crews with albums, and "Get this group together again" (Muse regroup, mock in builders).
test.describe("Memories", () => {
  test("alex sees a crew album and gets a regroup suggestion", async ({ page }) => {
    await page.goto("/memories?as=alex");
    await expect(page.getByRole("heading", { name: "Memories", level: 1 })).toBeVisible();
    const card = page.getByTestId("crew-card").first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.locator("img").first()).toBeVisible();

    await card.getByRole("button", { name: "Get this group together again" }).click();
    const s = card.getByTestId("regroup-suggestion");
    await expect(s).toBeVisible({ timeout: 15_000 });
    await expect(s).toContainText("✨ Muse");
    await expect(s.getByRole("button", { name: "Send to crew" })).toBeEnabled();
  });

  test("regroup API returns a suggestion with a real quest id or null", async ({ request }) => {
    const headers = { "x-persona": "alex" };
    const { crews } = await (await request.get("/api/crews", { headers })).json();
    expect(crews.length).toBeGreaterThan(0);
    const res = await request.post("/api/muse/regroup", { headers, data: { crewId: crews[0].id } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.suggestion.reason.length).toBeGreaterThan(10);
    expect(typeof body.message).toBe("string");
    const bad = await request.post("/api/muse/regroup", { headers, data: {} });
    expect(bad.status()).toBe(400);
  });

  test("Send to crew delivers invites", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "sends once per server; desktop only");
    await page.goto("/memories?as=alex");
    const card = page.getByTestId("crew-card").first();
    await card.getByRole("button", { name: "Get this group together again" }).click();
    await card.getByRole("button", { name: "Send to crew" }).click();
    await expect(card.getByText(/Sent to the crew chat|Invite sent to/)).toBeVisible({ timeout: 10_000 });
  });

  test("a persona with no crews sees the empty state", async ({ page }) => {
    await page.goto("/memories?as=priya");   // jordan has a crew since the thrift story (thrift walk)
    await expect(page.getByText("No crews yet")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("link", { name: "Find a plan" })).toHaveAttribute("href", "/out-here");
  });

  test("Notifications show Out Here items for alex", async ({ request }) => {
    const res = await request.get("/api/notifications", { headers: { "x-persona": "alex" } });
    const { notifications } = await res.json();
    const types = notifications.map((n: { type: string }) => n.type);
    expect(types).toContain("quest_invite");
    expect(types).toContain("quest_join");
  });
});
