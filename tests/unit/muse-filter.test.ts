import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { profileId, seedId, setNow } from '@/shared';
import { createMemoryStore } from '@/features/data/memory-store';
import type { CoreStore } from '@/features/data/core';
import { setMuseTransport } from '@/features/muse';
import { buildStorePlanContext } from '@/features/outhere/server/plan-context';
import {
  cachedMuseFilter, clearFilterCache, fallbackFilter, parseFilterText, questCandidates, runMuseFilter,
  scoreQuests, validateKeep,
} from '@/features/outhere/server/muse-filter';

const alex = profileId('alex');
const maya = profileId('maya');
const dumplings = seedId('quest', 'dumplings');
const boba = seedId('quest', 'boba');
const bands = seedId('quest', 'band-pregame');
const NOW = new Date('2026-11-12T18:07:00Z');

let store: CoreStore;
const prev = { mock: process.env.MUSE_MOCK, key: process.env.MUSE_API_KEY, quiet: process.env.MUSE_QUIET };
beforeAll(() => { process.env.MUSE_MOCK = '1'; process.env.MUSE_QUIET = '1'; });
afterAll(() => {
  setNow(null);
  for (const [k, v] of [['MUSE_MOCK', prev.mock], ['MUSE_API_KEY', prev.key], ['MUSE_QUIET', prev.quiet]] as const) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});
beforeEach(() => { setNow(NOW); store = createMemoryStore(NOW); clearFilterCache(); });
afterEach(() => { setMuseTransport(null); });

const ctxFor = (userId: string) => buildStorePlanContext({ userId, location: null, now: NOW }, store);
/** The viewer starting from home, far from their shared spot (these scenarios are about distance). */
const ctxAtHome = async (userId: string) => {
  const home = (await ctxFor(userId)).viewer.home;
  return buildStorePlanContext({ userId, location: home, now: NOW }, store);
};

describe('muse filter: the viewer free window', () => {
  const freeFor = (userId: string, minutes: number) => store.createAvailability(userId, {
    text: 'free', startsAt: new Date(NOW.getTime() - 5_000).toISOString(),
    endsAt: new Date(NOW.getTime() + minutes * 60_000).toISOString(), location: { lat: 37.4847, lng: -122.1477 },
  });

  it('free for 40 min: no plan starting after the window (minus the walk) lights up, and every reason says when', async () => {
    await freeFor(alex, 40);
    const ctx = await ctxFor(alex);
    expect(ctx.viewerWindow).toBeTruthy();
    const out = await runMuseFilter({ ctx, mode: 'explore', text: '' });
    const byId = new Map(ctx.quests.map((q) => [q.id, q]));
    expect(out.keep.length).toBeGreaterThan(0);
    expect(out.keep.map((k) => k.id)).not.toContain(bands); // starts in 4 h
    expect(out.keep.map((k) => k.id)).not.toContain(seedId('quest', '5k')); // starts in 1 h
    for (const k of out.keep) {
      const q = byId.get(k.id)!;
      expect(Date.parse(q.startsAt)).toBeLessThanOrEqual(NOW.getTime() + 40 * 60_000);
      expect(k.reason).toMatch(/(starts in \d+ min|happening now), inside your free time/);
    }
  });

  it('nothing fits a short window: says so and keeps no late plan', async () => {
    await freeFor(alex, 3);
    const out = await runMuseFilter({ ctx: await ctxFor(alex), mode: 'explore', text: '' });
    expect(out.keep).toEqual([]);
    expect(out.closest).toBe(false);
    expect(out.summary).toMatch(/^Nothing fits before \d{1,2}:\d{2} [AP]M\.$/);
  });

  it('a new free window is a new cache key', async () => {
    await freeFor(alex, 40);
    const a = await cachedMuseFilter({ ctx: await ctxFor(alex), mode: 'explore', text: '' });
    await freeFor(alex, 3);
    const b = await cachedMuseFilter({ ctx: await ctxFor(alex), mode: 'explore', text: '' });
    expect(a.keep.length).toBeGreaterThan(0);
    expect(b.cached).toBe(false);
    expect(b.keep).toEqual([]);
  });
});

