// Every route that returns a listing gives the exact pickup point and spot only to the seller and to
// a buyer whose hold the seller accepted. Everyone else gets the map's fuzzed point, so a pin never
// jumps between the Marketplace grid, the listing page and the Out Here map.
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_CENTER, fuzzLocation, offsetPoint, profileId, setNow, type LatLng, type Listing } from '@/shared';
import type { MapListing } from '@/shared/api';
import { createMemoryStore } from '@/features/data/memory-store';
import type { CoreStore } from '@/features/data/core';
import { PICKUP_LISTINGS } from '@/features/data/seed-build';
import { MAX_PICKUP_HOURS } from '@/features/data/market';
import { findFacts, matchListings, museFinds } from '@/features/muse/finds';
import { findLineMessages } from '@/features/muse/prompts/finds';

const box = vi.hoisted(() => ({ store: null as unknown }));
vi.mock('@/features/data/server', async (importOriginal) => {
  const data = await importOriginal<typeof import('@/features/data/server')>();
  return {
    ...data,
    getStore: () => box.store,
    getViewer: async (req: Request) => (box.store as CoreStore).profileByHandle(req.headers.get('x-persona') ?? ''),
  };
});

const { GET: getListings } = await import('@/app/api/listings/route');
const { GET: getListing } = await import('@/app/api/listings/[id]/route');
const { GET: getPickup } = await import('@/app/api/listings/[id]/pickup/route');
const { GET: getMap } = await import('@/app/api/listings/map/route');

const NOW = new Date('2026-11-13T18:00:00Z'); // 10:00 AM PT
let store: CoreStore;
beforeEach(() => { setNow(NOW); store = createMemoryStore(NOW); box.store = store; });
afterAll(() => setNow(null));

const EXACT: LatLng = offsetPoint(DEMO_CENTER, 1500, 70);
const SPOT = 'Blue door, 12 Ivy Dr';
const chair = {
  title: 'Desk chair', priceUsd: 35, category: 'Furniture', location: EXACT,
  pickupLabel: 'Belle Haven', pickupSpot: SPOT, pickupUntil: new Date(NOW.getTime() + 3 * 3_600_000).toISOString(),
};

const call = async <T>(handler: (req: Request, ctx: { params: Promise<never> }) => Promise<Response>, path: string, as: string, params: Record<string, string> = {}) => {
  const res = await handler(new Request(`http://localhost${path}`, { headers: { 'x-persona': as } }), { params: Promise.resolve(params) as Promise<never> });
  expect(res.status).toBe(200);
  return (await res.json()) as T;
};

/** What each listing route returns for `id`, as `as` sees it. */
async function everyRoute(as: string, id: string): Promise<{ route: string; listing: Listing }[]> {
  const grid = await call<{ listings: Listing[] }>(getListings, '/api/listings', as);
  const one = await call<{ listing: Listing }>(getListing, `/api/listings/${id}`, as, { id });
  const pickup = await call<{ listing: MapListing }>(getPickup, `/api/listings/${id}/pickup`, as, { id });
  const map = await call<{ listings: MapListing[] }>(getMap, '/api/listings/map', as);
  return [
    { route: 'GET /api/listings', listing: grid.listings.find((l) => l.id === id)! },
    { route: 'GET /api/listings/:id', listing: one.listing },
    { route: 'GET /api/listings/:id/pickup', listing: pickup.listing.listing },
    { route: 'GET /api/listings/map', listing: map.listings.find((m) => m.listing.id === id)!.listing },
  ];
}

const expectFuzzed = (rows: { route: string; listing: Listing }[], id: string) => {
  for (const r of rows) {
    expect(r.listing, r.route).toBeTruthy();
    expect(r.listing.location, r.route).not.toEqual(EXACT);
    expect(r.listing.location, r.route).toEqual(fuzzLocation(EXACT, id));
    expect(r.listing.pickupSpot, r.route).toBeNull();
    expect(JSON.stringify(r.listing), r.route).not.toContain(SPOT);
  }
};
const expectExact = (rows: { route: string; listing: Listing }[]) => {
  for (const r of rows) {
    expect(r.listing.location, r.route).toEqual(EXACT);
    expect(r.listing.pickupSpot, r.route).toBe(SPOT);
  }
};

