import { afterAll, describe, expect, it } from 'vitest';
import { DEMO_CENTER, profileId, seedId, setNow } from '@/shared';
import { buildMemoryDb, createMemoryStore } from '@/features/data/memory-store';

const alex = profileId('alex');
const maya = profileId('maya');
const dumplings = seedId('quest', 'dumplings');
const NOW = new Date('2026-11-13T18:00:00Z');
afterAll(() => setNow(null));

describe('demo reset', () => {
  it('puts plans, seats, free windows and shared plans back to the story, timed from now', async () => {
    setNow(NOW);
    const store = createMemoryStore(NOW);
    const at = (min: number) => new Date(NOW.getTime() + min * 60_000).toISOString();
    // a rehearsal: Alex free, joined, a shared plan, and a plan someone posted
    await store.createAvailability(alex, { text: 'hungry', startsAt: at(-1), endsAt: at(60), location: DEMO_CENTER });
    await store.joinQuest(alex, dumplings);
    await store.createTogether(alex, { friendIds: [maya], options: [], summary: '', expiresAt: at(50) });
    const created = await store.createQuest(alex, {
      title: 'Rehearsal plan', emoji: '🎤', category: 'other', description: '', venueName: 'Somewhere',
      location: DEMO_CENTER, startsAt: at(30), endsAt: at(90), capacity: 4, priceMax: 0, tags: [],
    } as never).catch(() => null);
    expect((await store.quest(alex, dumplings)).seatsLeft).toBe(1);

    // an hour later, reset: the story is timed from the new now
    const later = new Date(NOW.getTime() + 60 * 60_000);
    setNow(later);
    const r = await store.resetStory(buildMemoryDb(later));
    expect(r.quests).toBeGreaterThan(10);

    const d = await store.quest(alex, dumplings);
    expect(d.seatsLeft).toBe(2);
    expect(d.members.map((m) => m.id)).not.toContain(alex);
    expect(Math.round((Date.parse(d.quest.startsAt) - later.getTime()) / 60_000)).toBe(25);
    expect(await store.myAvailability(alex)).toEqual([]);
    expect(await store.togetherPlans(alex)).toEqual([]);
    if (created) await expect(store.quest(alex, created.id)).rejects.toMatchObject({ status: 404 });
    // Maya's lunch window is open again
    expect((await store.friendAvailability(alex)).some((a) => a.userId === maya && Date.parse(a.startsAt) <= later.getTime() + 10 * 60_000)).toBe(true);
  });
});

describe('demo reset covers what a thrift rehearsal touches', () => {
  it('removes holds, new watches, photos, ratings and messages, and puts sold listings back', async () => {
    setNow(NOW);
    const store = createMemoryStore(NOW);
    const seed = buildMemoryDb(NOW);
    const b = store.backend;
    const clone = <T extends Record<string, unknown>>(row: T, patch: Partial<T>) => ({ ...row, ...patch });
    const listing = seed.listings[0];
    // a rehearsal: the listing reserved then sold, a hold, a new watch, a selfie, a rating, a message
    await b.update('listings', { id: listing.id } as never, { status: 'sold' } as never);
    const tables = ['listingHolds', 'museWants', 'memories', 'hangoutRatings', 'messages', 'notifications'] as const;
    const before = Object.fromEntries(tables.map((k) => [k, (seed[k] as unknown[]).length]));
    const template = { listingHolds: null, museWants: seed.museWants[0], memories: seed.memories[0], hangoutRatings: seed.hangoutRatings[0], messages: seed.messages[0], notifications: seed.notifications[0] };
    for (const k of tables) {
      const t = template[k] as Record<string, unknown> | null;
      if (!t) continue;
      const extra = k === 'hangoutRatings' ? clone(t, { raterId: profileId('jordan') }) : clone(t, { id: `rehearsal-${k}` });
      await b.insert(k, [extra] as never);
    }
    const s0 = (await store.museContext()).db;
    expect((s0.museWants as unknown[]).length).toBe(before.museWants + 1);

    const later = new Date(NOW.getTime() + 30 * 60_000);
    setNow(later);
    const r = await store.resetStory(buildMemoryDb(later));
    expect(r.cleared).toBeGreaterThanOrEqual(5);
    const db = (await store.museContext()).db;
    for (const k of tables) expect((db[k] as unknown[]).length, k).toBe(before[k]);
    expect(db.listings.find((l) => l.id === listing.id)?.status).toBe(listing.status);
    expect(db.memories.some((m) => m.id === 'rehearsal-memories')).toBe(false);
  });
});
