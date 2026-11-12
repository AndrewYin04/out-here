import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DEMO_CENTER, profileId, seedId, setNow, type TogetherOption } from '@/shared';
import { createMemoryStore } from '@/features/data/memory-store';
import type { CoreStore } from '@/features/data/core';
import { noteForPlan } from '@/features/outhere/server/together';

const alex = profileId('alex');
const maya = profileId('maya');
const jordan = profileId('jordan');
const dumplings = seedId('quest', 'dumplings');

const NOW = new Date('2026-11-13T18:45:00Z');
const at = (min: number) => new Date(NOW.getTime() + min * 60_000).toISOString();
let store: CoreStore;
beforeEach(() => { setNow(NOW); store = createMemoryStore(NOW); });
afterAll(() => setNow(null));

const option = (questId: string): TogetherOption => ({
  questId, title: 'Dumplings before the rush', emoji: '🥟', venueName: 'Dumpling Den',
  startsAt: at(25), priceMax: 12, seatsLeft: 2, reason: 'You both like dumplings · Up to $12 · 2 seats left',
});
const create = (viewer: string, friend: string, expiresAt = at(50)) =>
  store.createTogether(viewer, { friendIds: [friend], options: [option(dumplings)], summary: 'Muse picked a plan that fits both of you.', expiresAt });

describe('plan together', () => {
  it('one open plan per group: the second person to open it gets the same plan', async () => {
    const a = await create(alex, maya);
    const m = await create(maya, alex);
    expect(m.id).toBe(a.id);
    expect(a.memberIds).toEqual([alex, maya].sort());
    expect((await store.togetherPlans(maya)).map((p) => p.id)).toEqual([a.id]);
  });

  it('only members can read it', async () => {
    const a = await create(alex, maya);
    await expect(store.together(jordan, a.id)).rejects.toMatchObject({ status: 404 });
  });

  it('locks when everyone is in on the same option and joins everyone to that quest', async () => {
    const a = await create(alex, maya);
    const first = await store.voteTogether(alex, a.id, dumplings, true);
    expect(first.status).toBe('proposing');
    expect(first.votes[alex]).toEqual([dumplings]);
    const done = await store.voteTogether(maya, a.id, dumplings, true);
    expect(done.status).toBe('confirmed');
    expect(done.confirmedQuestId).toBe(dumplings);
    const quest = await store.quest(alex, dumplings);
    expect(quest.members.map((p) => p.id)).toEqual(expect.arrayContaining([alex, maya]));
  });

  it('taking back "I\'m in" keeps it open', async () => {
    const a = await create(alex, maya);
    await store.voteTogether(alex, a.id, dumplings, true);
    const undone = await store.voteTogether(alex, a.id, dumplings, false);
    await store.voteTogether(maya, a.id, dumplings, true);
    expect(undone.votes[alex]).toEqual([]);
    expect((await store.together(alex, a.id)).status).toBe('proposing');
  });

  it('expires quietly when the shared time ends, and a new one can start', async () => {
    const a = await create(alex, maya, at(10));
    setNow(new Date(NOW.getTime() + 11 * 60_000));
    expect((await store.together(alex, a.id)).status).toBe('expired');
    expect(await store.togetherPlans(alex)).toEqual([]);
    const next = await create(alex, maya, at(60));
    expect(next.id).not.toBe(a.id);
  });

  it('only friends can be in a plan', async () => {
    const v = await store.view();
    const stranger = v.db.profiles.find((p) => p.id !== alex && !v.areFriends(alex, p.id))!;
    await expect(create(alex, stranger.id)).rejects.toMatchObject({ status: 400 });
  });

  it('free-with-me is empty while you are busy, and lists Maya once you are free', async () => {
    expect((await store.freeWithMe(alex)).items).toEqual([]);
    await store.createAvailability(alex, { text: 'hungry', startsAt: at(-1), endsAt: at(60), location: DEMO_CENTER });
    const free = await store.freeWithMe(alex);
    expect(free.items.map((i) => i.friend.id)).toContain(maya);
    await store.clearAvailability(alex);
    expect((await store.freeWithMe(alex)).items).toEqual([]);
  });
});

describe('noteForPlan', () => {
  it('drops time talk so it never fights the real shared window', () => {
    expect(noteForPlan('on a long lunch break, free for the next 45 min')).toBe('on a long lunch break');
    expect(noteForPlan('hungry')).toBe('hungry');
    expect(noteForPlan('free')).toBeNull();
    expect(noteForPlan('30 min')).toBeNull();
    expect(noteForPlan(null)).toBeNull();
  });
});
