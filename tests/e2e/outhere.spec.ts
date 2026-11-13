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

/** After an ask the composer folds into one line; "Change" opens it again. */
async function openComposer(page: Page) {
  const change = page.getByTestId("picked-summary").getByRole("button", { name: "Change" });
  if (await change.isVisible()) await change.click();
}

async function ask(page: Page, text: string) {
  await openComposer(page);
  const box = page.locator("#imfree-text");
  await box.fill(text);
  await page.getByRole("button", { name: "Find a plan" }).click();
  await expect(page.getByTestId("plan-loading")).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByTestId("plan-summary").or(page.getByTestId("plan-error"))).toBeVisible();
}

test.describe("Out Here plan sheet", () => {
  test("composer, chips, 15-minute time-fit and why-not-others", async ({ page }) => {
    await openSheet(page, "alex");
    const box = page.locator("#imfree-text");
    await expect(box).toBeFocused();
    // picking a time selects it (no text typed, nothing sent yet)
    const fifteen = page.getByTestId("free-composer").getByRole("button", { name: "15 min", exact: true });
    await fifteen.click();
    await expect(fifteen).toHaveAttribute("aria-pressed", "true");
    await expect(box).toHaveValue("");

    await ask(page, "hungry, 15 min");
    await expect(page.getByText(DUMPLINGS)).toHaveCount(0);
    const cards = page.getByTestId("suggestion");
    if ((await cards.count()) === 0) await expect(page.getByTestId("plan-empty")).toContainText("No plan fits 15 minutes right now");

    await ask(page, PLACEHOLDER);
    // the invite draft scrolls its Send button into view, also at 390 px
    // "Go with <friend>" is the main action; "Edit invite first" opens Muse's draft
    const inviteBtn = page.getByRole("button", { name: "Edit invite first" }).first();
    if (await inviteBtn.count()) {
      await inviteBtn.click();
      // only one draft is open, so the page-level Send button is that draft's
      await expect(page.getByRole("button", { name: "Send invite" })).toBeInViewport();
      await page.getByRole("button", { name: "Cancel" }).click();
    }

    await page.getByRole("button", { name: "Why not others?" }).click();
    const why = page.getByTestId("why-not");
    await expect(why).toContainText(/\d+ min walk, too far/);
    await expect(why).toContainText("over your $15 budget");

    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByTestId("plan-sheet")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "I'm free" })).toBeVisible();
  });

  test("a new ask replaces one still in flight", async ({ page }) => {
    let calls = 0;
    await page.route("**/api/muse/plan", async (route) => {
      calls += 1;
      if (calls === 1) await new Promise((r) => setTimeout(r, 2_000));
      await route.continue().catch(() => undefined);
    });
    await openSheet(page, "alex");
    const box = page.locator("#imfree-text");
    await box.fill("hungry, 15 min");
    await box.press("Enter");
    await expect(page.getByTestId("plan-loading")).toBeVisible();
    await page.waitForTimeout(300);
    await openComposer(page);
    await box.fill(PLACEHOLDER);
    await box.press("Enter");
    await expect(page.getByTestId("plan-loading")).toHaveCount(0, { timeout: 15_000 });
    // the shown plan answers the second ask (40 min), not the first (15 min)
    const summary = page.getByTestId("plan-summary");
    await expect(summary).toBeVisible();
    await page.waitForTimeout(2_200); // the first (aborted) answer must not replace it
    await expect(summary).not.toContainText("15 min");
    await expect(page.getByTestId("plan-empty")).toHaveCount(0);
    await expect(page.getByTestId("picked-summary")).toContainText(PLACEHOLDER);
    expect(calls).toBe(2);
  });

  test("one seat left: Maya is told and can join without Alex", async ({ page, browser }) => {
    // Its own quest (Jordan hosts, capacity 3), so it never touches Dumpling Den's seats.
    const as = (h: string) => ({ "x-persona": h });
    const t0 = Date.now();
    const created = await page.request.post("/api/quests", {
      headers: as("jordan"),
      data: {
        title: `One seat test ${t0}`, emoji: "🧋", category: "food", venueName: "Test Tea Bar",
        location: { lat: 37.4852, lng: -122.1482 }, startsAt: new Date(t0 + 20 * 60_000).toISOString(),
        endsAt: new Date(t0 + 80 * 60_000).toISOString(), capacity: 3, priceMax: 6, isPublic: true,
      },
    });
    expect(created.ok()).toBe(true);
    const questId = (await created.json()).quest.id as string;
    const sent = await page.request.post("/api/invites", {
      headers: as("alex"), data: { toId: "maya", questId, suggestionTitle: `One seat test ${t0}`, message: "boba?" },
    });
    expect(sent.ok()).toBe(true);
    const joined = await page.request.post(`/api/quests/${questId}/join`, { headers: as("priya"), data: {} });
    expect((await joined.json()).seatsLeft).toBe(1);

    const mayaCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const maya = await mayaCtx.newPage();
    await maya.goto("/out-here?as=maya");
    const card = maya.getByTestId("invite-card").filter({ hasText: `One seat test ${t0}` });
    await expect(card.getByTestId("invite-one-seat")).toContainText("Only 1 seat is left");
    await card.getByRole("button", { name: "Join without Alex" }).click();
    await expect(card.getByTestId("invite-result")).toContainText("You're in");
    await mayaCtx.close();
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
    // ✨ Muse only on live model text; offline (mock) text is labelled as such
    const mode = (await page.request.post("/api/muse/plan", { data: { text: PLACEHOLDER }, headers: { "x-persona": "alex" } })).headers()["x-muse-mode"];
    if (mode === "mock") {
      await expect(page.getByTestId("offline-label")).toBeVisible();
      await expect(page.getByTestId("muse-label")).toHaveCount(0);
    } else {
      await expect(page.getByTestId("muse-label").first()).toBeVisible();
    }

    // maya is on Out Here in a second browser context
    const mayaCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const maya = await mayaCtx.newPage();
    await maya.goto("/out-here?as=maya");
    await expect(maya.getByRole("button", { name: "I'm free" })).toBeVisible();

    await expect(top.getByRole("button", { name: "Go with Maya" })).toBeVisible();
    await top.getByRole("button", { name: "Edit invite first" }).click();
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
    // Alex took a seat when he sent it ("Go with" = join + invite), so one is left for Maya
    await expect(card.getByTestId("seats-left")).toHaveText("1 left");
    await card.getByRole("button", { name: "Accept" }).click();
    await expect(card.getByTestId("invite-result")).toContainText("You're in with Alex");
    await expect(card.getByTestId("seats-left")).toHaveText("Full", { timeout: 3_000 });
    await expect(top.getByTestId("seats-left")).toHaveText("Full", { timeout: 3_000 });
    await expect(top.getByRole("button", { name: "You're going" })).toBeVisible({ timeout: 3_000 });
    // the inviter's payoff: Maya said yes, and when to leave
    await expect(top.getByTestId("invite-outcome")).toContainText("Maya's in. You're both going to Dumpling Den", { timeout: 3_000 });

    // the next plan for alex no longer offers it, from the live store
    const res = await page.request.post("/api/muse/plan", { data: { text: PLACEHOLDER }, headers: { "x-persona": "alex" } });
    const body = await res.json();
    expect(body.meta.contextSource).toBe("store");
    expect(body.suggestions.map((s: { title: string }) => s.title)).not.toContain(DUMPLINGS);

    // alex's availability was shared with friends
    const avail = await maya.request.get(`/api/friends/maya/availability`, { headers: { "x-persona": "maya" } });
    if (avail.ok()) {
      const items = (await avail.json()).items as { text: string; friend: { handle: string } }[];
      // one active signal per person, from the ask whose results were shown
      const fromAlex = items.filter((i) => i.friend.handle === "alex");
      expect(fromAlex.length).toBe(1);
    }
    await mayaCtx.close();
  });
});
