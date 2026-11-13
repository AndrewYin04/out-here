import { beforeAll, describe, expect, it } from 'vitest';
import { DEMO_CENTER, profileId, walkingMinutesExact, type MuseIntent } from '@/shared';
import {
  activityMatches, buildCandidates, buildSeedWorld, contextFromWorld, isFoodCompatible, type PlanContext,
} from '@/features/muse';

const NOW = new Date('2026-11-12T16:00:00-08:00');
const MAYA = profileId('maya');

function intent(minutes: number, extra: Partial<MuseIntent> = {}): MuseIntent {
  return {
    activities: ['food'], budgetMax: 15,
    windowStart: NOW.toISOString(), windowEnd: new Date(NOW.getTime() + minutes * 60_000).toISOString(),
    maxWalkMinutes: null, wantsFriends: true, openToNewPeople: true, vibe: null, ...extra,
  };
}

let world: ReturnType<typeof buildSeedWorld>;
let ctx: PlanContext;
const qid = (key: string) => world.questIdByKey.get(key)!;
const run = (i: MuseIntent) => buildCandidates({
  intent: i, viewer: ctx.viewer, friends: ctx.friends, friendAvailability: ctx.friendAvailability,
  quests: ctx.quests, location: ctx.location, now: NOW,
});

beforeAll(() => {
  world = buildSeedWorld(NOW);
  ctx = contextFromWorld(world, { userId: 'alex', location: null, now: NOW });
});

describe('seed numbers the demo depends on', () => {
  it('matches the story: dumplings 9.1 min $12 2 seats, ramen 28 min, sushi $26, boba 4 min $7', () => {
    const q = (k: string) => ctx.quests.find((x) => x.id === qid(k))!;
    expect(walkingMinutesExact(DEMO_CENTER, q('dumplings').location)).toBeCloseTo(9.1, 1);
    expect(q('dumplings').priceMax).toBe(12);
    expect(q('dumplings').capacity - q('dumplings').memberIds.length).toBe(2);
    expect(walkingMinutesExact(DEMO_CENTER, q('ramen').location)).toBeCloseTo(28.0, 1);
    expect(q('sushi').priceMax).toBe(26);
    expect(walkingMinutesExact(DEMO_CENTER, q('boba').location)).toBeCloseTo(4.1, 1);
    expect(q('boba').priceMax).toBe(7);
  });

  it('Alex and Maya are friends and Maya has shared availability', () => {
    expect(ctx.friends.map((f) => f.profile.id)).toContain(MAYA);
    expect(ctx.friendAvailability.some((a) => a.userId === MAYA)).toBe(true);
    expect(ctx.location).toEqual(DEMO_CENTER);
  });
});

describe('buildCandidates: "hungry, got like 40 min, under $15"', () => {
  it('keeps Dumpling Den with Maya, drops ramen for the walk and sushi for the price', () => {
    const r = run(intent(40));
    const ids = r.candidates.map((c) => c.questId);
    expect(ids).toContain(qid('dumplings'));
    expect(ids).not.toContain(qid('ramen'));
    expect(ids).not.toContain(qid('sushi'));
    expect(r.dropped.find((d) => d.questId === qid('ramen'))?.reason).toBe('walk');
    expect(r.dropped.find((d) => d.questId === qid('sushi'))?.reason).toBe('budget');

    const d = r.candidates.find((c) => c.questId === qid('dumplings'))!;
    expect(d.travelMinutes).toBe(9);
    expect(d.seatsLeft).toBe(2);
    expect(d.fitsWindow).toBe(true);
    expect(d.underBudget).toBe(true);
    expect(d.friendOverlap.map((f) => f.friendId)).toEqual([MAYA]);
    expect(d.friendOverlap[0].sharedWithQuest).toContain('dumplings');
  });

  it('counts the boba quest as food-compatible (snack/drinks tags); it starts after the window', () => {
    const r = run(intent(40));
    expect(r.candidates.map((c) => c.questId)).not.toContain(qid('boba'));
    expect(r.dropped.find((d) => d.questId === qid('boba'))?.reason).toBe('window');
    const boba = ctx.quests.find((q) => q.id === qid('boba'))!;
    expect(boba.category).toBe('art');
    expect(isFoodCompatible(boba)).toBe(true);
  });

  it('never lets non-food quests through for a hunger intent', () => {
    const r = run(intent(40));
    expect(r.candidates.map((c) => c.questId)).not.toContain(qid('volleyball'));
    expect(r.dropped.find((d) => d.questId === qid('volleyball'))?.reason).toBe('activity');
  });
});

describe('buildCandidates: "hungry, 15 min"', () => {
  it('leaves nothing: dumplings and the afternoon boba quest start after the window', () => {
    const r = run(intent(15, { budgetMax: null }));
    expect(r.candidates.map((c) => c.questId)).toEqual([]);
    expect(r.dropped.find((d) => d.questId === qid('dumplings'))?.reason).toBe('window');
    expect(r.dropped.find((d) => d.questId === qid('boba'))?.reason).toBe('window');
  });
});

describe('time-fit includes walking time', () => {
  it('drops a quest the viewer cannot reach before it starts, even with a higher walk cap', () => {
    const r = run(intent(180, { activities: ['ramen'], budgetMax: null, maxWalkMinutes: 30 }));
    expect(r.candidates).toHaveLength(0);
    expect(r.dropped.find((d) => d.questId === qid('ramen'))?.reason).toBe('late');
  });

  it('a window that starts later counts walking from the window start', () => {
    const start = new Date(NOW.getTime() + 20 * 60_000).toISOString();
    const end = new Date(NOW.getTime() + 60 * 60_000).toISOString();
    // dumplings start at +25; leaving at +20 with a 9 min walk arrives late
    const r = run({ ...intent(60), windowStart: start, windowEnd: end, activities: ['dumplings'] });
    expect(r.dropped.find((d) => d.questId === qid('dumplings'))?.reason).toBe('late');
  });

  it('drops full and already-joined quests', () => {
    const quests = ctx.quests.map((q) =>
      q.id === qid('boba') ? { ...q, memberIds: [...q.memberIds, ctx.viewer.id] }
        : q.id === qid('dumplings') ? { ...q, memberIds: [...q.memberIds, 'x1', 'x2'] } : q);
    const r = buildCandidates({ ...ctx, intent: intent(40), quests, now: NOW });
    expect(r.candidates).toHaveLength(0);
    expect(r.dropped.find((d) => d.questId === qid('boba'))?.reason).toBe('already_member');
    expect(r.dropped.find((d) => d.questId === qid('dumplings'))?.reason).toBe('full');
  });
});

describe('activityMatches', () => {
  it('maps hunger words to food-compatible quests and named things to tags', () => {
    const q = (k: string) => ctx.quests.find((x) => x.id === qid(k))!;
    expect(activityMatches('hungry', q('dumplings'))).toBe(true);
    expect(activityMatches('eat', q('volleyball'))).toBe(false);
    expect(activityMatches('climbing', q('bouldering'))).toBe(true);
    expect(activityMatches('music', q('band-pregame'))).toBe(true);
    expect(activityMatches('board games', q('board-games'))).toBe(true);
    expect(activityMatches('board games', q('smash'))).toBe(false);
    expect(activityMatches('meet people', q('smash'))).toBeNull();
  });
});
