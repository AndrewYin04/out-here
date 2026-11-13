// Regression tests for fix round 1: E1 (deadline), E2 (source label + loud fallback),
// E3 (schema without enum-with-null), R1 (model summary guard).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  MuseTimeoutError, PARSE_BUDGET_MS, museJSON, onRun, plan, setMuseTransport, type MuseRunRecord, type MuseTransport,
} from '@/features/muse';
import { RAW_INTENT_JSON_SCHEMA, RawIntentZ } from '@/features/muse/intent';

const saved = { ...process.env };
const NOW = new Date('2026-11-12T16:00:00-08:00');
const TEXT = 'hungry, got like 40 min, under $15';
let runs: MuseRunRecord[] = [];

beforeEach(() => {
  runs = [];
  onRun((r) => { runs.push(r); });
  delete process.env.MUSE_MOCK;
  process.env.MUSE_API_KEY = 'test-key-not-real';
  process.env.MUSE_BASE_URL = 'http://127.0.0.1:9';
  process.env.MUSE_CACHE = '0';
  process.env.MUSE_QUIET = '1';
});
afterEach(() => {
  process.env = { ...saved };
  setMuseTransport(null);
  onRun(() => {});
});

const usage = { promptTokens: 1, completionTokens: 1 };
const INTENT_40 = JSON.stringify({
  understood: true, activities: ['food'], budgetMax: 15, durationMinutes: 40, startsInMinutes: null,
  startClock: null, endClock: null, partOfDay: null, maxWalkMinutes: null, wantsFriends: true,
  openToNewPeople: true, vibe: null,
});
const never = () => new Promise<never>(() => {});

/** Transport whose rank reply is built from the prompt's candidate list. */
function rankWith(build: (cands: { id: string; title: string; friendsWhoCanCome: { id: string }[] }[]) => object): MuseTransport {
  return async (req) => {
    if (req.schemaName === 'intent') return { content: INTENT_40, usage };
    if (typeof req.messages[1].content !== 'string') throw new Error('Expected text ranking input');
    const user = JSON.parse(req.messages[1].content) as { candidates: { id: string; title: string; friendsWhoCanCome: { id: string }[] }[] };
    return { content: JSON.stringify(build(user.candidates)), usage };
  };
}
const dumplingPick = (cands: { id: string; title: string; friendsWhoCanCome: { id: string }[] }[]) => {
  const d = cands.find((c) => c.title.startsWith('Dumplings'))!;
  return {
    candidate: d.id, friends: d.friendsWhoCanCome.map((f) => f.id),
    reason: 'Starts 4:25 PM, 9 min walk, $12. You and Maya both like dumplings.', bridge: null, inviteDraft: 'Maya! Dumplings at 4:25?',
  };
};

describe('E1: the pipeline has one deadline', () => {
  it('a hanging Muse costs the parse budget once, and rank is skipped', async () => {
    process.env.MUSE_PLAN_BUDGET_MS = '1000';
    let calls = 0;
    setMuseTransport(() => { calls++; return never(); });
    const t0 = Date.now();
    const out = await plan({ text: TEXT, userId: 'alex', now: NOW });
    const ms = Date.now() - t0;
    expect(ms).toBeLessThan(2000);
    expect(calls).toBe(1); // parse only, no retry after a timeout, no rank call
    expect(out.meta.models).toEqual({ parse: 'heuristic', rank: 'heuristic' });
    expect(out.meta.rankError).toMatch(/^skipped: parse fell back/);
    expect(out.plan.suggestions[0].title).toBe('Dumplings before the rush');
  });

  it('parse is capped at PARSE_BUDGET_MS even with a large total budget', async () => {
    process.env.MUSE_PLAN_BUDGET_MS = '60000';
    setMuseTransport(() => never());
    const t0 = Date.now();
    const out = await plan({ text: TEXT, userId: 'alex', now: NOW });
    const ms = Date.now() - t0;
    expect(ms).toBeGreaterThanOrEqual(PARSE_BUDGET_MS - 50);
    expect(ms).toBeLessThan(PARSE_BUDGET_MS + 1000);
    expect(out.meta.source).toBe('fallback');
  }, 10_000);

  it('a hanging rank stops at the total budget', async () => {
    process.env.MUSE_PLAN_BUDGET_MS = '1200';
    setMuseTransport(async (req) => (req.schemaName === 'intent' ? { content: INTENT_40, usage } : never()));
    const t0 = Date.now();
    const out = await plan({ text: TEXT, userId: 'alex', now: NOW });
    expect(Date.now() - t0).toBeLessThan(2200);
    expect(out.meta.models.parse).toBe('muse-ember-1.0');
    expect(out.meta.models.rank).toBe('heuristic');
    expect(out.meta.rankError).toMatch(/timed out/);
    expect(out.meta.source).toBe('fallback');
  });

  it('museJSON does not call the transport once the deadline has passed', async () => {
    let calls = 0;
    setMuseTransport(async () => { calls++; return { content: '{"a":"x"}', usage }; });
    const call = museJSON({
      schemaName: 't', schema: z.object({ a: z.string() }), jsonSchema: {}, model: 'fast',
      messages: [{ role: 'user', content: 'hi' }], mock: () => ({ a: 'm' }), deadline: Date.now() - 1,
    });
    await expect(call).rejects.toBeInstanceOf(MuseTimeoutError);
    expect(calls).toBe(0);
  });
});

