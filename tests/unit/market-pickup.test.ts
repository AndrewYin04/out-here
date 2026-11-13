import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DEMO_CENTER, offsetPoint, profileId, seedId, setNow } from '@/shared';
import { createMemoryStore } from '@/features/data/memory-store';
import { subscribe, type RealtimeMessage } from '@/features/data/realtime-server';
import type { CoreStore } from '@/features/data/core';
import { HOLD_GRACE_MIN } from '@/features/data/market';

const alex = profileId('alex');
const maya = profileId('maya');
const sam = profileId('sam');

let store: CoreStore;
const NOW = new Date('2026-11-12T22:00:00Z'); // 2:00 PM PT
beforeEach(() => { setNow(NOW); store = createMemoryStore(NOW); });
afterAll(() => setNow(null));

const at = (min: number) => new Date(NOW.getTime() + min * 60_000);
const chairBody = {
  title: 'Desk chair', priceUsd: 35, category: 'Furniture', location: offsetPoint(DEMO_CENTER, 2000, 45),
  pickupLabel: 'Belle Haven', pickupSpot: 'Blue door, 12 Ivy Dr', pickupUntil: at(180).toISOString(),
};
const list = () => store.createListing(maya, chairBody).then((r) => r.listing.listing.id);

describe('Marketplace pickup: listing on the map', () => {
  it('seeds open pickup listings and Alex\'s want', async () => {
    const pins = await store.mapListings(alex);
    expect(pins.length).toBeGreaterThanOrEqual(3);
    expect(pins.every((p) => p.status === 'available' && p.listing.pickupSpot === null && !p.exact)).toBe(true);
    expect(pins.some((p) => /chair/i.test(p.listing.title))).toBe(false);
    const wants = await store.museWants(alex);
    expect(wants[0]).toMatchObject({ item: 'track jacket', maxPrice: 25, maxDriveMin: 15 });
  });

  it('a new listing goes on every map, with the exact spot only for the seller', async () => {
    const got: RealtimeMessage[] = [];
    const off = subscribe((m) => { if (m.channel === 'listings:new') got.push(m); });
    const id = await list();
    off();
    expect(got).toHaveLength(1);
    expect(Object.keys(got[0].payload)).toEqual(['listingId']);
    const seller = (await store.mapListing(maya, id)).listing;
    expect(seller.exact).toBe(true);
    expect(seller.listing.pickupSpot).toBe('Blue door, 12 Ivy Dr');
    const buyer = (await store.mapListings(alex)).find((p) => p.listing.id === id)!;
    expect(buyer.exact).toBe(false);
    expect(buyer.listing.pickupSpot).toBeNull();
    expect(buyer.listing.location).not.toEqual(chairBody.location);
    // the plain Marketplace routes never carry the spot either
    expect((await store.listing(alex, id)).listing.pickupSpot).toBeNull();
  });

  it('rejects a pickup window in the past', async () => {
    await expect(store.createListing(maya, { ...chairBody, pickupUntil: at(-5).toISOString() })).rejects.toMatchObject({ status: 400 });
  });
});

describe('Marketplace pickup: hold, accept, expire, sold', () => {
  it('request → accept reserves it, reveals the spot to the buyer, and blocks others', async () => {
    const id = await list();
    const req = (await store.requestHold(alex, id, { offerUsd: 35, etaMin: 30, message: '$35, I can be there in 30 minutes.' })).listing;
    expect(req.myHold?.status).toBe('requested');
    expect(req.status).toBe('available');
    await expect(store.requestHold(alex, id, { offerUsd: 35, etaMin: 30, message: '' })).rejects.toMatchObject({ status: 409 });
    await store.requestHold(sam, id, { offerUsd: 30, etaMin: 20, message: '' });

    const seller = (await store.mapListing(maya, id)).listing;
    expect(seller.requests.map((r) => r.buyerId).sort()).toEqual([alex, sam].sort());
    const notes = await store.notifications(maya);
    expect(notes.notifications.some((n) => n.type === 'listing_hold' && n.text.includes('I can be there in 30 minutes'))).toBe(true);

    const alexHold = seller.requests.find((r) => r.buyerId === alex)!;
    const after = (await store.respondHold(maya, alexHold.id, true)).listing;
    expect(after.status).toBe('reserved');
    expect(after.reservedUntil).toBe(at(30 + HOLD_GRACE_MIN).toISOString());

    const buyer = (await store.mapListing(alex, id)).listing;
    expect(buyer.exact).toBe(true);
    expect(buyer.listing.pickupSpot).toBe('Blue door, 12 Ivy Dr');
    const other = (await store.mapListing(sam, id)).listing;
    expect(other.myHold?.status).toBe('declined');
    expect(other.listing.pickupSpot).toBeNull();
    expect(other.status).toBe('reserved');
    await expect(store.requestHold(sam, id, { offerUsd: 35, etaMin: 10, message: '' })).rejects.toMatchObject({ status: 409 });
  });

  it('an expired hold frees the item while the window is open', async () => {
    const id = await list();
    await store.requestHold(alex, id, { offerUsd: 35, etaMin: 10, message: '' });
    const h = (await store.mapListing(maya, id)).listing.requests[0];
    await store.respondHold(maya, h.id, true);
    setNow(at(10 + HOLD_GRACE_MIN + 1));
    const later = (await store.mapListing(alex, id)).listing;
    expect(later.status).toBe('available');
    expect(later.myHold?.status).toBe('expired');
    expect(later.exact).toBe(false);
    await store.requestHold(sam, id, { offerUsd: 35, etaMin: 10, message: '' });
  });

  it('sold takes it off the map and publishes the status', async () => {
    const id = await list();
    await store.requestHold(alex, id, { offerUsd: 35, etaMin: 10, message: '' });
    const h = (await store.mapListing(maya, id)).listing.requests[0];
    await store.respondHold(maya, h.id, true);
    await expect(store.markSold(alex, id)).rejects.toMatchObject({ status: 403 });
    const got: RealtimeMessage[] = [];
    const off = subscribe((m) => { if (m.channel === `listing:${id}`) got.push(m); });
    const sold = (await store.markSold(maya, id)).listing;
    off();
    expect(sold.status).toBe('sold');
    expect(got.at(-1)?.payload).toEqual({ status: 'sold', requests: 0 });
    expect((await store.mapListings(alex)).some((p) => p.listing.id === id)).toBe(false);
  });

  it('the buyer can cancel, and the ETA must land inside the pickup window', async () => {
    const id = await list();
    await expect(store.requestHold(alex, id, { offerUsd: 35, etaMin: 200, message: '' })).rejects.toMatchObject({ status: 400 });
    const r = (await store.requestHold(alex, id, { offerUsd: 35, etaMin: 15, message: '' })).listing;
    const after = (await store.releaseHold(alex, r.myHold!.id)).listing;
    expect(after.myHold?.status).toBe('cancelled');
    expect((await store.mapListing(maya, id)).listing.requests).toHaveLength(0);
  });

  it('the seed\'s pickup listings are not the free office chair', async () => {
    const pins = await store.mapListings(alex);
    expect(pins.some((p) => p.listing.id === seedId('listing', 'l16'))).toBe(false);
  });
});
