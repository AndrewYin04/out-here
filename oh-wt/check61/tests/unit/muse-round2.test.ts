// Regression tests for fix round 2: E1/R1 (per-card text claims), R2 (past start clock),
// R3 (private quests never reach meta.dropped).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildSeedWorld, contextFromWorld, onRun, plan, resolveWindow, setMuseTransport, type MuseTransport,
} from '@/features/muse';

const saved = { ...process.env };
const NOW = new Date('2026-11-12T16:00:00-08:00');
const TEXT = 'hungry, got like 40 min, under $15';
const usage = { promptTokens: 1, completionTokens: 1 };
const INTENT_40 = JSON.stringify({
  understood: true, activities: ['food'], budgetMax: 15, durationMinutes: 40, startsInMinutes: null,
  startClock: null, endClock: null, partOfDay: null, maxWalkMinutes: null, wantsFriends: true,
  openToNewPeople: true, vibe: null,
});
type Cand = { id: string; title: string; friendsWhoCanCome: { id: string }[] };
type Pick = { candidate: string; friends: string[]; reason: string; bridge: string | null; inviteDraft: string | null };

function rankWith(build: (cands: Cand[]) => Pick[]): MuseTransport {
  return async (req) => {
    if (req.schemaName === 'intent') return { content: INTENT_40, usage };
    const user = JSON.parse(req.messages[1].content) as { candidates: Cand[] };
    return { content: JSON.stringify({ summary: 'Dumplings fit.', picks: build(user.candidates) }), usage };
  };
}
const dumpling = (c: Cand[]) => c.find((x) => x.title.startsWith('Dumplings'))!;

describe('live mode, card text', () => {
  beforeEach(() => {
    onRun(() => {});
    delete process.env.MUSE_MOCK;
    process.env.MUSE_API_KEY = 'test-key-not-real';
    process.env.MUSE_BASE_URL = 'http://127.0.0.1:9';
    process.env.MUSE_CACHE = '0';
    process.env.MUSE_QUIET = '1';
  });
  afterEach(() => {
    process.env = { ...saved };
    setMuseTransport(null);
  });

  it('E1: replaces reason, bridge and invite that contradict price, walk and start time', async () => {
    setMuseTransport(rankWith((c) => [
      { candidate: 'c99', friends: [], reason: 'x', bridge: null, inviteDraft: null },
      {
        candidate: dumpling(c).id, friends: [...dumpling(c).friendsWhoCanCome.map((f) => f.id), 'f9'],
        reason: 'Only $3 a plate and it is a 2 min walk, starts at 9:00 PM.',
        bridge: 'Free drinks for everyone tonight.',
        inviteDraft: 'Maya! Dumplings for $3 at 9 PM, 2 min away?',
      },
    ]));
    const out = await plan({ text: TEXT, userId: 'alex', now: NOW });
    const top = out.plan.suggestions[0];
    expect(top.title).toBe('Dumplings before the rush');
    expect(top.reason).not.toMatch(/\$3|2 min|9:00 PM/);
    // the replacement reason says why (shared interest), never the card's price/walk/time
    expect(top.reason).toMatch(/dumplings/i);
    expect(top.bridge ?? '').not.toMatch(/Free drinks/i);
    expect(top.inviteDraft).not.toMatch(/\$3|9 PM|2 min/);
    const fields = out.meta.issues.map((i) => i.field).filter(Boolean);
    expect(fields).toEqual(expect.arrayContaining(['reason', 'bridge', 'inviteDraft']));
  });

  it('R1: replaces card text naming another quest or a free perk', async () => {
    setMuseTransport(rankWith((c) => [{
      candidate: dumpling(c).id, friends: dumpling(c).friendsWhoCanCome.map((f) => f.id),
      reason: 'It is only $3 and the sushi is free tonight.', bridge: 'Free sushi too.', inviteDraft: 'Come, $3 dumplings!',
    }]));
    const out = await plan({ text: TEXT, userId: 'alex', now: NOW });
    const top = out.plan.suggestions[0];
    expect(top.reason).not.toMatch(/sushi|\$3/);
    expect(top.bridge ?? '').not.toMatch(/sushi/i);
    expect(top.inviteDraft).not.toMatch(/\$3/);
    expect(out.meta.issues.filter((i) => i.field).length).toBe(3);
  });

  it('drops "you both" claims when no friend was kept', async () => {
    setMuseTransport(rankWith((c) => [{
      candidate: dumpling(c).id, friends: [], reason: 'You both like dumplings, and it is $12.', bridge: null, inviteDraft: null,
    }]));
    const out = await plan({ text: TEXT, userId: 'alex', now: NOW });
    const top = out.plan.suggestions[0];
    expect(top.friendIds).toEqual([]);
    expect(top.reason).not.toMatch(/both/i);
    expect(out.meta.issues.some((i) => i.field === 'reason')).toBe(true);
  });

  it('keeps honest card text that cites real numbers', async () => {
    setMuseTransport(rankWith((c) => [{
      candidate: dumpling(c).id, friends: dumpling(c).friendsWhoCanCome.map((f) => f.id),
      reason: 'Starts 4:25 PM, a 9 min walk, $12 and under your $15. You and Maya both like dumplings.',
      bridge: "Maya's free till 4:50 PM.", inviteDraft: 'Maya! Dumplings at 4:25 PM, 9 min walk, $12?',
    }]));
    const out = await plan({ text: TEXT, userId: 'alex', now: NOW });
    const top = out.plan.suggestions[0];
    expect(out.meta.issues).toEqual([]);
    expect(top.reason).toBe('Starts 4:25 PM, a 9 min walk, $12 and under your $15. You and Maya both like dumplings.');
    expect(top.bridge).toBe("Maya's free till 4:50 PM.");
    expect(top.inviteDraft).toBe('Maya! Dumplings at 4:25 PM, 9 min walk, $12?');
    expect(out.meta.summarySource).toBe('muse');
  });

  it("replaces a bridge with the wrong free-until time (Maya's seeded window ends 4:50 PM)", async () => {
    setMuseTransport(rankWith((c) => [{
      candidate: dumpling(c).id, friends: dumpling(c).friendsWhoCanCome.map((f) => f.id),
      reason: 'Dumplings for $12.', bridge: "Maya's free till 6:00 PM.", inviteDraft: null,
    }]));
    const out = await plan({ text: TEXT, userId: 'alex', now: NOW });
    expect(out.plan.suggestions[0].bridge).toBe("Maya's free till 4:50 PM and is into dumplings too.");
    expect(out.meta.issues).toEqual([expect.objectContaining({ field: 'bridge', issue: 'bridge quoted 6:00 pm' })]);
    // a missing invite is written by code when a friend is invited
    expect(out.plan.suggestions[0].inviteDraft).toMatch(/^Hey Maya!/);
  });
});