describe('muse filter: mock mode', () => {
  it('alex, explore, no text: keeps dumplings, local bands and boba', async () => {
    const out = await runMuseFilter({ ctx: await ctxFor(alex), mode: 'explore', text: '' });
    const ids = out.keep.map((k) => k.id);
    expect(ids).toEqual(expect.arrayContaining([dumplings, bands, boba]));
    // The 5K is the only other keep: Alex lists running as an interest.
    expect(ids.sort()).toEqual([dumplings, bands, boba, seedId('quest', '5k')].sort());
    expect(out.source).toBe('muse');
    expect(out.mode).toBe('mock');
    expect(out.total).toBeGreaterThan(ids.length);
    expect(out.keep.every((k) => k.kind === 'quest' && k.reason.length > 0)).toBe(true);
  });

  it('alex, explore, "hungry, 15 min": only boba', async () => {
    const out = await runMuseFilter({ ctx: await ctxFor(alex), mode: 'explore', text: 'hungry, 15 min' });
    expect(out.keep.map((k) => k.id)).toEqual([boba]);
  });

  it('alex, friends, no text: keeps Maya', async () => {
    const out = await runMuseFilter({ ctx: await ctxFor(alex), mode: 'friends', text: '' });
    expect(out.keep.map((k) => k.id)).toEqual([maya]);
    expect(out.keep[0]!.kind).toBe('friend');
  });

  it('maya, explore, no text: a short list is kept whole, never emptied', async () => {
    const ctx = await ctxAtHome(maya);
    const total = questCandidates(ctx).length;
    const out = await runMuseFilter({ ctx, mode: 'explore', text: '' });
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThanOrEqual(5);
    expect(out.keep).toHaveLength(total);
    expect(out.closest).toBe(false);
    expect(out.keep.every((k) => k.reason.length > 0)).toBe(true);
  });

  it('kai, explore, no candidates in the window: keeps the closest plans from a wider search', async () => {
    // Busy (no free window), so the wider search may reach plans later tonight.
    await store.clearAvailability(profileId('kai'));
    const ctx = await ctxAtHome(profileId('kai'));
    const out = await runMuseFilter({ ctx, mode: 'explore', text: '' });
    expect(out.keep.length).toBeGreaterThan(0);
    expect(out.keep.length).toBeLessThanOrEqual(3);
    expect(out.closest).toBe(true);
    expect(out.summary).toMatch(/closest plans/);
  });

  it('an ask that matches nothing keeps the 3 closest plans, labelled closest', async () => {
    const ctx = await ctxFor(alex);
    const out = await runMuseFilter({ ctx, mode: 'explore', text: 'scuba diving' });
    expect(out.closest).toBe(true);
    expect(out.keep).toHaveLength(3);
    const walks = new Map(questCandidates(ctx).map((q) => [q.id, q.walkMinutes]));
    const kept = out.keep.map((k) => walks.get(k.id)!);
    const others = [...walks].filter(([id]) => !out.keep.some((k) => k.id === id)).map(([, w]) => w);
    expect(Math.max(...kept)).toBeLessThanOrEqual(Math.min(...others));
    expect(out.keep[0]!.reason).toMatch(/min walk$/);
  });

  it('is deterministic', async () => {
    const a = await runMuseFilter({ ctx: await ctxFor(alex), mode: 'explore', text: '' });
    const b = await runMuseFilter({ ctx: await ctxFor(alex), mode: 'explore', text: '' });
    expect(a).toEqual(b);
  });
});

describe('muse filter: candidates and validation', () => {
  it('candidates are open, have seats, start within 4 h and are within a 25 min walk', async () => {
    const ctx = await ctxFor(alex);
    for (const q of questCandidates(ctx)) {
      expect(q.seatsLeft).toBeGreaterThan(0);
      expect(q.startsInMin).toBeLessThanOrEqual(240);
      expect(q.walkMinutes).toBeLessThanOrEqual(25);
    }
  });

  it('validateKeep drops unknown and duplicate ids and caps at 8', () => {
    const allowed = new Map(Array.from({ length: 10 }, (_, i) => [`q${i}`, `fact ${i}`] as const));
    const raw = [{ id: 'nope', reason: 'x' }, { id: 'q1', reason: ' a  b ' }, { id: 'q1', reason: 'dup' }, { id: 'q2', reason: '' },
      ...Array.from({ length: 9 }, (_, i) => ({ id: `q${i}`, reason: 'r' }))];
    const out = validateKeep(raw, allowed, 'quest');
    expect(out.map((k) => k.id)).not.toContain('nope');
    expect(out[0]).toEqual({ id: 'q1', kind: 'quest', reason: 'a b' });
    expect(out[1]).toEqual({ id: 'q2', kind: 'quest', reason: 'fact 2' });
    expect(out).toHaveLength(8);
    expect(new Set(out.map((k) => k.id)).size).toBe(8);
  });

  it('parses time, budget and food from the text', () => {
    expect(parseFilterText('hungry, 15 min')).toMatchObject({ windowMin: 15, food: true, budget: null, terms: [] });
    expect(parseFilterText('local bands in 2 hours under $12')).toMatchObject({ windowMin: 120, budget: 12, food: false });
  });
});

