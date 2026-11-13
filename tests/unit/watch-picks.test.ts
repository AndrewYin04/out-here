import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DEMO_CENTER, offsetPoint, profileId, setNow } from '@/shared';
import { createMemoryStore } from '@/features/data/memory-store';
import type { CoreStore } from '@/features/data/core';
import { checkReason, marketplacePicks, mockTaste, setMuseTransport, validateTaste, type PicksInput } from '@/features/muse';

const alex = profileId('alex');
const maya = profileId('maya');
const NOW = new Date('2026-11-13T17:00:00Z'); // 9:00 AM PT
const saved = { ...process.env };
let store: CoreStore;

beforeEach(() => {
  setNow(NOW);
  process.env.MUSE_MOCK = '1';
  process.env.MUSE_QUIET = '1';
  store = createMemoryStore(NOW);
});
afterAll(() => { setNow(null); process.env = { ...saved }; setMuseTransport(null); });

async function picks(exclude: string[] = []) {
  const ctx = await store.marketplaceContext(alex);
  return marketplacePicks({ ...ctx, origin: DEMO_CENTER, at: new Date(), exclude, userId: alex });
}
const titles = (r: Awaited<ReturnType<typeof picks>>) => r.picks.map((p) => p.listing.title);
const addComics = () => store.createListing(maya, {
  title: 'Box of indie comics', priceUsd: 20, category: 'Books',
  description: 'About 40 small-press comics and zines, clearing out my shelf.',
  location: offsetPoint(DEMO_CENTER, 600, 120), pickupSpot: 'Porch', pickupUntil: new Date(NOW.getTime() + 3 * 3600_000).toISOString(),
});

describe('watch history', () => {
  it('seeds Alex\'s week, aggregated per video', async () => {
    const w = await store.watch(alex);
    expect(w.videos.length).toBeGreaterThanOrEqual(12);
    const ink = w.history.find((h) => h.videoKey === 'ink-timelapse')!;
    expect(ink.seconds).toBe(540 + 120);
    expect(w.history.some((h) => h.videoKey.startsWith('film'))).toBe(false);
  });
  it('records a view and rejects an unknown video', async () => {
    await store.recordWatch(alex, 'film-basics', 8);
    expect((await store.watch(alex)).history[0]).toMatchObject({ videoKey: 'film-basics', seconds: 8 });
    await expect(store.recordWatch(alex, 'nope', 8)).rejects.toMatchObject({ status: 404 });
  });
});

describe('taste', () => {
  it('groups the seed into comics and music, and skips seconds-long views', async () => {
    const { history } = await store.marketplaceContext(alex);
    const topics = validateTaste(mockTaste(history), history, NOW);
    const names = topics.map((t) => t.name);
    expect(names[0]).toMatch(/comic/);
    expect(names.some((n) => /band|music|bass/.test(n))).toBe(true);
    expect(names.some((n) => /volley|climb/.test(n))).toBe(false);
    expect(topics[0].minutes).toBeGreaterThanOrEqual(20);
  });
  it('drops invented video keys and topics without enough watching', async () => {
    const { history } = await store.marketplaceContext(alex);
    const topics = validateTaste({
      topics: [
        { name: 'Comics', why: 'x', evidence: ['ink-timelapse', 'made-up-video'] },
        { name: 'volleyball', why: 'x', evidence: ['volley-rally'] },
        { name: 'skydiving', why: 'x', evidence: ['made-up-video'] },
      ],
    }, history, NOW);
    expect(topics.map((t) => t.name)).toEqual(['comics']);
    expect(topics[0].evidence.map((e) => e.video.key)).toEqual(['ink-timelapse']);
  });
});

