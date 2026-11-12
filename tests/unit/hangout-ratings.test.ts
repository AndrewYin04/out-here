import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PERSONA_HANDLES, profileId, seedId, setNow, VERDICT_RANGES } from '@/shared';
import { createMemoryStore } from '@/features/data/memory-store';
import type { CoreStore } from '@/features/data/core';
import {
  answerComparison, bucketMidpoint, MAX_COMPARISONS, nextComparison, placementIndex, rankOf, scoreAt, startPlacement,
} from '@/features/memories/placement';

const alex = profileId('alex');
const maya = profileId('maya');
const pastDumplings = seedId('quest', 'past-dumplings');
const pastSunset = seedId('quest', 'past-sunset');
const dumplings = seedId('quest', 'dumplings');

const NOW = new Date('2026-11-12T18:07:00Z');
let store: CoreStore;
beforeEach(() => { setNow(NOW); store = createMemoryStore(NOW); });
afterAll(() => setNow(null));

/** Runs the binary search with an oracle that knows the true slot. */
function place(count: number, trueSlot: number) {
  let p = startPlacement(count);
  let asked = 0;
  for (let i = nextComparison(p); i !== null; i = nextComparison(p)) {
    asked++;
    p = answerComparison(p, trueSlot <= i);
  }
  return { index: placementIndex(p), asked };
}

describe('placement math', () => {
  it('an empty bucket, or a skip, gives the bucket midpoint', () => {
    expect(bucketMidpoint('loved')).toBe(8.4);
    expect(bucketMidpoint('fine')).toBe(5);
    expect(bucketMidpoint('meh')).toBe(1.7);
    expect(scoreAt('loved', [], 0)).toBe(8.4);
    expect(nextComparison(startPlacement(0))).toBeNull();
  });

  it('binary search finds the exact slot in up to 7 items within 3 comparisons', () => {
    for (let n = 1; n <= 7; n++) {
      for (let slot = 0; slot <= n; slot++) {
        const r = place(n, slot);
        expect(r.index).toBe(slot);
        expect(r.asked).toBeLessThanOrEqual(MAX_COMPARISONS);
      }
    }
  });

  it('never asks more than 3 questions for a long list', () => {
    expect(place(40, 17).asked).toBe(3);
    expect(place(40, 0).index).toBeLessThanOrEqual(5);
  });

  it('scores land between neighbours and inside the bucket range', () => {
    const loved = [9.2, 8.0];
    expect(scoreAt('loved', loved, 0)).toBe(9.6);   // better than everything: between 10 and 9.2
    expect(scoreAt('loved', loved, 1)).toBe(8.6);   // between 9.2 and 8.0
    expect(scoreAt('loved', loved, 2)).toBe(7.4);   // worst: between 8.0 and 6.7
    for (const v of ['loved', 'fine', 'meh'] as const) {
      const [lo, hi] = VERDICT_RANGES[v];
      for (let i = 0; i <= 3; i++) {
        const s = scoreAt(v, [hi, (hi + lo) / 2, lo], i);
        expect(s).toBeGreaterThanOrEqual(lo);
        expect(s).toBeLessThanOrEqual(hi);
      }
    }
  });

  it('rank counts only strictly higher scores', () => {
    expect(rankOf(8.4, [9.2, 8.4, 8.0])).toBe(2);
    expect(rankOf(9.9, [9.2])).toBe(1);
  });
});

