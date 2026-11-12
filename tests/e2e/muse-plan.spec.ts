import { expect, test } from "@playwright/test";

// API-level check of POST /api/muse/plan against the seed context (builders run in mock mode).
test.describe("POST /api/muse/plan", () => {
  test("demo sentence: Dumpling Den with Maya on top, ramen and sushi absent", async ({ request }) => {
    const res = await request.post("/api/muse/plan", {
      data: { text: "hungry, got like 40 min, under $15" },
      headers: { "x-persona": "alex" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.intent.budgetMax).toBe(15);
    expect(body.suggestions.length).toBeGreaterThanOrEqual(1);
    expect(body.suggestions.length).toBeLessThanOrEqual(3);
    const top = body.suggestions[0];
    expect(top.title).toBe("Dumplings before the rush");
    expect(top.travelMinutes).toBe(9);
    expect(top.seatsLeft).toBe(2);
    expect(top.fitsWindow).toBe(true);
    expect(top.friendIds.length).toBe(1);
    expect(top.inviteDraft).toContain("Maya");
    const titles = body.suggestions.map((s: { title: string }) => s.title);
    expect(titles).not.toContain("Ramen run");
    expect(titles).not.toContain("Conveyor sushi lunch");
    if (body.meta.mode === "mock") expect(body.summary.startsWith("[mock] ")).toBe(true);
    // the UI shows the Muse label only when source is "muse"
    expect(["muse", "fallback", "mock"]).toContain(body.meta.source);
    expect(res.headers()["x-muse-source"]).toBe(body.meta.source === "fallback" ? "fallback" : "muse");
    if (body.meta.mode === "mock") expect(body.meta.source).toBe("mock");
  });

  test("nonsense input returns an empty plan, not an error", async ({ request }) => {
    const res = await request.post("/api/muse/plan", { data: { text: "asdfgh" }, headers: { "x-persona": "alex" } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.suggestions).toEqual([]);
    expect(typeof body.summary).toBe("string");
  });

  test("bad input is a JSON 4xx", async ({ request }) => {
    const empty = await request.post("/api/muse/plan", { data: { text: "" }, headers: { "x-persona": "alex" } });
    expect(empty.status()).toBe(400);
    expect((await empty.json()).error).toBeTruthy();
    const unknown = await request.post("/api/muse/plan", { data: { text: "hungry", userId: "nobody-here" }, headers: { "x-persona": "alex" } });
    expect(unknown.status()).toBe(403);
    expect((await unknown.json()).error).toContain("viewer");
  });
});
