import { describe, expect, it } from 'vitest';
import type { PlanCandidate } from '../../src/features/muse/candidates';
import { rankPrompt, REASON_FACT_RULE } from '../../src/features/muse/prompts/rank';
import { concreteReason, factReason, hasConcreteFact } from '../../src/features/muse/prompts/reason-facts';
import { validate } from '../../src/features/muse/validate';
import type { MuseIntent, PlanSuggestion, Quest } from '../../src/shared';

const NOW = new Date('2026-11-13T18:00:00.000Z');
const at = (min: number) => new Date(NOW.getTime() + min * 60_000).toISOString();
const LOC = { lat: 37.4847, lng: -122.1477 };

const quest: Quest = {
  id: 'q-boba', hostId: 'h', title: 'Boba + sketching', emoji: '🧋', category: 'food', description: '',
  venueName: 'Tea Lab', location: LOC, approxLocation: LOC, startsAt: at(9), endsAt: at(60),
  capacity: 6, memberIds: ['h'], priceMax: 7, tags: ['boba', 'sketching'], status: 'open', isPublic: true,
  createdAt: at(-60), groupId: null, placeId: null,
};

const candidate = (over: Partial<PlanCandidate> = {}): PlanCandidate => ({
  questId: quest.id, quest, travelMinutes: 4, travelMinutesExact: 4, arriveAt: at(4), fitsWindow: true,
  underBudget: true, seatsLeft: 5, matchedActivities: [], specificMatch: false, viewerInterests: [],
  friendOverlap: [], friendMembers: [], ...over,
});

describe('rank prompt: reasons cite a concrete fact', () => {
  it('the system prompt contains the concrete-fact rule and bans generic phrases', () => {
    const msgs = rankPrompt({
      userName: 'Alex', text: 'thirsty, 15 min', windowLabel: '15 min', budget: 'not stated',
      wantsFriends: false, openToNewPeople: true, vibe: null, candidates: [],
    });
    const system = msgs[0].content;
    expect(system).toContain(REASON_FACT_RULE);
    expect(system).toMatch(/at least one concrete fact/);
    expect(system).toContain('fits your time best');
    expect(system).not.toMatch(/never repeat those/);
  });

  it('accepts reasons with a number, an interest by name, or a friend', () => {
    const c = candidate({ matchedActivities: ['boba'] });
    expect(hasConcreteFact('You asked for boba and this is the closest.', c)).toBe(true);
    expect(hasConcreteFact('Only a 4 min walk.', c)).toBe(true);
    const withMaya = candidate({
      friendOverlap: [{
        friendId: 'maya', availabilityId: 'a', firstName: 'Maya', availabilityText: '', freeFrom: at(0), freeUntil: at(60),
        sharedWithViewer: [], status: null, sharedWithQuest: ['sketching'], travelMinutes: 5,
      }],
    });
    expect(hasConcreteFact('Maya would like this one.', withMaya)).toBe(true);
  });

  it('replaces a generic reason with "4 min walk, $7, starts in 9 min"', () => {
    const c = candidate();
    expect(hasConcreteFact('It is the open plan nearby that fits your time best.', c)).toBe(false);
    expect(hasConcreteFact('It is the food plan that fits your time best.', candidate({ matchedActivities: ['food'] }))).toBe(false);
    expect(factReason(c, NOW)).toBe('4 min walk, $7, starts in 9 min.');
    expect(concreteReason('Fits your time best.', c, NOW)).toBe('4 min walk, $7, starts in 9 min.');
    expect(concreteReason('Good for boba fans.', c, NOW)).toBe('Good for boba fans.');
  });

  it('validate() falls back to the fact-based reason when the model reason has no fact', () => {
    const intent: MuseIntent = {
      activities: ['drinks'], budgetMax: null, windowStart: at(0), windowEnd: at(40), maxWalkMinutes: null,
      wantsFriends: false, openToNewPeople: true, vibe: null,
    };
    const s: PlanSuggestion = {
      kind: 'join_quest', questId: quest.id, friendIds: [], title: quest.title, emoji: quest.emoji,
      reason: 'This one fits your time best.', bridge: null, startsAt: quest.startsAt, travelMinutes: 4,
      fitsWindow: true, seatsLeft: 5, inviteDraft: null,
    };
    const ctx = { quests: [quest], friends: [], location: LOC, viewer: { id: 'alex' }, knownPeople: [] };
    const out = validate([s], [candidate()], ctx as never, { intent, text: 'thirsty', now: NOW });
    expect(out.suggestions).toHaveLength(1);
    expect(out.suggestions[0].reason).toMatch(/^\d+ min walk, \$7, starts in 9 min\.$/);
  });
});