describe('ratings store: server rules', () => {
  const body = { verdict: 'loved' as const, score: 8.6, highlights: ['good food'], again: [] as { subjectId: string; again: boolean }[] };

  it('seeds Alex\'s 3 crewed hangouts, a mutual yes with Maya, and one no about a non-demo persona', async () => {
    const ratings = await store.hangoutRatings(alex);
    expect(ratings).toHaveLength(3);
    expect(ratings.map((r) => r.score)).toEqual([...ratings.map((r) => r.score)].sort((a, b) => b - a));
    expect(await store.mutualHangAgain(alex, maya)).toBe('both_yes');
    const no = (await store.hangAgainSignals(alex)).filter((a) => !a.again);
    expect(no).toHaveLength(1);
    const v = await store.view();
    const handle = v.profileById.get(no[0].subjectId)!.handle;
    expect((PERSONA_HANDLES as readonly string[]).includes(handle)).toBe(false);
    expect(await store.mutualHangAgain(alex, no[0].subjectId)).toBe('one_no');
    expect((await store.hangAgainAbout(alex)).every((a) => a.subjectId === alex)).toBe(true);
  });

  it('state has only the viewer\'s own rating and answers, other attendees, and past ratings', async () => {
    const s = await store.ratingState(alex, pastDumplings);
    expect(s.rating?.raterId).toBe(alex);
    expect(s.again.find((a) => a.subjectId === maya)?.again).toBe(true);
    expect(s.attendees.map((p) => p.id)).not.toContain(alex);
    expect(s.attendees.map((p) => p.id)).toContain(maya);
    expect(s.compareWith.map((c) => c.questId)).not.toContain(pastDumplings);
    expect(s.compareWith).toHaveLength(2);
    // Maya's state never carries Alex's note or answers
    const m = await store.ratingState(maya, pastDumplings);
    expect(JSON.stringify(m)).not.toContain('Best $12');
    expect(m.again.every((a) => a.subjectId !== maya)).toBe(true);
  });

  it('only members rate, and only after the start time', async () => {
    const v = await store.view();
    const outsider = v.db.profiles.find((p) => !v.questMemberIds(pastDumplings).includes(p.id))!;
    await expect(store.rateHangout(outsider.id, pastDumplings, body)).rejects.toMatchObject({ status: 403 });
    await expect(store.ratingState(outsider.id, pastDumplings)).rejects.toMatchObject({ status: 403 });
    const host = v.questById.get(dumplings)!.hostId;
    await expect(store.rateHangout(host, dumplings, body)).rejects.toMatchObject({ status: 409 });
  });

  it('rejects a score outside the bucket, unknown highlights, self or non-member subjects, and foreign photos', async () => {
    const v = await store.view();
    await expect(store.rateHangout(alex, pastDumplings, { ...body, score: 6.6 })).rejects.toMatchObject({ status: 400 });
    await expect(store.rateHangout(alex, pastDumplings, { ...body, verdict: 'meh', score: 5 })).rejects.toMatchObject({ status: 400 });
    await expect(store.rateHangout(alex, pastDumplings, { ...body, highlights: ['free pizza'] })).rejects.toMatchObject({ status: 400 });
    await expect(store.rateHangout(alex, pastDumplings, { ...body, again: [{ subjectId: alex, again: true }] })).rejects.toMatchObject({ status: 400 });
    const stranger = v.db.profiles.find((p) => !v.questMemberIds(pastDumplings).includes(p.id))!;
    await expect(store.rateHangout(alex, pastDumplings, { ...body, again: [{ subjectId: stranger.id, again: true }] })).rejects.toMatchObject({ status: 400 });
    const otherPhoto = v.db.memories.find((m) => m.questId !== pastDumplings)!;
    await expect(store.rateHangout(alex, pastDumplings, { ...body, photoIds: [otherPhoto.id] })).rejects.toMatchObject({ status: 400 });
  });

  it('PUT is an upsert: same id, new score, and a dropped person becomes unanswered', async () => {
    const before = (await store.ratingState(alex, pastDumplings)).rating!;
    const others = (await store.ratingState(alex, pastDumplings)).attendees.map((p) => p.id).filter((id) => id !== maya);
    const r = await store.rateHangout(alex, pastDumplings, { ...body, again: [{ subjectId: maya, again: true }] });
    expect(r.id).toBe(before.id);
    expect(r.score).toBe(8.6);
    expect(r.createdAt).toBe(before.createdAt);
    const after = await store.ratingState(alex, pastDumplings);
    expect(after.again).toEqual([{ subjectId: maya, again: true }]);
    expect((await store.hangAgainSignals(alex)).some((a) => a.questId === pastDumplings && others.includes(a.subjectId))).toBe(false);
  });

  it('the recap has counts and chips only: no hang-again data and no other rater\'s note', async () => {
    const recap = await store.hangoutRecap(maya, pastDumplings);
    expect(recap.ratedCount).toBeGreaterThanOrEqual(2);
    expect(recap.verdicts.loved).toBe(recap.ratedCount);
    expect(recap.highlights[0]).toEqual({ label: 'good food', count: recap.ratedCount });
    expect(recap.photos.every((p) => p.questId === pastDumplings)).toBe(true);
    expect(recap.myRating?.raterId).toBe(maya);
    const text = JSON.stringify(recap);
    expect(text).not.toContain('Best $12');
    expect(text).not.toMatch(/"again"|subjectId|hangAgain/);
    const v = await store.view();
    const outsider = v.db.profiles.find((p) => !v.questMemberIds(pastSunset).includes(p.id))!;
    await expect(store.hangoutRecap(outsider.id, pastSunset)).rejects.toMatchObject({ status: 403 });
  });

  it('own history is sorted by score with the quest attached', async () => {
    const mine = await store.myRatings(alex);
    expect(mine.map((r) => r.quest.id)).toContain(pastDumplings);
    expect(mine[0].score).toBeGreaterThanOrEqual(mine[mine.length - 1].score);
  });

  it('completing a hangout asks every member to rate it, once', async () => {
    const q = await store.createQuest(alex, {
      title: 'Test hang', emoji: '🧪', category: 'other', description: '', venueName: 'Test courtyard',
      location: { lat: 37.4847, lng: -122.1477 }, startsAt: new Date(NOW.getTime() - 30 * 60_000).toISOString(),
      endsAt: new Date(NOW.getTime() + 30 * 60_000).toISOString(), capacity: 4, priceMax: 0, tags: [], isPublic: true, groupId: null, placeId: null,
    });
    await store.joinQuest(maya, q.id);
    await store.completeQuest(maya, q.id);
    await store.completeQuest(alex, q.id);
    const v = await store.view();
    const rows = v.db.notifications.filter((n) => n.type === 'hangout_rate' && n.objectId === q.id);
    expect(rows.map((n) => n.recipientId).sort()).toEqual([alex, maya].sort());
    const n = (await store.notifications(maya)).notifications.find((x) => x.type === 'hangout_rate' && x.objectId === q.id)!;
    expect(n.href).toBe(`/memories?rate=${q.id}`);
    expect(n.text).toContain('How was Test courtyard?');
    const r = await store.rateHangout(maya, q.id, { verdict: 'fine', score: 5, highlights: [], again: [{ subjectId: alex, again: true }] });
    expect(r.verdict).toBe('fine');
  });

  it('a hangout whose end time passed asks its unrated members when they open notifications', async () => {
    const q = await store.createQuest(alex, {
      title: 'Ended hang', emoji: '🧪', category: 'other', description: '', venueName: 'Ended spot',
      location: { lat: 37.4847, lng: -122.1477 }, startsAt: new Date(NOW.getTime() - 3 * 3600_000).toISOString(),
      endsAt: new Date(NOW.getTime() - 3600_000).toISOString(), capacity: 4, priceMax: 0, tags: [], isPublic: true, groupId: null, placeId: null,
    });
    const first = await store.notifications(alex);
    expect(first.notifications.filter((n) => n.type === 'hangout_rate' && n.objectId === q.id)).toHaveLength(1);
    await store.notifications(alex);
    const v = await store.view();
    expect(v.db.notifications.filter((n) => n.type === 'hangout_rate' && n.objectId === q.id)).toHaveLength(1);
    // seeded past hangouts are already rated, so they do not prompt
    expect(v.db.notifications.some((n) => n.type === 'hangout_rate' && n.objectId === pastDumplings)).toBe(false);
  });
});