describe('model text never shows prompt field names', () => {
  it('replaces a reason or bridge that says "priceMax 12" or "freeUntil"', async () => {
    setMuseTransport(rankWith((c) => ({
      summary: 'Dumplings with Maya fit.',
      picks: [{ ...dumplingPick(c), reason: 'You both like dumplings. With priceMax 12 and walkMin 9 it fits.', bridge: "Maya's freeUntil is 4:50 PM" }],
    })));
    const out = await plan({ text: TEXT, userId: 'alex', now: NOW });
    const s = out.plan.suggestions[0];
    expect(s.reason).not.toMatch(/priceMax|walkMin/);
    expect(s.bridge ?? '').not.toMatch(/freeUntil/);
    expect(out.meta.issues.some((i) => i.issue === 'leaked a data field name')).toBe(true);
  });
});

describe('E2: meta.source says who wrote the plan', () => {
  it('is "muse" when both model steps answer', async () => {
    setMuseTransport(rankWith((c) => ({ summary: 'Dumplings with Maya fit.', picks: [dumplingPick(c)] })));
    const out = await plan({ text: TEXT, userId: 'alex', now: NOW });
    expect(out.meta.source).toBe('muse');
    expect(out.meta.summarySource).toBe('muse');
    expect(out.plan.summary).toBe('Dumplings with Maya fit.');
    expect(runs.every((r) => r.ok)).toBe(true);
    // Free friends: who (id, name, photo: the map lights their pin and the sheet offers invites) and until
    // when. Never their location or their status text.
    expect(out.meta.friendsFree.map((f) => f.firstName)).toContain('Maya');
    expect(Object.keys(out.meta.friendsFree[0]).sort()).toEqual(['avatarUrl', 'firstName', 'freeUntil', 'friendId', 'id', 'name']);
  });

  it('is "fallback" and logs a heuristic run when the model returns invented ids', async () => {
    setMuseTransport(rankWith(() => ({ summary: 'x', picks: [{ candidate: 'c99', friends: [], reason: 'r', bridge: null, inviteDraft: null }] })));
    const out = await plan({ text: TEXT, userId: 'alex', now: NOW });
    expect(out.meta.source).toBe('fallback');
    expect(out.meta.summarySource).toBe('code');
    const fb = runs.find((r) => r.model === 'heuristic');
    expect(fb).toMatchObject({ ok: false, schemaName: 'plan' });
    expect(fb?.error).toMatch(/^fallback\(plan\)/);
  });

  it('is "mock" in mock mode', async () => {
    process.env.MUSE_MOCK = '1';
    const out = await plan({ text: TEXT, userId: 'alex', now: NOW });
    expect(out.meta.source).toBe('mock');
    expect(out.plan.summary.startsWith('[mock] ')).toBe(true);
  });
});

describe('R1: the model summary is checked', () => {
  it('replaces a summary that names a stranger and a dropped quest', async () => {
    setMuseTransport(rankWith((c) => ({
      summary: 'Jordan is going and the sushi place is $5 tonight.', picks: [dumplingPick(c)],
    })));
    const out = await plan({ text: TEXT, userId: 'alex', now: NOW });
    expect(out.plan.summary).not.toMatch(/Jordan|sushi|\$5/);
    expect(out.plan.summary).toMatch(/Dumplings before the rush/);
    expect(out.meta.summarySource).toBe('code');
    expect(out.meta.summaryIssue).toMatch(/Jordan/);
    expect(out.meta.source).toBe('muse'); // parse and rank answered; only the summary was replaced
  });

  it('replaces a summary with a price no kept quest has', async () => {
    setMuseTransport(rankWith((c) => ({ summary: 'Dumplings with Maya, only $3.', picks: [dumplingPick(c)] })));
    const out = await plan({ text: TEXT, userId: 'alex', now: NOW });
    expect(out.meta.summaryIssue).toBe('summary quoted $3');
  });

  it('replaces a summary that mentions a quest not in the plan', async () => {
    setMuseTransport(rankWith((c) => ({ summary: 'Dumplings with Maya, or ramen after.', picks: [dumplingPick(c)] })));
    const out = await plan({ text: TEXT, userId: 'alex', now: NOW });
    expect(out.meta.summaryIssue).toMatch(/ramen/);
  });

  it('keeps a summary quoting the kept price and the budget', async () => {
    setMuseTransport(rankWith((c) => ({ summary: 'Dumplings with Maya for $12, under your $15.', picks: [dumplingPick(c)] })));
    const out = await plan({ text: TEXT, userId: 'alex', now: NOW });
    expect(out.meta.summarySource).toBe('muse');
    expect(out.plan.summary).toBe('Dumplings with Maya for $12, under your $15.');
  });
});

describe('E3: intent schema avoids enum-with-null', () => {
  it('has no enum anywhere in the strict schema', () => {
    expect(JSON.stringify(RAW_INTENT_JSON_SCHEMA)).not.toContain('enum');
  });
  it('reads an unknown partOfDay as null and normalises case', () => {
    const base = JSON.parse(INTENT_40);
    expect(RawIntentZ.parse({ ...base, partOfDay: 'Tonight' }).partOfDay).toBe('tonight');
    expect(RawIntentZ.parse({ ...base, partOfDay: 'late night' }).partOfDay).toBeNull();
  });
});
