import { describe, expect, it } from 'vitest';
import type { MyRating, Quest } from '@/shared';
import { pickForYou, validateForYou, type ForYouInput } from './for-you';

const now = new Date('2026-11-13T17:00:00Z');
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();

function quest(id: string, title: string, tags: string[], memberIds: string[] = []): Quest {
  return {
    id, hostId: 'h', title, emoji: '', category: 'other', description: '', venueName: title,
    location: { lat: 0, lng: 0 }, approxLocation: { lat: 0, lng: 0 }, startsAt: hoursAgo(0), endsAt: hoursAgo(-1),
    capacity: 6, memberIds, priceMax: 10, tags, status: 'open', isPublic: true, createdAt: hoursAgo(1),
  } as Quest;
}
function rating(q: Quest, score: number, verdict: 'loved' | 'fine' | 'meh', highlights: string[] = []): MyRating {
  return { questId: q.id, verdict, score, highlights, quest: q, photos: [] } as unknown as MyRating;
}

const open = [
  quest('q1', 'Dumplings before the rush', ['dumplings', 'cheap eats']),
  quest('q2', 'Boba + sketching', ['boba', 'sketching']),
  quest('q3', 'Thrift walk on Willow', ['thrifting', 'vintage']),
  quest('q4', 'Local-band show pregame', ['local bands', 'live music']),
  quest('q5', 'Bayfront Park sunset walk', ['walk', 'sunset']),
];
const pastDumplings = quest('p1', 'Dumpling Den first try', ['dumplings'], ['alex', 'maya']);
const pastShow = quest('p2', 'Local band night', ['local bands'], ['alex', 'maya']);
const pastSunset = quest('p3', 'Bayfront sunset walk', ['walk', 'sunset'], ['alex']);

const base = (over: Partial<ForYouInput>): ForYouInput => ({
  ratings: [], videos: [], interests: [], quests: open, friendNames: new Map([['maya', 'Maya']]), now, ...over,
});

const alex = base({
  ratings: [rating(pastDumplings, 9.2, 'loved', ['want to go back']), rating(pastShow, 8, 'loved'), rating(pastSunset, 5.5, 'fine')],
  videos: [
    { videoKey: 'ink', seconds: 660, lastAt: hoursAgo(30), topics: ['comics', 'drawing'] },
    { videoKey: 'haul', seconds: 700, lastAt: hoursAgo(52), topics: ['comics', 'indie comics'] },
    { videoKey: 'thrift', seconds: 540, lastAt: hoursAgo(18), topics: ['vintage', 'thrifting', 'denim'] },
    { videoKey: 'climb', seconds: 30, lastAt: hoursAgo(110), topics: ['climbing'] },
  ],
  interests: ['dumplings', 'local bands', 'trying new food', 'running', 'boba'],
});
const maya = base({
  friendNames: new Map([['alex', 'Alex']]),
  ratings: [rating(pastDumplings, 8.8, 'loved'), rating(pastShow, 7.9, 'loved')],
  videos: [{ videoKey: 'bag', seconds: 145, lastAt: hoursAgo(3), topics: ['denim bags', 'bags', 'y2k'] }],
  interests: ['dumplings', 'local bands', 'yoga', 'houseplants', 'boba'],
});

describe('pickForYou', () => {
  it('gives Alex chips from his ratings and videos, each backed by an open plan', () => {
    const d = pickForYou(alex);
    expect(d.chips.map((c) => c.id)).toEqual(['dumplings', 'shows', 'sketch', 'thrift']);
    expect(d.chips.every((c) => c.openPlans >= 1)).toBe(true);
    expect(d.noticed[0].text).toBe('You rated Dumpling Den first try 9.2 with Maya and said you’d go back');
    expect(d.noticed.some((n) => n.text === '23 min of comics videos this week')).toBe(true);
    // A skipped 30 s clip and a "fine" walk are not signals.
    expect(d.chips.some((c) => c.id === 'climb')).toBe(false);
  });

  it('gives Maya different chips and says what had no open plan', () => {
    const d = pickForYou(maya);
    const ids = d.chips.map((c) => c.id);
    expect(ids).toContain('boba');
    expect(ids).toContain('thrift');
    expect(ids).not.toContain('sketch');
    expect(d.dropped).toEqual(['yoga', 'plants']);
    expect(d.checked[1]).toBe('Nothing open for yoga and plants right now, so they’re left out');
  });

  it('drops videos older than a week', () => {
    const d = pickForYou(base({ videos: [{ videoKey: 'x', seconds: 900, lastAt: hoursAgo(24 * 9), topics: ['comics'] }] }));
    expect(d.chips).toEqual([]);
  });
});

describe('validateForYou', () => {
  const d = pickForYou(alex);
  it('keeps a grounded sentence', () => {
    expect(validateForYou('Dumplings lead because you rated Dumpling Den first try 9.2 with Maya.', d)).not.toBeNull();
  });
  it('rejects invented numbers and names', () => {
    expect(validateForYou('Dumplings lead because you rated it 10 out of 10.', d)).toBeNull();
    expect(validateForYou('Dumplings lead because Jordan loved it with you.', d)).toBeNull();
  });
});