describe('muse filter: live mode', () => {
  beforeEach(() => { process.env.MUSE_MOCK = '0'; process.env.MUSE_API_KEY = 'test-key'; });
  afterEach(() => { process.env.MUSE_MOCK = '1'; delete process.env.MUSE_API_KEY; });

  it('keeps only ids Muse got from the candidates', async () => {
    setMuseTransport(async () => ({
      content: JSON.stringify({ keep: [{ id: 'made-up-quest', reason: 'invented' }, { id: dumplings, reason: 'you like dumplings, 9 min walk' }], summary: 'One fit.' }),
      usage: { promptTokens: 1, completionTokens: 1 },
    }));
    const out = await runMuseFilter({ ctx: await ctxFor(alex), mode: 'explore', text: '' });
    expect(out.source).toBe('muse');
    expect(out.mode).toBe('live');
    expect(out.keep).toEqual([{ id: dumplings, kind: 'quest', reason: 'you like dumplings, 9 min walk' }]);
  });

  it('an empty keep from Muse becomes the closest plans', async () => {
    setMuseTransport(async () => ({ content: JSON.stringify({ keep: [], summary: 'Nothing.' }), usage: { promptTokens: 1, completionTokens: 1 } }));
    const out = await runMuseFilter({ ctx: await ctxFor(alex), mode: 'explore', text: '' });
    expect(out.closest).toBe(true);
    expect(out.keep).toHaveLength(3);
    expect(out.mode).toBe('live');
  });

  it('falls back to code ranking when Muse fails, and does not cache the fallback', async () => {
    let calls = 0;
    setMuseTransport(async () => { calls++; throw Object.assign(new Error('boom'), { status: 500 }); });
    const ctx = await ctxFor(alex);
    const out = await cachedMuseFilter({ ctx, mode: 'explore', text: '' });
    expect(out.source).toBe('fallback');
    expect(out.keep.length).toBeGreaterThan(0);
    expect(out.keep.length).toBeLessThanOrEqual(8);
    expect(out.keep.map((k) => k.id)).toEqual(expect.arrayContaining([dumplings, bands]));
    expect(out.keep.find((k) => k.id === bands)!.reason).toMatch(/^matches your interest in local bands · .*\d+ min walk$/);
    const before = calls;
    const again = await cachedMuseFilter({ ctx, mode: 'explore', text: '' });
    expect(again.cached).toBe(false);
    expect(calls).toBeGreaterThan(before);
  });

  it('caches a Muse answer for 120 s per viewer, mode and text', async () => {
    let calls = 0;
    setMuseTransport(async () => { calls++; return { content: JSON.stringify({ keep: [{ id: boba, reason: 'boba, 4 min walk' }], summary: 's' }), usage: { promptTokens: 1, completionTokens: 1 } }; });
    const ctx = await ctxFor(alex);
    const t0 = 1_000_000;
    await cachedMuseFilter({ ctx, mode: 'explore', text: 'Boba' }, t0);
    const hit = await cachedMuseFilter({ ctx, mode: 'explore', text: ' boba ' }, t0 + 60_000);
    expect(hit.cached).toBe(true);
    expect(calls).toBe(1);
    await cachedMuseFilter({ ctx, mode: 'explore', text: 'boba' }, t0 + 121_000);
    expect(calls).toBe(2);
  });

  it('fallbackFilter caps at 8 and is marked fallback', async () => {
    const ctx = await ctxFor(alex);
    const scored = scoreQuests(ctx, questCandidates(ctx), '');
    const out = fallbackFilter(scored, 'quest', 'explore', scored.length, '');
    expect(out.source).toBe('fallback');
    expect(out.keep.length).toBeLessThanOrEqual(8);
  });
});