describe('R2: a start clock that already passed means from now', () => {
  const t = { durationMinutes: null, startsInMinutes: null, endClock: null, partOfDay: null } as const;
  const at530 = new Date('2026-11-12T17:30:00-08:00');
  it('"after 5" at 5:30 PM starts now, today', () => {
    const w = resolveWindow({ ...t, startClock: '17:00' }, at530);
    expect(w.windowStart).toBe(at530.toISOString());
    expect(Date.parse(w.windowEnd) - at530.getTime()).toBe(180 * 60_000);
  });
  it('"after 5" read as 05:00 at 5:30 PM also starts now', () => {
    expect(resolveWindow({ ...t, startClock: '05:00' }, at530).windowStart).toBe(at530.toISOString());
  });
  it('"after 5" at 4 PM still starts at 5 PM', () => {
    const w = resolveWindow({ ...t, startClock: '05:00' }, NOW);
    expect(w.windowStart).toBe(new Date('2026-11-12T17:00:00-08:00').toISOString());
  });
  it('plan("free after 5, anything fun") at 5:30 PM returns suggestions', async () => {
    process.env.MUSE_MOCK = '1';
    const out = await plan({ text: 'free after 5, anything fun', userId: 'alex', now: at530 });
    process.env = { ...saved };
    expect(Date.parse(out.plan.intent.windowStart)).toBe(at530.getTime());
    expect(out.plan.suggestions.length).toBeGreaterThan(0);
  });
});

describe('R3: quests the viewer cannot see never reach meta.dropped', () => {
  it('a private quest with no friend member is absent from dropped', async () => {
    process.env.MUSE_MOCK = '1';
    const world = buildSeedWorld(NOW);
    const context = contextFromWorld(world, { userId: 'alex', location: null, now: NOW });
    const friendIds = new Set(context.friends.map((f) => f.profile.id));
    const target = context.quests.find((q) => q.status === 'open' && !q.memberIds.some((m) => friendIds.has(m)))!;
    target.isPublic = false;
    target.title = 'Secret birthday for Jordan';
    const out = await plan({ text: TEXT, context, now: NOW });
    process.env = { ...saved };
    expect(JSON.stringify(out.meta)).not.toContain('Secret birthday');
    expect(out.meta.dropped.some((d) => d.questId === target.id)).toBe(false);
  });
});
