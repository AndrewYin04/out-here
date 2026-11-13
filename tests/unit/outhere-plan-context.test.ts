import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { profileId, seedId, setNow } from '@/shared';
import { createMemoryStore } from '@/features/data/memory-store';
import type { CoreStore } from '@/features/data/core';
import { plan } from '@/features/muse';
import { bubbleLine, buildStorePlanContext } from '@/features/outhere/server/plan-context';
import { dropText, shownDrops, type DroppedView } from '@/features/outhere/dropped';

const alex = profileId('alex');
const maya = profileId('maya');
const dumplings = seedId('quest', 'dumplings');
const TEXT = 'hungry, got like 40 min, under $15';
const NOW = new Date('2026-11-12T18:07:00Z');

let store: CoreStore;
let prevMock: string | undefined;
beforeAll(() => { prevMock = process.env.MUSE_MOCK; process.env.MUSE_MOCK = '1'; });
afterAll(() => { setNow(null); if (prevMock === undefined) delete process.env.MUSE_MOCK; else process.env.MUSE_MOCK = prevMock; });
beforeEach(() => { setNow(NOW); store = createMemoryStore(NOW); });

describe('store-backed plan context', () => {
  it('builds the viewer, friends, availability and quests from the store', async () => {
    const ctx = await buildStorePlanContext({ userId: alex, location: null, now: NOW }, store);
    expect(ctx.viewer.id).toBe(alex);
    expect(ctx.friends.map((f) => f.profile.id)).toContain(maya);
    expect(ctx.friendAvailability.every((a) => ctx.friends.some((f) => f.profile.id === a.userId))).toBe(true);
    const q = ctx.quests.find((x) => x.id === dumplings);
    expect(q).toBeTruthy();
    expect(q!.memberIds.length).toBeGreaterThan(0);
  });

  it('resolves a handle and rejects an unknown user', async () => {
    const ctx = await buildStorePlanContext({ userId: 'maya', location: null, now: NOW }, store);
    expect(ctx.viewer.id).toBe(maya);
    await expect(buildStorePlanContext({ userId: 'nobody-here', location: null, now: NOW }, store)).rejects.toThrow(/unknown user/);
  });

  it('demo sentence: Dumpling Den with Maya on top; after Alex joins it is no longer offered', async () => {
    const ctx = await buildStorePlanContext({ userId: alex, location: null, now: NOW }, store);
    const first = await plan({ text: TEXT, userId: alex, now: NOW, context: ctx });
    expect(first.plan.suggestions[0]?.questId).toBe(dumplings);
    expect(first.plan.suggestions[0]?.friendIds).toContain(maya);

    await store.joinQuest(alex, dumplings, null);
    const ctx2 = await buildStorePlanContext({ userId: alex, location: null, now: NOW }, store);
    const second = await plan({ text: TEXT, userId: alex, now: NOW, context: ctx2 });
    expect(second.plan.suggestions.map((s) => s.questId)).not.toContain(dumplings);
    expect(second.meta.dropped.find((d) => d.questId === dumplings)?.reason).toBe('already_member');
  });

  it('15 minutes leaves no dumplings', async () => {
    const ctx = await buildStorePlanContext({ userId: alex, location: null, now: NOW }, store);
    const out = await plan({ text: 'hungry, 15 min', userId: alex, now: NOW, context: ctx });
    expect(out.plan.suggestions.map((s) => s.questId)).not.toContain(dumplings);
  });

  it('friend statuses carry text only, never coordinates', async () => {
    const ctx = await buildStorePlanContext({ userId: alex, location: null, now: NOW }, store);
    for (const s of ctx.friendStatuses) {
      expect(JSON.stringify(s)).not.toMatch(/"lat"|"lng"/);
    }
  });

  it("a friend's status bubble reaches the reason, and the reason never repeats card facts", async () => {
    const withShares = {
      museContext: async () => {
        const r = await store.museContext();
        const share = {
          userId: maya, paused: false, audience: 'friends', expiresAt: new Date(NOW.getTime() + 3600_000).toISOString(),
          updatedAt: NOW.toISOString(), bubble: { emoji: '🥟', thought: 'craving dumplings', doing: null, wantsTo: null },
        };
        return { ...r, db: { ...r.db, locationShares: [share] } as typeof r.db };
      },
    };
    const ctx = await buildStorePlanContext({ userId: alex, location: null, now: NOW }, withShares);
    expect(ctx.friends.find((f) => f.profile.id === maya)?.status).toBe('craving dumplings 🥟');
    const out = await plan({ text: TEXT, userId: alex, now: NOW, context: ctx });
    const top = out.plan.suggestions[0]!;
    // the bubble is paraphrased, never pasted with its quotes and separators
    expect(top.reason).toContain("Maya's craving dumplings");
    expect(top.reason).not.toMatch(/"|·|status says/);
    expect(top.reason).toMatch(/Maya's free till \d+:\d\d [AP]M/);
    // a pick with no friend names a concrete fit, never the budget alone
    for (const s of out.plan.suggestions.slice(1)) {
      expect(s.reason).not.toBe('');
      expect(s.reason).not.toMatch(/^Within your \$\d+ budget\.$/);
      expect(s.reason).toMatch(/\d/);
    }
  });
});

describe('availability', () => {
  it('keeps one active signal per person: a new ask replaces the last one', async () => {
    const at = (m: number) => new Date(NOW.getTime() + m * 60_000).toISOString();
    const loc = { lat: 37.4847, lng: -122.1477 };
    await store.createAvailability(alex, { text: 'hungry, 15 min', startsAt: at(0), endsAt: at(15), location: loc });
    await store.createAvailability(alex, { text: TEXT, startsAt: at(0), endsAt: at(40), location: loc });
    const fromAlex = (await store.friendAvailability(maya)).filter((a) => a.userId === alex);
    expect(fromAlex.map((a) => a.text)).toEqual([TEXT]);
  });
});

describe('bubbleLine', () => {
  it('joins the three parts', () => {
    expect(bubbleLine({ emoji: '🥟', thought: 'craving dumplings', doing: 'at work till 5:15', wantsTo: 'try the new boba place' }))
      .toBe('craving dumplings 🥟 · at work till 5:15 · wants to try the new boba place');
    expect(bubbleLine(null)).toBe('');
    expect(bubbleLine({ thought: null, doing: null, wantsTo: null, emoji: null })).toBe('');
  });
});

describe('why not others', () => {
  it('writes plain reasons', () => {
    expect(dropText('walk', { walkMinutes: 28, priceMax: 14, budgetMax: 15 })).toBe('28 min walk, too far');
    expect(dropText('budget', { walkMinutes: 6, priceMax: 26, budgetMax: 15 })).toBe('$26, over your $15 budget');
  });
  it('hides activity mismatches and duplicates', () => {
    const base = { title: 't', venueName: 'v', emoji: 'x', text: 'y' };
    const all: DroppedView[] = [
      { ...base, questId: 'a', reason: 'activity' },
      { ...base, questId: 'b', reason: 'walk' },
      { ...base, questId: 'b', reason: 'walk' },
      { ...base, questId: 'c', reason: 'budget' },
    ];
    expect(shownDrops(all).map((d) => d.questId)).toEqual(['b', 'c']);
  });
});

describe('a friend who asks Muse keeps their place and status (both personas)', () => {
  it("Maya's own ask keeps her shared spot and note, and Alex's dumpling pick still says Maya", async () => {
    const before = (await store.friendAvailability(alex)).find((a) => a.userId === maya)!;
    expect(before).toBeTruthy();
    // Maya asks Muse; the plan starts from where she already shares, not from home 2 km north.
    const mctx = await buildStorePlanContext({ userId: maya, location: null, now: NOW }, store);
    expect(mctx.location).toEqual(before.location);
    const mine = await plan({ text: TEXT, userId: maya, now: NOW, context: mctx });
    expect(mine.plan.suggestions.length).toBeGreaterThan(0);
    // The ask becomes her window with no note of its own ("free"), as the composer sends it.
    await store.createAvailability(maya, {
      text: 'free', startsAt: NOW.toISOString(), endsAt: mine.plan.intent.windowEnd, location: mctx.location,
    });
    const after = (await store.friendAvailability(alex)).filter((a) => a.userId === maya && a.endsAt > NOW.toISOString());
    expect(after).toHaveLength(1);
    expect(after[0]!.text).toBe(before.text);
    expect(after[0]!.location).toEqual(before.location);

    const actx = await buildStorePlanContext({ userId: alex, location: null, now: NOW }, store);
    const out = await plan({ text: TEXT, userId: alex, now: NOW, context: actx });
    expect(out.plan.suggestions[0]?.questId).toBe(dumplings);
    expect(out.plan.suggestions[0]?.friendIds).toContain(maya);
  });
});