describe('Marketplace picks', () => {
  it('shows only items that match what Alex watches, and hides the rest', async () => {
    const r = await picks();
    expect(r.source).toBe('mock');
    expect(r.picks.length).toBeGreaterThan(0);
    expect(titles(r).some((t) => /bass/i.test(t))).toBe(true);
    expect(titles(r).some((t) => /camera|monstera|rice cooker|bed frame/i.test(t))).toBe(false);
    expect(r.picks.length + r.hidden.length).toBe(r.checked);
    for (const p of r.picks) expect(p.evidence.length).toBeGreaterThan(0);
  });

  it('a comics listing ranks first, with the comics videos as evidence', async () => {
    await addComics();
    const r = await picks();
    expect(r.picks[0].listing.title).toBe('Box of indie comics');
    expect(r.picks[0].topic).toMatch(/comic/);
    expect(r.picks[0].evidence.map((e) => e.video.key)).toContain('ink-timelapse');
    expect(r.picks[0].reason).toMatch(/min of comics videos/);
  });

  it('watching a film video just now adds the film camera, marked new', async () => {
    expect(titles(await picks()).some((t) => /film camera/i.test(t))).toBe(false);
    await store.recordWatch(alex, 'film-basics', 8);
    const r = await picks();
    const cam = r.picks.find((p) => /film camera/i.test(p.listing.title));
    expect(cam).toBeTruthy();
    expect(cam!.isNew).toBe(true);
    expect(cam!.reason).toMatch(/^You just watched "35mm film for beginners/);
  });

  it('the pop-up: Maya (denim Reels) gets the denim bag first, citing the Reel, not the track jacket', async () => {
    const at = { location: offsetPoint(DEMO_CENTER, 50, 0), pickupLabel: 'Campus Thrift Pop-Up', pickupSpot: 'Bike racks',
      pickupUntil: new Date(NOW.getTime() + 2 * 3600_000).toISOString() };
    const leo = profileId('leo');
    await store.createListing(leo, { title: 'Vintage track jacket', priceUsd: 20, category: 'Clothing',
      description: 'Zip-up track jacket, size M, barely worn. At the Campus Thrift Pop-Up today only.', ...at });
    await store.createListing(leo, { title: 'Y2K denim shoulder bag', priceUsd: 15, category: 'Clothing',
      description: 'Early-2000s denim purse with a short shoulder strap. At the Campus Thrift Pop-Up today only.', ...at });
    const ctx = await store.marketplaceContext(maya);
    const r = await marketplacePicks({ ...ctx, origin: DEMO_CENTER, at: new Date(), exclude: [], userId: maya });
    const order = titles(r).filter((t) => /track jacket|denim shoulder bag/i.test(t));
    expect(order[0]).toBe('Y2K denim shoulder bag');
    expect(r.picks.find((p) => p.listing.title === 'Y2K denim shoulder bag')!.reason).toMatch(/the Reel "5 ways to style one vintage denim jacket"/);
  });

  it('switching a topic off removes its items', async () => {
    const before = await picks();
    const music = before.topics.find((t) => /band|music|bass/.test(t.name))!.name;
    const after = await picks([music]);
    expect(titles(after).some((t) => /bass/i.test(t))).toBe(false);
  });

  it('a live pick that names an unknown listing, a stretched topic or a wrong number is not shown as is', async () => {
    delete process.env.MUSE_MOCK;
    process.env.MUSE_API_KEY = 'test-key-not-real';
    process.env.MUSE_CACHE = '0';
    await addComics();
    const ctx = await store.marketplaceContext(alex);
    const comicsId = `c${ctx.listings.findIndex((l) => l.listing.title === 'Box of indie comics') + 1}`;
    const lampId = `c${ctx.listings.findIndex((l) => /lamp/i.test(l.listing.title)) + 1}`;
    setMuseTransport(async (req) => {
      if (req.schemaName === 'taste') {
        return { content: JSON.stringify({ topics: [{ name: 'comics', why: 'Lots of comics.', evidence: ['ink-timelapse', 'comic-haul', 'panel-layout', 'zine-fold'] }] }), usage: { promptTokens: 1, completionTokens: 1 } };
      }
      return {
        content: JSON.stringify({ picks: [
          { candidate: comicsId, topic: 'comics', reason: 'You watched 99 min of comics, and this box is $5.' },
          { candidate: lampId, topic: 'comics', reason: 'Good light for drawing comics.' },
          { candidate: 'c999', topic: 'comics', reason: 'x' },
        ] }),
        usage: { promptTokens: 1, completionTokens: 1 },
      };
    });
    const r = await marketplacePicks({ ...ctx, origin: DEMO_CENTER, at: new Date(), exclude: [], userId: alex } as PicksInput);
    setMuseTransport(null);
    expect(r.source).toBe('muse');
    expect(titles(r)).toEqual(['Box of indie comics']);
    expect(r.picks[0].reason).not.toMatch(/99|\$5/);
    expect(r.picks[0].reason).toMatch(/min of comics videos/);
  });
});

describe('checkReason', () => {
  it('accepts the facts and rejects anything else', async () => {
    await addComics();
    const ctx = await store.marketplaceContext(alex);
    const topics = validateTaste(mockTaste(ctx.history), ctx.history, NOW);
    const c = { ...ctx.listings.find((l) => l.listing.title === 'Box of indie comics')!, id: 'c1', words: new Set<string>() };
    const t = topics[0];
    expect(checkReason(`You've watched ${t.minutes} min of comics videos; this box is $20.`, t, c)).toBeNull();
    expect(checkReason('This box is $15.', t, c)).toMatch(/\$15/);
    expect(checkReason('You watched 3 hours... 45 min of comics.', t, c)).toMatch(/45 min/);
  });
});

describe('pick request lifecycle metadata', () => {
  it('identifies a memoized pick response without inferring cache from its latency', async () => {
    const ctx = await store.marketplaceContext(alex);
    const input: PicksInput = { ...ctx, origin: DEMO_CENTER, at: new Date('2026-12-11T17:00:00Z'), exclude: ['fixture-cache-check'], userId: alex };
    const first = await marketplacePicks(input);
    const second = await marketplacePicks(input);
    expect(second.cached).toBe(true);
    expect(second.picks).toEqual(first.picks);
    expect(second.source).toBe(first.source);
  });

  it('rejects an already cancelled request even when its inputs could have a cached result', async () => {
    const ctx = await store.marketplaceContext(alex);
    const controller = new AbortController();
    controller.abort();
    await expect(marketplacePicks({ ...ctx, origin: DEMO_CENTER, at: NOW, exclude: [], userId: alex, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });
});
