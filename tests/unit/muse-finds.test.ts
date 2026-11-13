import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DEMO_CENTER, offsetPoint, profileId, setNow, type MuseWant } from '@/shared';
import type { MapListing } from '@/shared/api';
import {
  checkFindLine, codeLine, findFacts, matchListings, mockWant, museFinds, setMuseTransport, titleMatches, validateWant,
} from '@/features/muse';
import { createMemoryStore } from '@/features/data/memory-store';

const alex = profileId('alex');
const maya = profileId('maya');
const NOW = new Date('2026-11-12T22:00:00Z'); // 2:00 PM PT
const saved = { ...process.env };
beforeEach(() => { setNow(NOW); process.env.MUSE_MOCK = '1'; process.env.MUSE_QUIET = '1'; });
afterAll(() => { setNow(null); process.env = { ...saved }; setMuseTransport(null); });

const want: MuseWant = {
  id: 'w1', userId: alex, text: 'I need a desk chair under $40, ideally within a 15-minute drive', item: 'desk chair',
  keywords: ['desk chair', 'office chair', 'chair'], maxPrice: 40, maxDriveMin: 15, active: true, createdAt: NOW.toISOString(),
};
const min = (m: number) => new Date(NOW.getTime() + m * 60_000).toISOString();
function listing(over: Partial<MapListing['listing']> & { status?: MapListing['status'] } = {}): MapListing {
  const { status = 'available', ...l } = over;
  return {
    listing: {
      id: l.id ?? 'L1', sellerId: maya, title: 'Desk chair', priceUsd: 35, condition: '', category: 'Furniture', description: '',
      imageUrl: null, location: offsetPoint(DEMO_CENTER, 3000, 0), status: 'available', createdAt: min(-2),
      pickupUntil: min(180), pickupLabel: 'Belle Haven', pickupSpot: null, ...l,
    },
    status, seller: { id: maya, handle: 'maya', name: 'Maya Chen', avatarUrl: '', mutualFriendCount: 0, isFriend: true },
    exact: false, myHold: null, reservedUntil: null, requests: [],
  };
}

describe('parse a want (mock + validation)', () => {
  it('reads the item, price and drive time', () => {
    const w = validateWant(mockWant(want.text), want.text);
    expect(w.item).toBe('desk chair');
    expect(w.keywords).toContain('chair');
    expect(w.maxPrice).toBe(40);
    expect(w.maxDriveMin).toBe(15);
  });
  it('drops limits the text never said', () => {
    const w = validateWant({ item: 'Bike', keywords: ['bike'], maxPrice: 100, maxDriveMin: 20 }, 'looking for a bike');
    expect(w).toMatchObject({ item: 'bike', maxPrice: null, maxDriveMin: null });
  });
});

describe('matchListings (code only)', () => {
  it('keeps a chair that fits price, drive and window', () => {
    const [c] = matchListings([want], [listing()], DEMO_CENTER, NOW, alex);
    expect(c).toMatchObject({ listingId: 'L1', priceUsd: 35, listedMinAgo: 2 });
    expect(c.driveMin).toBeGreaterThan(0);
    expect(c.driveMin).toBeLessThanOrEqual(15);
  });
  it('drops over budget, too far, reserved, own listing, window too short, and non-matches', () => {
    const out = matchListings([want], [
      listing({ id: 'over', priceUsd: 45 }),
      listing({ id: 'far', location: offsetPoint(DEMO_CENTER, 12_000, 0) }),
      listing({ id: 'held', status: 'reserved' }),
      listing({ id: 'mine', sellerId: alex }),
      listing({ id: 'late', pickupUntil: min(3) }),
      listing({ id: 'lamp', title: 'Floor lamp' }),
    ], DEMO_CENTER, NOW, alex);
    expect(out).toEqual([]);
  });
  it('drops a listing the viewer already asked to reserve', () => {
    const asked = listing({ id: 'asked' });
    asked.myHold = {
      id: 'h1', listingId: 'asked', buyerId: alex, offerUsd: 35, message: '', etaMin: 30, status: 'requested',
      createdAt: NOW.toISOString(), acceptedAt: null, expiresAt: null,
    };
    expect(matchListings([want], [asked], DEMO_CENTER, NOW, alex)).toEqual([]);
  });
  it('matches whole words and plurals only', () => {
    expect(titleMatches('Office chairs (2)', ['chair'])).toBe(true);
    expect(titleMatches('Armchairs', ['chair'])).toBe(false);
  });
});

describe("Muse's line is checked against the facts", () => {
  const [c] = matchListings([want], [listing()], DEMO_CENTER, NOW, alex);
  const f = findFacts(c);
  it('the code line passes its own check', () => {
    expect(codeLine(c)).toMatch(/^That \$35 desk chair was just listed\. It's a \d+-minute drive, and the seller is around until 5:00 PM\.$/);
    expect(checkFindLine(codeLine(c), f)).toBeNull();
  });
  it('rejects a wrong price, drive time or end time, and field names', () => {
    expect(checkFindLine('That $30 desk chair is close.', f)).toMatch(/\$30/);
    expect(checkFindLine(`It's a ${f.driveMin + 4}-minute drive.`, f)).toMatch(/^quoted \d+-min/);
    expect(checkFindLine('The seller is around until 6:00 PM.', f)).toMatch(/6:00 PM/);
    expect(checkFindLine('driveMin is short.', f)).toBe('leaked a data field name');
    expect(checkFindLine('Under your $40 budget, and the seller is around until 5 PM.', f)).toBeNull();
  });
  it('a live line that invents a number falls back to the code line', async () => {
    delete process.env.MUSE_MOCK;
    process.env.MUSE_API_KEY = 'test-key-not-real';
    process.env.MUSE_CACHE = '0';
    setMuseTransport(async () => ({ content: JSON.stringify({ line: 'That $20 chair is 2 minutes away!' }), usage: { promptTokens: 1, completionTokens: 1 } }));
    const [find] = await museFinds([want], [listing({ id: 'L-live' })], DEMO_CENTER, NOW, alex);
    expect(find.source).toBe('fallback');
    expect(find.line).toBe(codeLine(c));
    setMuseTransport(null);
  });
});

describe('end to end in the memory store', () => {
  it('a chair listed live is Alex\'s find; nothing before it', async () => {
    const store = createMemoryStore(NOW);
    const wants = await store.museWants(alex);
    expect(await museFinds(wants, await store.mapListings(alex), DEMO_CENTER, NOW, alex)).toEqual([]);
    await store.createListing(maya, {
      title: 'Desk chair', priceUsd: 35, category: 'Furniture', location: offsetPoint(DEMO_CENTER, 2500, 60),
      pickupLabel: 'Belle Haven', pickupSpot: 'Blue door', pickupUntil: min(180),
    });
    const [find] = await museFinds(wants, await store.mapListings(alex), DEMO_CENTER, NOW, alex);
    expect(find).toMatchObject({ title: 'Desk chair', priceUsd: 35, sellerFirstName: 'Maya', source: 'mock' });
    expect(find.line).toMatch(/\$35 desk chair was just listed/);
  });
});
