// Marketplace pickup on the Out Here map. Server-only; CoreStore exposes these as store methods.
//
// A seller turns on "Available for pickup until <time>", so the listing is a map pin until then.
// A buyer asks to reserve it (a hold request). The seller accepts one request, which holds the
// item for that buyer for their ETA plus HOLD_GRACE_MIN. "Reserved" and "expired" are derived on
// read from the hold rows, so an expired hold frees the item without a cron job.
//
// Privacy: everyone sees the pickup area (location fuzzed ~200 m, pickupLabel). Only the seller
// and a buyer with an accepted, unexpired hold get the exact location and pickupSpot.
// Realtime: listing:<id> {status, requests} (a status word and a count, never names or places),
// and listings:new {listingId} when a listing goes on the map.
import {
  formatDemoTime, fuzzLocation, now,
  type ID, type Listing, type ListingHold, type ListingStatus, type MuseWant,
} from '@/shared';
import type { CreateListingBody, HoldRequestBody, MapListing } from '@/shared/api';
import type { CoreStore } from './core';
import type { ListingHoldRow } from './db';
import { badRequest, conflict, forbidden, notFound } from './errors';
import { areaLabel } from './locations';
import { publish } from './realtime-server';
import type { View } from './view';

/** A hold lasts the buyer's ETA plus this much. */
export const HOLD_GRACE_MIN = 15;
/** "Available until" can be at most this far ahead. */
export const MAX_PICKUP_HOURS = 12;
/** Wants kept active per person; older ones switch off. */
export const MAX_ACTIVE_WANTS = 3;

const iso = (d: Date = now()) => d.toISOString();
const uuid = () => crypto.randomUUID();
const firstName = (v: View, id: ID) => v.profileById.get(id)?.name.split(' ')[0] ?? 'Someone';
const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

// ---------- derived state ----------

export function holdStatus(h: ListingHoldRow, at: Date): ListingHold['status'] {
  if (h.status === 'accepted' && h.expiresAt && new Date(h.expiresAt) <= at) return 'expired';
  return h.status;
}

const holdView = (h: ListingHoldRow, at: Date): ListingHold => ({ ...h, status: holdStatus(h, at) });

