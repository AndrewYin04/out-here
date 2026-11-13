import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { profileId, setNow } from '@/shared';
import { createMemoryStore } from '@/features/data/memory-store';
import { subscribe, type RealtimeMessage } from '@/features/data/realtime-server';
import type { CoreStore } from '@/features/data/core';
import { walkLabel } from '@/features/data/walkers';

const id = (h: string) => profileId(h);
let store: CoreStore;
const NOW = new Date('2026-11-12T18:07:00Z');
beforeEach(() => { setNow(NOW); store = createMemoryStore(NOW); });
afterAll(() => setNow(null));

/** An open plan with room for two more, that neither Alex nor Jordan is in yet. */
async function openPlan() {
  const v = await store.view();
  const q = v.db.quests.find((x) => v.isActiveQuest(x) && x.status === 'open'
    && x.capacity - v.questMemberIds(x.id).length >= 2
    && !v.questMemberIds(x.id).some((m) => m === id('alex') || m === id('jordan')));
  if (!q) throw new Error('no open plan in the seed');
  return q;
}
const near = (p: { lat: number; lng: number }) => ({ lat: p.lat + 0.003, lng: p.lng });

describe('walking there together (#46)', () => {
  it('shows a co-member’s walk, even to a stranger, with minutes to the plan', async () => {
    const q = await openPlan();
    await store.joinQuest(id('alex'), q.id);
    await store.joinQuest(id('jordan'), q.id);
    expect((await store.view()).areFriends(id('alex'), id('jordan'))).toBe(false);
    expect(await store.walkers(id('jordan'), q.id)).toEqual([]);
    await store.postWalkStep(id('alex'), q.id, near(q.location));
    const w = await store.walkers(id('jordan'), q.id);
    expect(w.map((x) => x.id)).toEqual([id('alex')]);
    expect(w[0].location).toEqual(near(q.location));
    expect(w[0].minutesAway).toBeGreaterThan(0);
    // Alex never sees himself
    expect(await store.walkers(id('alex'), q.id)).toEqual([]);
  });

  it('is members only, for reading and for posting', async () => {
    const q = await openPlan();
    await store.joinQuest(id('alex'), q.id);
    await expect(store.walkers(id('jordan'), q.id)).rejects.toMatchObject({ status: 403 });
    await expect(store.postWalkStep(id('jordan'), q.id, q.location)).rejects.toMatchObject({ status: 403 });
  });

  it('rejects a step from across town', async () => {
    const q = await openPlan();
    await store.joinQuest(id('alex'), q.id);
    await expect(store.postWalkStep(id('alex'), q.id, { lat: q.location.lat + 0.2, lng: q.location.lng })).rejects.toMatchObject({ status: 403 });
  });

  it('stops showing a walker who has not moved for 10 minutes', async () => {
    const q = await openPlan();
    await store.joinQuest(id('alex'), q.id);
    await store.joinQuest(id('jordan'), q.id);
    await store.postWalkStep(id('alex'), q.id, near(q.location));
    setNow(new Date(NOW.getTime() + 11 * 60_000));
    expect(await store.walkers(id('jordan'), q.id)).toEqual([]);
  });

  it('labels the share with the plan, keeps a new sharer paused, and pings the other members', async () => {
    const q = await openPlan();
    await store.joinQuest(id('alex'), q.id);
    await store.joinQuest(id('jordan'), q.id);
    const before = (await store.view()).db.locationShares.find((s) => s.userId === id('jordan'));
    const got: RealtimeMessage[] = [];
    const off = subscribe((m) => got.push(m));
    await store.postWalkStep(id('jordan'), q.id, near(q.location));
    off();
    const share = (await store.myLocation(id('jordan')))!;
    expect(share.placeLabel).toBe(walkLabel(q));
    if (!before) expect(share.paused).toBe(true);
    else expect(share.paused).toBe(before.paused);
    const walk = got.filter((m) => m.channel === `walk:${q.id}`);
    expect(walk.length).toBeGreaterThan(0);
    // walk:<questId> is public and keyed by a quest id non-members can see: no user id in it (R2).
    const userIds = (await store.view()).db.profiles.map((p) => p.id);
    for (const m of walk) {
      const text = JSON.stringify(m.payload);
      for (const u of userIds) expect(text.includes(u), `walk payload names ${u}`).toBe(false);
    }
    // a walk step every 1.5 s must not refetch the user: hooks (issue #36)
    expect(got.some((m) => m.channel.startsWith('user:'))).toBe(false);
  });
});
