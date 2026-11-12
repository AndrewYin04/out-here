import { expect, test, type Page } from "@playwright/test";

// Out Here core loop: "I'm free" -> Muse plan -> invite -> friend accepts -> seats drop live.
// The MemoryStore keeps state for the server's lifetime, so the two-persona flow (which fills
// the dumpling quest) runs only in the desktop project; the phone project checks the composer,
// the time-fit rules and "Why not others?", which do not depend on that quest's seats.
const PLACEHOLDER = "hungry, got like 40 min, under $15";
const DUMPLINGS = "Dumplings before the rush";

async function openSheet(page: Page, persona: string) {
  await page.goto(`/out-here?as=${persona}`);
  await page.getByRole("button", { name: "I'm free" }).click();
  await expect(page.getByTestId("plan-sheet")).toBeVisible();
}

async function ask(page: Page, text: string) {
  const box = page.getByPlaceholder(PLACEHOLDER);
  await box.fill(text);
  await page.getByRole("button", { name: "Find a plan" }).click();
  await expect(page.getByTestId("plan-loading")).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByTestId("plan-summary").or(page.getByTestId("plan-error"))).toBeVisible();
}

test.describe("Out Here plan sheet", () => {
  test("composer, chips, 15-minute time-fit and why-not-others", async ({ page }) => {
    await openSheet(page, "alex");
    const box = page.getByPlaceholder(PLACEHOLDER);
    await expect(box).toBeFocused();
    await page.getByRole("button", { name: "15 min" }).click();
    await expect(box).toHaveValue("15 min");

    await ask(page, "hungry, 15 min");
    await expect(page.getByText(DUMPLINGS)).toHaveCount(0);
    const cards = page.getByTestId("suggestion");
    if ((await cards.count()) === 0) await expect(page.getByTestId("plan-empty")).toContainText("No plan fits 15 minutes right now");

    await ask(page, PLACEHOLDER);
    await page.getByRole("button", { name: "Why not others?" }).click();
    const why = page.getByTestId("why-not");
    await expect(why).toContainText(/\d+ min walk, too far/);
    await expect(why).toContainText("over your $15 budget");

    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByTestId("plan-sheet")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "I'm free" })).toBeVisible();
  });

  test("plan route: viewer from x-persona, 403 on a different userId, meta and headers", async ({ request }) => {
    const res = await request.post("/api/muse/plan", { data: { text: PLACEHOLDER }, headers: { "x-persona": "alex" } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.meta.contextSource).toBe("store");
    expect(Array.isArray(body.meta.dropped)).toBe(true);
    for (const d of body.meta.dropped) {
      expect(typeof d.questId).toBe("string");
      expect(typeof d.reason).toBe("string");
      expect(JSON.stringify(d)).not.toMatch(/"lat"|"lng"/);
    }
    expect(["live", "mock"]).toContain(res.headers()["x-muse-mode"]);
    expect(["muse", "fallback"]).toContain(res.headers()["x-muse-source"]);

    const spoof = await request.post("/api/muse/plan", { data: { text: PLACEHOLDER, userId: "maya" }, headers: { "x-persona": "alex" } });
    expect(spoof.status()).toBe(403);
    const same = await request.post("/api/muse/plan", { data: { text: PLACEHOLDER, userId: "alex" }, headers: { "x-persona": "alex" } });
    expect(same.status()).toBe(200);
    const none = await request.post("/api/muse/plan", { data: { text: PLACEHOLDER } });
    expect(none.status()).toBe(400);
  });

  test("alex invites maya to Dumpling Den, maya accepts, both see seats 2 -> 0", async ({ page, browser }, info) => {
    test.skip(info.project.name !== "desktop", "fills the dumpling quest; runs once per server");
    await openSheet(page, "alex");
    await ask(page, PLACEHOLDER);

    const top = page.getByTestId("suggestion").first();
    await expect(top).toContainText(DUMPLINGS);
    await expect(top).toContainText("Maya");
    await expect(top.getByTestId("seats-left")).toHaveText("2 left");
    await expect(page.getByTestId("muse-label").first()).toBeVisible();

    // maya is on Out Here in a second browser context
    const mayaCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const maya = await mayaCtx.newPage();
    await maya.goto("/out-here?as=maya");
    await expect(maya.getByRole("button", { name: "I'm free" })).toBeVisible();

    await top.getByRole("button", { name: "Invite Maya" }).click();
    const draft = top.getByTestId("invite-draft");
    await expect(draft).not.toHaveValue("");
    await draft.fill("Dumplings at Dumpling Den in 25? 2 seats left");
    await top.getByRole("button", { name: "Send invite" }).dblclick();
    await expect(top.getByRole("button", { name: "Invite sent to Maya" })).toBeVisible();

    // exactly one invite, even after a double-click
    const inv = await maya.request.get("/api/invites", { headers: { "x-persona": "maya" } });
    const incoming = (await inv.json()).incoming.filter((i: { suggestionTitle: string; status: string }) => i.suggestionTitle === DUMPLINGS && i.status === "pending");
    expect(incoming.length).toBe(1);

    const card = maya.getByTestId("invite-card");
    await expect(card).toContainText(`Alex invited you: 🥟 ${DUMPLINGS}`, { timeout: 5_000 });
    await expect(card.getByTestId("seats-left")).toHaveText("2 left");
    await card.getByRole("button", { name: "Accept" }).click();
    await expect(card.getByTestId("invite-result")).toContainText("You're in with Alex");
    await expect(card.getByTestId("seats-left")).toHaveText("Full", { timeout: 3_000 });
    await expect(top.getByTestId("seats-left")).toHaveText("Full", { timeout: 3_000 });
    await expect(top.getByRole("button", { name: "You're going" })).toBeVisible({ timeout: 3_000 });

    // the next plan for alex no longer offers it, from the live store
    const res = await page.request.post("/api/muse/plan", { data: { text: PLACEHOLDER }, headers: { "x-persona": "alex" } });
    const body = await res.json();
    expect(body.meta.contextSource).toBe("store");
    expect(body.suggestions.map((s: { title: string }) => s.title)).not.toContain(DUMPLINGS);

    // alex's availability was shared with friends
    const avail = await maya.request.get(`/api/friends/maya/availability`, { headers: { "x-persona": "maya" } });
    if (avail.ok()) {
      const items = (await avail.json()).items as { text: string }[];
      expect(items.some((i) => i.text === PLACEHOLDER)).toBe(true);
    }
    await mayaCtx.close();
  });
});
