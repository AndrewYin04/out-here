import { describe, expect, it } from 'vitest';
import { commonInterests, mockRegroup, questMatches, RegroupValidationError, RegroupZ, validateRegroup, type RegroupContext } from './regroup';

const ctx: RegroupContext = {
  crewId: 'c1', crewName: 'Dumpling Crew', originTitle: 'Dumpling Den first try', lastHangoutText: '2026-11-05',
  viewerFirstName: 'Alex', sharedPrefs: ['dumplings', 'cheap eats'], sharedInterests: ['local bands'],
  members: [
    { id: 'm', firstName: 'Maya', interests: ['dumplings'], free: { text: 'free after work till 6', startsAt: 'a', endsAt: 'b' }, bubble: null },
    { id: 'k', firstName: 'Kai', interests: ['climbing'], free: null, bubble: 'craving dumplings' },
  ],
  candidates: [
    { questId: 'q-boba', title: 'Boba + sketching', emoji: '🧋', venueName: 'Tea Spot', startsAt: '2026-11-12T19:00:00Z', whenText: 'today 11:00 AM', seatsLeft: 3, priceMax: 8, tags: ['boba'], matches: [] },
    { questId: 'q-dump', title: 'Dumplings before the rush', emoji: '🥟', venueName: 'Dumpling Den', startsAt: '2026-11-12T19:30:00Z', whenText: 'in 25 min', seatsLeft: 2, priceMax: 12, tags: ['dumplings'], matches: ['dumplings'] },
  ],
};

describe('regroup', () => {
  it('finds interests shared by two or more people', () => {
    expect(commonInterests([['Dumplings', 'boba'], ['dumplings'], ['climbing']])).toEqual(['Dumplings']);
  });

  it('matches quests to crew prefs by title and tags', () => {
    expect(questMatches({ title: 'Dumplings before the rush', category: 'food', tags: [] }, ['dumplings', 'board games'])).toEqual(['dumplings']);
  });

  it('mock picks the best-matching real quest and cites shared facts', () => {
    const out = RegroupZ.parse(mockRegroup(ctx));
    expect(out.suggestion.questId).toBe('q-dump');
    expect(out.suggestion.reason).toContain('dumplings');
    expect(out.suggestion.reason).toContain('Maya');
    expect(validateRegroup(out, ctx)).toBe(out);
  });

  it('rejects quest ids that are not candidates and allows null', () => {
    const bad = { suggestion: { questId: 'made-up', title: 't', whenText: 'w', reason: 'r' }, message: 'm' };
    expect(() => validateRegroup(bad, ctx)).toThrow(RegroupValidationError);
    const none = { ...bad, suggestion: { ...bad.suggestion, questId: null } };
    expect(validateRegroup(none, ctx)).toBe(none);
  });

  it('mock with no candidates suggests the old hangout again', () => {
    const out = mockRegroup({ ...ctx, candidates: [] });
    expect(out.suggestion.questId).toBeNull();
    expect(out.suggestion.title).toContain('Dumpling Den first try');
  });
});
