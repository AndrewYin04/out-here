import { beforeAll, describe, expect, it } from 'vitest';
import { profileId, type MuseIntent, type PlanSuggestion } from '@/shared';
import {
  buildCandidates, buildSeedWorld, contextFromWorld, leakedNames, validate,
  type CandidateResult, type PlanContext,
} from '@/features/muse';

const NOW = new Date('2026-11-12T16:00:00-08:00');
const MAYA = profileId('maya');
let world: ReturnType<typeof buildSeedWorld>;
let ctx: PlanContext;
let result: CandidateResult;
const qid = (k: string) => world.questIdByKey.get(k)!;

const intent: MuseIntent = {
  activities: ['food'], budgetMax: 15, windowStart: NOW.toISOString(),
  windowEnd: new Date(NOW.getTime() + 40 * 60_000).toISOString(),
  maxWalkMinutes: null, wantsFriends: true, openToNewPeople: true, vibe: null,
};

function suggestion(over: Partial<PlanSuggestion>): PlanSuggestion {
  return {
    kind: 'join_quest', questId: qid('dumplings'), friendIds: [MAYA], title: 'whatever the model said', emoji: '?',
    reason: 'Dumplings at 4:25 PM, 9 min walk, $12. You and Maya both like dumplings.', bridge: null,
    startsAt: '2000-01-01T00:00:00.000Z', travelMinutes: 1, fitsWindow: true, seatsLeft: 99,
    inviteDraft: 'Hey Maya, dumplings?', ...over,
  };
}

beforeAll(() => {
  world = buildSeedWorld(NOW);
  ctx = contextFromWorld(world, { userId: 'alex', location: null, now: NOW });
  result = buildCandidates({ ...ctx, intent, now: NOW });
});

describe('validate', () => {
  it('rejects invented quest ids and quests that are not candidates', () => {
    const out = validate([
      suggestion({ questId: 'made-up-quest-id' }),
      suggestion({ questId: null }),
      suggestion({ questId: qid('ramen') }),   // real quest, but too far
      suggestion({ questId: qid('sushi') }),   // real quest, over budget
    ], result.candidates, ctx);
    expect(out.suggestions).toHaveLength(0);
    expect(out.issues.map((i) => i.issue)).toEqual([
      'unknown quest id', 'unknown quest id', 'quest is not a candidate', 'quest is not a candidate',
    ]);
  });

  it('recomputes travel, seats, start, title and emoji from data', () => {
    const out = validate([suggestion({})], result.candidates, ctx);
    const s = out.suggestions[0];
    const q = ctx.quests.find((x) => x.id === qid('dumplings'))!;
    expect(s.travelMinutes).toBe(9);
    expect(s.seatsLeft).toBe(2);
    expect(s.startsAt).toBe(q.startsAt);
    expect(s.title).toBe(q.title);
    expect(s.emoji).toBe('🥟');
    expect(s.fitsWindow).toBe(true);
  });

  it('drops invented friend ids and the invite that went with them', () => {
    const out = validate([suggestion({ friendIds: ['ghost-friend'], inviteDraft: 'Hey ghost' })], result.candidates, ctx);
    expect(out.suggestions[0].friendIds).toEqual([]);
    expect(out.suggestions[0].inviteDraft).toBeNull();
  });

  it('replaces text that names someone outside the plan', () => {
    const out = validate([
      suggestion({ reason: 'Jordan from your coworkers is going.', bridge: 'Priya is free too.' }),
    ], result.candidates, ctx);
    expect(out.suggestions[0].reason).toMatch(/dumplings/i); // the card shows venue, time and price; the reason says why
    expect(out.suggestions[0].reason).not.toContain('Jordan');
    expect(out.suggestions[0].bridge ?? '').not.toContain('Priya');
  });

  it('dedupes and caps at 3', () => {
    const many = [qid('dumplings'), qid('dumplings'), qid('boba')].map((id) => suggestion({ questId: id, friendIds: [] }));
    const out = validate(many, result.candidates, ctx);
    expect(out.suggestions.map((s) => s.questId)).toEqual([qid('dumplings'), qid('boba')]);
  });
});

describe('leakedNames', () => {
  it('finds first names that are not allowed', () => {
    const known = [{ id: 'a', firstName: 'Maya' }, { id: 'b', firstName: 'Sam' }];
    expect(leakedNames("Maya's friend Sam is going", known, new Set(['a']))).toEqual(['Sam']);
    expect(leakedNames('Sample the dumplings', known, new Set())).toEqual([]);
  });
});
