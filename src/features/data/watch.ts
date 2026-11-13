// Watch history. Server-only; CoreStore exposes these as store methods. Videos are the fixed,
// fictional catalogue in src/shared/seed/videos.json; a view is (person, video key, seconds).
// Realtime: user:<viewerId> {type:"watch", id} so the viewer's other tabs (Marketplace) refetch.
import { coverFor, now, SEED_VIDEOS, VIDEO_BY_KEY, videoClip, type ID, type Listing } from '@/shared';
import type { MarketplacePick, PersonCard, WatchHistoryItem, WatchResponse, WatchVideo } from '@/shared/api';
import { listingFor } from './market';
import type { CoreStore } from './core';
import { notFound } from './errors';
import { publish } from './realtime-server';
import type { View } from './view';

export const WATCH_HISTORY_DAYS = 14;

export function videoView(v: View, viewerId: ID, key: string): WatchVideo | null {
  const s = VIDEO_BY_KEY.get(key);
  if (!s) return null;
  const creator = v.profileByHandle.get(s.creator);
  return {
    key: s.key, title: s.title, minutes: s.minutes, topics: s.topics, posterUrl: coverFor(s), clipUrl: videoClip(s.key), format: s.format ?? 'video',
    creator: creator ? v.person(viewerId, creator.id) : null,
  };
}

/** One row per video the viewer watched in the last `days`: total seconds, last time, newest first. */
export function historyOf(v: View, viewerId: ID, at: Date = now(), days = WATCH_HISTORY_DAYS): WatchHistoryItem[] {
  const since = new Date(at.getTime() - days * 86_400_000).toISOString();
  const by = new Map<string, WatchHistoryItem>();
  for (const e of v.db.watchEvents) {
    if (e.userId !== viewerId || e.createdAt < since || !VIDEO_BY_KEY.has(e.videoKey)) continue;
    const cur = by.get(e.videoKey);
    if (cur) {
      cur.seconds += e.seconds;
      if (e.createdAt > cur.lastAt) cur.lastAt = e.createdAt;
    } else {
      by.set(e.videoKey, { videoKey: e.videoKey, seconds: e.seconds, lastAt: e.createdAt });
    }
  }
  return [...by.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

export async function watch(store: CoreStore, viewerId: ID): Promise<WatchResponse> {
  const v = await store.view();
  return {
    videos: SEED_VIDEOS.map((s) => videoView(v, viewerId, s.key)!),
    history: historyOf(v, viewerId),
  };
}

export async function recordWatch(store: CoreStore, viewerId: ID, videoKey: string, seconds: number): Promise<{ ok: true }> {
  if (!VIDEO_BY_KEY.has(videoKey)) throw notFound('video_not_found');
  const id = crypto.randomUUID();
  await store.backend.insert('watchEvents', [{
    id, userId: viewerId, videoKey, seconds: Math.round(seconds), createdAt: now().toISOString(),
  }]);
  await publish(`user:${viewerId}`, { type: 'watch', id });
  return { ok: true };
}

/** Reels the viewer watched that name things to look for on Marketplace (Muse finds on the map). */
export async function watchedReels(store: CoreStore, viewerId: ID): Promise<{ key: string; title: string; lookFor: string[]; look: string }[]> {
  const v = await store.view();
  return historyOf(v, viewerId).flatMap((h) => {
    const s = VIDEO_BY_KEY.get(h.videoKey);
    return s && s.format === 'reel' && s.lookFor?.length ? [{ key: s.key, title: s.title, lookFor: s.lookFor, look: s.look ?? 'what you saw' }] : [];
  });
}

// ---------- context for Muse's Marketplace picks ----------

export type MarketplaceContext = {
  history: (WatchHistoryItem & { video: WatchVideo })[];
  interests: string[];
  /** Listings the viewer could buy: not sold, not their own. Read through listingFor, so location and spot follow the viewer. */
  listings: { listing: Listing; seller: PersonCard; openHouse: MarketplacePick['openHouse'] }[];
};

/** Everything the picks route needs, read from one snapshot. */
export async function marketplaceContext(store: CoreStore, viewerId: ID): Promise<MarketplaceContext> {
  const v = await store.view();
  const at = now();
  const history = historyOf(v, viewerId, at).flatMap((h) => {
    const video = videoView(v, viewerId, h.videoKey);
    return video ? [{ ...h, video }] : [];
  });
  // A plan linked to a listing carries the tag listing:<id> (see src/shared/seed/comics.ts).
  const openHouse = new Map<ID, NonNullable<MarketplacePick['openHouse']>>();
  for (const q of v.db.quests) {
    if (!v.isActiveQuest(q) || !v.canSeeQuest(viewerId, q)) continue;
    for (const t of q.tags) {
      if (t.startsWith('listing:')) openHouse.set(t.slice(8), { questId: q.id, title: q.title, startsAt: q.startsAt, venueName: q.venueName });
    }
  }
  const listings = v.db.listings
    .filter((l) => l.status !== 'sold' && l.sellerId !== viewerId)
    .flatMap((l) => {
      const seller = v.person(viewerId, l.sellerId);
      return seller ? [{ listing: listingFor(v, viewerId, l, at), seller, openHouse: openHouse.get(l.id) ?? null }] : [];
    });
  return { history, interests: v.profileById.get(viewerId)?.interests ?? [], listings };
}