const holdsOf = (v: View, listingId: ID) =>
  v.db.listingHolds.filter((h) => h.listingId === listingId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

/** The accepted hold that still holds the item, if any. */
export function activeHold(v: View, listingId: ID, at: Date): ListingHoldRow | null {
  return holdsOf(v, listingId).find((h) => holdStatus(h, at) === 'accepted') ?? null;
}

export function listingStatus(v: View, l: Listing, at: Date): ListingStatus {
  if (l.status === 'sold') return 'sold';
  return activeHold(v, l.id, at) ? 'reserved' : 'available';
}

/** On the live map: has a pickup window that is still open, a place, and is not sold. */
export function onMap(l: Listing, at: Date): boolean {
  return l.status !== 'sold' && !!l.location && !!l.pickupUntil && new Date(l.pickupUntil) > at;
}

/** True for the seller, and for a buyer whose accepted hold has not expired on an unsold listing. */
export function seesExactPickup(v: View, viewerId: ID, l: Listing, at: Date): boolean {
  if (l.sellerId === viewerId) return true;
  return l.status !== 'sold' && activeHold(v, l.id, at)?.buyerId === viewerId;
}

/**
 * The listing row as `viewerId` may see it. Everyone else gets the same ~200 m fuzz the map pin
 * uses (fuzzLocation seeded by the listing id, so a pin never jumps between views) and no spot.
 * Every route that returns a listing goes through this.
 */
export function listingFor(v: View, viewerId: ID, l: Listing, at: Date): Listing {
  const exact = seesExactPickup(v, viewerId, l, at);
  return {
    ...withPickup(l),
    pickupSpot: exact ? (l.pickupSpot ?? null) : null,
    location: l.location && !exact ? fuzzLocation(l.location, l.id) : l.location,
  };
}

/** A listing as `viewerId` may see it on the map: no exact place or spot unless they are entitled to it. */
export function mapListingFor(v: View, viewerId: ID, l: Listing, at: Date): MapListing {
  const hold = activeHold(v, l.id, at);
  const isSeller = l.sellerId === viewerId;
  const exact = seesExactPickup(v, viewerId, l, at);
  const mine = holdsOf(v, l.id).find((h) => h.buyerId === viewerId) ?? null;
  const listing = listingFor(v, viewerId, l, at);
  const requests = isSeller
    ? holdsOf(v, l.id)
      .filter((h) => h.status === 'requested' || h.id === hold?.id)
      .map((h) => ({ ...holdView(h, at), buyer: v.person(viewerId, h.buyerId)! }))
      .filter((r) => r.buyer)
    : [];
  return {
    listing,
    status: listingStatus(v, l, at),
    seller: v.person(viewerId, l.sellerId)!,
    exact,
    myHold: mine ? holdView(mine, at) : null,
    reservedUntil: hold?.expiresAt ?? null,
    requests,
  };
}

/** The pickup fields read as null when migration 0007 has not added the columns yet. */
function withPickup(l: Listing): Listing {
  return { ...l, pickupUntil: l.pickupUntil ?? null, pickupLabel: l.pickupLabel ?? null, pickupSpot: l.pickupSpot ?? null };
}

function findListing(v: View, id: ID): Listing {
  const l = v.db.listings.find((x) => x.id === id);
  if (!l) throw notFound('listing_not_found');
  return withPickup(l);
}

async function announce(store: CoreStore, listingId: ID): Promise<void> {
  const v = await store.view();
  const l = v.db.listings.find((x) => x.id === listingId);
  if (!l) return;
  const at = now();
  const requests = v.db.listingHolds.filter((h) => h.listingId === listingId && h.status === 'requested').length;
  await publish(`listing:${listingId}`, { status: listingStatus(v, withPickup(l), at), requests });
}

async function reread(store: CoreStore, viewerId: ID, listingId: ID): Promise<{ listing: MapListing }> {
  const v = await store.view();
  return { listing: mapListingFor(v, viewerId, findListing(v, listingId), now()) };
}

// ---------- reads ----------

export async function mapListings(store: CoreStore, viewerId: ID): Promise<MapListing[]> {
  const v = await store.view();
  const at = now();
  return v.db.listings.map(withPickup).filter((l) => onMap(l, at))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((l) => mapListingFor(v, viewerId, l, at));
}

export async function mapListing(store: CoreStore, viewerId: ID, id: ID): Promise<{ listing: MapListing }> {
  const v = await store.view();
  return { listing: mapListingFor(v, viewerId, findListing(v, id), now()) };
}

// ---------- seller ----------

export async function createListing(store: CoreStore, viewerId: ID, body: CreateListingBody): Promise<{ listing: MapListing }> {
  const at = now();
  const until = new Date(body.pickupUntil);
  if (!(until > at)) throw badRequest('"available until" must be later than now');
  if (until.getTime() - at.getTime() > MAX_PICKUP_HOURS * 3_600_000) throw badRequest(`pickup can stay open up to ${MAX_PICKUP_HOURS} hours`);
  const id = uuid();
  await store.backend.insert('listings', [{
    id, sellerId: viewerId, title: body.title.trim(), priceUsd: body.priceUsd, condition: '',
    category: body.category.trim(), description: body.description?.trim() ?? '', imageUrl: body.imageUrl ?? null,
    location: body.location, status: 'available', createdAt: iso(at),
    pickupUntil: until.toISOString(), pickupLabel: body.pickupLabel?.trim() || areaLabel(body.location), pickupSpot: body.pickupSpot.trim(),
  }]);
  // Ids only: every map refetches /api/listings/map, which strips the exact spot per viewer.
  await publish('listings:new', { listingId: id });
  return reread(store, viewerId, id);
}

export async function respondHold(store: CoreStore, viewerId: ID, holdId: ID, accept: boolean): Promise<{ listing: MapListing }> {
  const v = await store.view();
  const h = v.db.listingHolds.find((x) => x.id === holdId);
  if (!h) throw notFound('hold_not_found');
  const l = findListing(v, h.listingId);
  if (l.sellerId !== viewerId) throw forbidden('only the seller can answer');
  if (h.status !== 'requested') throw conflict('this request was already answered');
  const at = now();
  const seller = firstName(v, viewerId);
  if (!accept) {
    await store.backend.update('listingHolds', { id: holdId }, { status: 'declined' });
    await store.notify(v, h.buyerId, 'listing_update', viewerId, 'listing', l.id, `${seller} can't do that pickup for ${l.title}.`);
  } else {
    if (l.status === 'sold' || !onMap(l, at)) throw conflict('this listing is no longer available');
    if (activeHold(v, l.id, at)) throw conflict('already reserved');
    const expiresAt = new Date(at.getTime() + (h.etaMin + HOLD_GRACE_MIN) * 60_000);
    await store.backend.update('listingHolds', { id: holdId }, { status: 'accepted', acceptedAt: iso(at), expiresAt: iso(expiresAt) });
    const others = v.db.listingHolds.filter((x) => x.listingId === l.id && x.status === 'requested' && x.id !== holdId);
    if (others.length) await store.backend.update('listingHolds', { id: others.map((x) => x.id) }, { status: 'declined' });
    await store.notify(v, h.buyerId, 'listing_update', viewerId, 'listing', l.id,
      `${seller} accepted. ${l.title} is held for you till ${formatDemoTime(iso(expiresAt))}.`);
    for (const o of others) {
      await store.notify(v, o.buyerId, 'listing_update', viewerId, 'listing', l.id, `${l.title} was reserved by someone else.`);
    }
  }
  await announce(store, l.id);
  return reread(store, viewerId, l.id);
}

export async function markSold(store: CoreStore, viewerId: ID, listingId: ID): Promise<{ listing: MapListing }> {
  const v = await store.view();
  const l = findListing(v, listingId);
  if (l.sellerId !== viewerId) throw forbidden('only the seller can mark it sold');
  if (l.status === 'sold') return reread(store, viewerId, listingId);
  const at = now();
  const hold = activeHold(v, listingId, at);
  await store.backend.update('listings', { id: listingId }, { status: 'sold' });
  if (hold) await store.backend.update('listingHolds', { id: hold.id }, { status: 'completed' });
  const open = v.db.listingHolds.filter((x) => x.listingId === listingId && x.status === 'requested');
  if (open.length) await store.backend.update('listingHolds', { id: open.map((x) => x.id) }, { status: 'declined' });
  for (const o of open) {
    await store.notify(v, o.buyerId, 'listing_update', viewerId, 'listing', listingId, `${l.title} sold.`);
  }
  await announce(store, listingId);
  return reread(store, viewerId, listingId);
}

// ---------- buyer ----------

export async function requestHold(store: CoreStore, viewerId: ID, listingId: ID, body: HoldRequestBody): Promise<{ listing: MapListing }> {
  const v = await store.view();
  const l = findListing(v, listingId);
  const at = now();
  if (l.sellerId === viewerId) throw badRequest('this is your listing');
  if (!onMap(l, at)) throw conflict('this listing is no longer available for pickup');
  if (activeHold(v, listingId, at)) throw conflict('already reserved');
  const mine = holdsOf(v, listingId).find((h) => h.buyerId === viewerId && h.status === 'requested');
  if (mine) throw conflict('you already asked; waiting on the seller');
  if (at.getTime() + body.etaMin * 60_000 > new Date(l.pickupUntil!).getTime()) {
    throw badRequest(`pickup ends at ${formatDemoTime(l.pickupUntil!)}`);
  }
  const row: ListingHoldRow = {
    id: uuid(), listingId, buyerId: viewerId, offerUsd: body.offerUsd, message: body.message.trim().slice(0, 300),
    etaMin: body.etaMin, status: 'requested', createdAt: iso(at), acceptedAt: null, expiresAt: null,
  };
  await store.backend.insert('listingHolds', [row]);
  const quote = row.message ? `: "${row.message}"` : ` for ${money(row.offerUsd)}`;
  await store.notify(v, l.sellerId, 'listing_hold', viewerId, 'listing', listingId,
    `${firstName(v, viewerId)} wants to pick up ${l.title}${quote}`);
  await announce(store, listingId);
  return reread(store, viewerId, listingId);
}

/** The buyer drops their request or hold, or the seller releases a hold. */
export async function releaseHold(store: CoreStore, viewerId: ID, holdId: ID): Promise<{ listing: MapListing }> {
  const v = await store.view();
  const h = v.db.listingHolds.find((x) => x.id === holdId);
  if (!h) throw notFound('hold_not_found');
  const l = findListing(v, h.listingId);
  const isSeller = l.sellerId === viewerId;
  if (h.buyerId !== viewerId && !isSeller) throw forbidden();
  const at = now();
  const st = holdStatus(h, at);
  if (st === 'requested' || st === 'accepted') {
    await store.backend.update('listingHolds', { id: holdId }, { status: 'cancelled' });
    const other = isSeller ? h.buyerId : l.sellerId;
    const text = isSeller
      ? `${firstName(v, viewerId)} released your hold on ${l.title}.`
      : `${firstName(v, viewerId)} can't make the pickup for ${l.title}.`;
    await store.notify(v, other, 'listing_update', viewerId, 'listing', l.id, text);
    await announce(store, l.id);
  }
  return reread(store, viewerId, l.id);
}

// ---------- Muse wants ----------

export async function museWants(store: CoreStore, viewerId: ID): Promise<MuseWant[]> {
  const v = await store.view();
  return v.db.museWants.filter((w) => w.userId === viewerId && w.active)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function addMuseWant(
  store: CoreStore, viewerId: ID, w: Pick<MuseWant, 'text' | 'item' | 'keywords' | 'maxPrice' | 'maxDriveMin'>,
): Promise<MuseWant> {
  const row: MuseWant = { id: uuid(), userId: viewerId, active: true, createdAt: iso(), ...w };
  await store.backend.insert('museWants', [row]);
  const keep = (await museWants(store, viewerId)).slice(MAX_ACTIVE_WANTS).map((x) => x.id);
  if (keep.length) await store.backend.update('museWants', { id: keep }, { active: false });
  return row;
}

export async function removeMuseWant(store: CoreStore, viewerId: ID, id: ID): Promise<{ ok: true }> {
  const v = await store.view();
  const w = v.db.museWants.find((x) => x.id === id);
  if (!w || w.userId !== viewerId) throw notFound('want_not_found');
  await store.backend.update('museWants', { id }, { active: false });
  return { ok: true };
}
