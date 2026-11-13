import { describe, expect, it } from 'vitest';
import type { PlanCandidate } from '../../src/features/muse/candidates';
import { rankPrompt, REASON_FACT_RULE } from '../../src/features/muse/prompts/rank';
import { concreteReason, factReason, hasConcreteFact, statusPhrase } from '../../src/features/muse/prompts/reason-facts';
import { validate } from '../../src/features/muse/validate';
import type { MuseIntent, PlanSuggestion, Quest } from '../../src/shared';

const NOW = new Date('2026-11-13T18:00:00.000Z');
const at = (min: number) => new Date(NOW.getTime() + min * 60_000).toISOString();
const LOC = { lat: 37.4847, lng: -122.1477 };

const quest: Quest = {
  id: 'q-boba', hostId: 'h', title: 'Boba + sketching', emoji: '🧋', category: 'food', description: '',
  venueName: 'Tea Lab', location: LOC, approxLocation: LOC, startsAt: at(9), endsAt: at(60),
  capacity: 6, memberIds: ['h'], priceMax: 7, tags: ['boba', 'sketching'], status: 'open', isPublic: true,
  createdAt: at(-60), groupId: null, placeId: null, visibility: 'community', posterUrl: null, bubbleText: null,
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

  it('replaces a generic reason with a concrete fit, never the budget alone', () => {
    const c = candidate();
    expect(hasConcreteFact('It is the open plan nearby that fits your time best.', c)).toBe(false);
    expect(hasConcreteFact('It is the food plan that fits your time best.', candidate({ matchedActivities: ['food'] }))).toBe(false);
    expect(concreteReason('Good for boba fans.', c)).toBe('Good for boba fans.');
    // no friend and no named interest: the window and the budget left, never the meta row's walk, start or price
    const ask = { budgetMax: 15, windowStart: at(0), windowEnd: at(15), now: NOW };
    expect(concreteReason('Fits your time best.', c, ask)).toBe('Fits inside your 15 min, $8 under your $15.');
    expect(factReason(c, { budgetMax: 15 })).toBe('For people into boba and sketching.');
    expect(factReason(c, ask)).not.toBe('Within your $15 budget.');
    // the viewer's own interest by name comes first
    expect(factReason(candidate({ viewerInterests: ['boba', 'sketching'] }), ask))
      .toBe('You listed boba and sketching in your interests.');
    // a friend's bubble beats everything, paraphrased
    const withMaya = candidate({
      friendOverlap: [{
        friendId: 'maya', availabilityId: 'a', firstName: 'Maya', availabilityText: '', freeFrom: at(0), freeUntil: at(60),
        sharedWithViewer: [], status: 'craving boba 🧋 · lunch break for ~45 min · wants to try Tea Lab', sharedWithQuest: ['boba'], travelMinutes: 5,
      }],
    });
    expect(factReason(withMaya, ask)).toBe("Maya's craving boba and wants to try Tea Lab.");
    // no window and no budget: the quest's own tags, then nothing
    expect(factReason(c)).toBe('For people into boba and sketching.');
    expect(factReason(candidate({ quest: { ...quest, tags: [] } }))).toBe('');
  });

  it('statusPhrase paraphrases a bubble line instead of quoting it', () => {
    expect(statusPhrase('Maya', 'craving dumplings 🥟 · lunch break for ~45 min · wants to try Dumpling Den'))
      .toBe("Maya's craving dumplings and wants to try Dumpling Den");
    expect(statusPhrase('Sam', 'board game brain 🎲 · setting up for tonight')).toBe('Sam says "board game brain"');
    expect(statusPhrase('Ana', 'wants to ride the Bay Trail')).toBe('Ana wants to ride the Bay Trail');
    expect(statusPhrase('Ana', '')).toBeNull();
    expect(statusPhrase('Ana', null)).toBeNull();
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
    expect(out.suggestions[0].reason).toBe('Fits inside your 40 min.');
    const budgeted = validate([s], [candidate()], ctx as never, { intent: { ...intent, budgetMax: 15 }, text: 'thirsty, under $15', now: NOW });
    expect(budgeted.suggestions[0].reason).toBe('Fits inside your 40 min, $8 under your $15.');
  });
});
