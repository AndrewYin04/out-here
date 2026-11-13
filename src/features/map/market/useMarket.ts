'use client';
// Client hooks for Marketplace pickup on the Out Here map. Reads go through the API (which strips
// the exact spot per viewer); realtime messages on listings:new and listing:<id> trigger refetches.
import { useEffect, useMemo, useRef } from 'react';
import { useApi, type ApiState } from '@/features/data';
import type { LatLng } from '@/shared';
import type { MapListing, MapListingResponse, MapListingsResponse, MarketplacePicksResponse, MuseFind, MuseFindsResponse, MuseWantsResponse } from '@/shared/api';

const CATEGORY_EMOJI: Record<string, string> = {
  furniture: '🪑', electronics: '🖥️', home: '🏠', clothing: '🧥', sports: '🏐', books: '📚',
  bikes: '🚲', instruments: '🎸', 'toys & games': '🎲',
};
const TITLE_EMOJI: [RegExp, string][] = [
  [/chair|stool/i, '🪑'], [/desk|table/i, '🪵'], [/lamp/i, '💡'], [/bike/i, '🚲'], [/monitor|tv|screen/i, '🖥️'],
  [/plant|monstera/i, '🪴'], [/rice cooker|pan|pot|mixer/i, '🍳'], [/shelf|bookshelf/i, '📚'], [/camera/i, '📷'],
  [/jacket|shirt|sneaker|shoe/i, '🧥'], [/bag|purse|tote/i, '👜'],
];

export function listingEmoji(title: string, category: string): string {
  return TITLE_EMOJI.find(([re]) => re.test(title))?.[1] ?? CATEGORY_EMOJI[category.toLowerCase()] ?? '🛍️';
}

export const money = (n: number) => (n === 0 ? 'Free' : `$${Number.isInteger(n) ? n : n.toFixed(2)}`);

/** "Wooden desk with two drawers - $40" -> "Wooden desk with two drawers". */
export const cleanTitle = (t: string) => t.replace(/\s+[-–]\s+\$\d[\d.,]*\s*$/, '').trim();

/** Refetches when the next pickup window or reservation ends, so expiry shows without a message. */
function useExpiryRefetch(times: (string | null)[], refetch: () => unknown): void {
  const next = useMemo(() => {
    const t = Date.now();
    return times.flatMap((s) => (s ? [new Date(s).getTime()] : [])).filter((x) => x > t).sort((a, b) => a - b)[0] ?? null;
  }, [times]);
  useEffect(() => {
    if (next === null) return;
    const id = window.setTimeout(() => void refetch(), Math.min(next - Date.now() + 500, 2_147_000_000));
    return () => window.clearTimeout(id);
  }, [next, refetch]);
}

export function useMapListings(enabled = true): ApiState<MapListingsResponse> {
  const api = useApi<MapListingsResponse>(
    enabled ? '/api/listings/map' : null, ['listings:new'], (d) => d.listings.map((l) => `listing:${l.listing.id}`),
  );
  const times = useMemo(() => (api.data?.listings ?? []).flatMap((l) => [l.reservedUntil, l.listing.pickupUntil]), [api.data]);
  useExpiryRefetch(times, api.refetch);
  return api;
}

export function useMapListing(id: string | null): ApiState<MapListingResponse> {
  const api = useApi<MapListingResponse>(id ? `/api/listings/${id}/pickup` : null, id ? [`listing:${id}`] : []);
  const l = api.data?.listing;
  const times = useMemo(() => (l ? [l.reservedUntil, l.listing.pickupUntil] : []), [l]);
  useExpiryRefetch(times, api.refetch);
  return api;
}

export function useMuseWants(): ApiState<MuseWantsResponse> {
  return useApi<MuseWantsResponse>('/api/muse/wants');
}

/** Muse's find for the viewer. Listens to the same realtime channels as the map, so it reloads
 *  in parallel with the pins when a listing goes up or changes status. */
export function useMuseFinds(origin: LatLng | null, listings: MapListing[] | undefined, wantsKey: string): ApiState<MuseFindsResponse> {
  const path = origin ? `/api/muse/finds?lat=${origin.lat.toFixed(5)}&lng=${origin.lng.toFixed(5)}` : null;
  const channels = useMemo(() => ['listings:new', ...(listings ?? []).map((l) => `listing:${l.listing.id}`)], [listings]);
  const api = useApi<MuseFindsResponse>(path, channels);
  const { refetch } = api;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    void refetch();
  }, [wantsKey, refetch]);
  return api;
}

/** Listings newer than this can surface as a find from what the viewer watches. */
const WATCH_FIND_MAX_AGE_MIN = 60;

/**
 * Muse's picks from the viewer's watch history (Reels and videos they saved or watched), shown
 * as map finds when a matching listing has just gone up nearby. Same card as a want find; the
 * line is Muse's reason ("like the denim Reel you saved"). Refetches when a listing goes up.
 */
export function useWatchFinds(origin: LatLng | null, listings: MapListing[] | undefined, refetchListings?: () => unknown): MuseFind[] {
  const path = origin ? `/api/muse/marketplace-picks?lat=${origin.lat.toFixed(5)}&lng=${origin.lng.toFixed(5)}` : null;
  const api = useApi<MarketplacePicksResponse>(path, ['listings:new']);
  // A pick for a listing the map doesn't have yet means the map missed its listings:new message
  // (a dropped realtime frame, or a listing posted while this tab was still subscribing). Refetch
  // the map once per set of missing ids, so the find shows instead of being dropped below.
  const missing = useMemo(() => {
    if (!listings) return '';
    const onMap = new Set(listings.map((l) => l.listing.id));
    return [...new Set((api.data?.picks ?? []).map((p) => p.listing.id).filter((id) => !onMap.has(id)))].sort().join(',');
  }, [api.data, listings]);
  const tried = useRef('');
  useEffect(() => {
    if (!missing || !refetchListings || tried.current === missing) return;
    tried.current = missing;
    void refetchListings();
  }, [missing, refetchListings]);
  return useMemo(() => {
    const onMap = new Map((listings ?? []).map((l) => [l.listing.id, l]));
    const t = Date.now();
    return (api.data?.picks ?? []).flatMap((p): MuseFind[] => {
      const l = onMap.get(p.listing.id);
      // l.status, not l.listing.status: a held listing keeps its row status but is reserved.
      if (!l || l.status !== 'available' || !l.listing.pickupUntil) return [];
      const ageMin = Math.max(0, Math.round((t - new Date(l.listing.createdAt).getTime()) / 60_000));
      if (ageMin > WATCH_FIND_MAX_AGE_MIN) return [];
      return [{
        listingId: l.listing.id, wantId: `watch:${p.topic}`, title: cleanTitle(l.listing.title), priceUsd: l.listing.priceUsd,
        imageUrl: l.listing.imageUrl, driveMin: p.driveMin ?? 0, pickupUntil: l.listing.pickupUntil, listedMinAgo: ageMin,
        sellerFirstName: p.seller.name.split(' ')[0] ?? p.seller.name, line: p.reason, source: api.data?.source ?? 'fallback',
      }];
    });
  }, [api.data, listings]);
}

/** "12 min" / "1 h 5 min" until `iso`, never negative. */
export function countdown(iso: string, at: Date): string {
  const s = Math.max(0, Math.round((new Date(iso).getTime() - at.getTime()) / 1000));
  const m = Math.floor(s / 60);
  if (m >= 60) return `${Math.floor(m / 60)} h ${m % 60} min`;
  if (m >= 1) return `${m} min`;
  return `${s} s`;
}