const listChair = async () => (await store.createListing(profileId('felix'), chair)).listing.listing.id;

describe('listing location privacy across every listing route', () => {
  it('a viewer with no hold gets the map\'s fuzzed point and no spot on every route', async () => {
    const id = await listChair();
    expectFuzzed(await everyRoute('maya', id), id);
    expectFuzzed(await everyRoute('alex', id), id);
  });

  it('the seller gets the exact point and spot on every route', async () => {
    const id = await listChair();
    expectExact(await everyRoute('felix', id));
  });

  it('a requested hold is not enough; only the accepted buyer gets the exact point', async () => {
    const id = await listChair();
    await store.requestHold(profileId('maya'), id, { offerUsd: 35, etaMin: 20, message: '' });
    expectFuzzed(await everyRoute('maya', id), id);

    const hold = (await store.mapListing(profileId('felix'), id)).listing.requests[0];
    await store.respondHold(profileId('felix'), hold.id, true);
    expectExact(await everyRoute('maya', id));
    // the verifier's repro: after Felix accepts Maya, Alex must still see the fuzzed point
    expectFuzzed(await everyRoute('alex', id), id);
  });

  it('seeded pickup listings: the grid and the map agree on the fuzzed point for a non-seller', async () => {
    const grid = await call<{ listings: Listing[] }>(getListings, '/api/listings', 'alex');
    const map = await call<{ listings: MapListing[] }>(getMap, '/api/listings/map', 'alex');
    expect(map.listings.length).toBeGreaterThan(0);
    for (const m of map.listings) {
      if (m.listing.sellerId === profileId('alex')) continue;
      const g = grid.listings.find((l) => l.id === m.listing.id)!;
      expect(g.location).toEqual(m.listing.location);
      expect(g.pickupSpot).toBeNull();
    }
  });
});

describe('Muse finds never see the exact point or the spot', () => {
  it('the find, its prompt and its line carry neither for a viewer with no hold', async () => {
    const id = await listChair();
    const listings = await store.mapListings(profileId('alex'));
    const wants = await store.museWants(profileId('alex'));
    const best = matchListings(wants, listings, DEMO_CENTER, NOW, profileId('alex'))[0];
    expect(best?.listingId).toBe(id);
    const prompt = JSON.stringify(findLineMessages(findFacts(best)));
    const finds = JSON.stringify(await museFinds(wants, listings, DEMO_CENTER, NOW, profileId('alex')));
    for (const text of [prompt, finds]) {
      expect(text).not.toContain(SPOT);
      expect(text).not.toContain(String(EXACT.lat));
      expect(text).not.toContain(String(EXACT.lng));
    }
  });
});

describe('seeded pickup windows', () => {
  it('stay open at least 6 hours after the seed time, and under the create cap', () => {
    for (const p of PICKUP_LISTINGS) {
      expect(p.openMin, p.id).toBeGreaterThanOrEqual(6 * 60);
      expect(p.openMin, p.id).toBeLessThanOrEqual(MAX_PICKUP_HOURS * 60);
    }
  });

  it('a seed at 6:00 AM PT leaves every pickup listing on the map at 11:30 AM PT', async () => {
    const seededAt = new Date('2026-11-13T14:00:00Z'); // 6:00 AM PT
    setNow(seededAt);
    store = createMemoryStore(seededAt);
    setNow(new Date('2026-11-13T19:30:00Z')); // 11:30 AM PT
    const pins = await store.mapListings(profileId('alex'));
    expect(pins.length).toBe(PICKUP_LISTINGS.length);
  });
});
