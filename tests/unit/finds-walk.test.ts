import { describe, expect, it } from 'vitest';
import { checkFindLine, codeLine, findFacts, type FindCandidate } from '@/features/muse/finds';

const base = {
  listingId: 'l1', wantId: 'w1', title: 'Vintage track jacket', priceUsd: 20, imageUrl: null, driveMin: 1,
  pickupUntil: '2026-11-13T19:00:00Z', sellerFirstName: 'Nina', listedMinAgo: 1,
  want: { id: 'w1', userId: 'u', text: 'track jacket under $25', item: 'track jacket', keywords: ['jacket'], maxPrice: 25, maxDriveMin: null, active: true, createdAt: '' },
} as unknown as FindCandidate;

describe('Muse finds say walk when it is walkable', () => {
  it('a 4-minute walk, not a 1-minute drive', () => {
    const c = { ...base, walkMin: 4 };
    expect(codeLine(c)).toContain('4-minute walk');
    expect(checkFindLine("That $20 track jacket was just listed. It's a 4-minute walk, and the seller is around until " + findFacts(c).availableUntil + '.', findFacts(c))).toBeNull();
  });
  it('far away stays a drive', () => {
    const c = { ...base, driveMin: 12, walkMin: 40 };
    expect(codeLine(c)).toContain('12-minute drive');
    expect(findFacts(c).walkMin).toBeNull();
  });
});
