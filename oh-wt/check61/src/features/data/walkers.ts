// Walking there together (#46, DEMO_FLOW scene 8): people who joined the same plan see each
// other's avatar move on the 3D map while they walk to it. Server-only; CoreStore exposes these.
//
// No new tables. A walk step is stored as the walker's own location share, with the place label
// "On the way to <venue>" marking which plan the position is for. Rules:
// - Only members of the plan can post a step or read the walkers, and only while the plan is on
//   (not done, not ended).
// - A walker shows only while their share carries this plan's walk label and was updated in the
//   last WALK_FRESH_MIN minutes, so it stops showing soon after they stop walking.
// - Someone who never shared a location gets a paused share: friends' Find My does not start
//   showing them because they walked to a plan. Their own sharing settings are otherwise kept.
// - Realtime: each step sends user:<memberId> {type:"location", id} to the other members (ids
//   only, then they refetch), plus the owner's usual Find My audience via updateMyLocation.
import { haversineMeters, now, walkingMinutes, type ID, type LatLng, type Quest } from '@/shared';
import type { CoreStore } from './core';
import { forbidden, notFound } from './errors';
import { updateMyLocation } from './locations';
import { publish } from './realtime-server';

/** A walker disappears this long after their last step. */
export const WALK_FRESH_MIN = 10;

export type Walker = {
  id: ID; name: string; avatarUrl: string;
  location: LatLng; updatedAt: string;
  /** Minutes on foot to the plan, from this position. */
  minutesAway: number;
};

export const walkLabel = (q: Pick<Quest, 'venueName' | 'title'>) => `On the way to ${q.venueName || q.title}`;

async function memberQuest(store: CoreStore, viewerId: ID, questId: ID) {
  const v = await store.view();
  const q = v.questById.get(questId);
  if (!q) throw notFound('quest_not_found');
  const members = v.questMemberIds(q.id);
  if (!members.includes(viewerId)) throw forbidden('join the plan to walk there together');
  return { v, q, members };
}

/** The other members walking to this plan right now, with their exact position. */
export async function walkers(store: CoreStore, viewerId: ID, questId: ID): Promise<Walker[]> {
  const { v, q, members } = await memberQuest(store, viewerId, questId);
  const t = now();
  if (q.status === 'done' || q.endsAt <= t.toISOString()) return [];
  const label = walkLabel(q);
  const fresh = t.getTime() - WALK_FRESH_MIN * 60_000;
  const out: Walker[] = [];
  for (const s of v.db.locationShares ?? []) {
    if (s.userId === viewerId || !members.includes(s.userId)) continue;
    if (s.placeLabel !== label || new Date(s.updatedAt).getTime() < fresh) continue;
    const p = v.profileById.get(s.userId);
    if (!p) continue;
    const shown = v.profileFor(viewerId, p);
    out.push({
      id: p.id, name: shown.name, avatarUrl: shown.avatarUrl,
      location: s.location, updatedAt: s.updatedAt,
      minutesAway: walkingMinutes(s.location, q.location),
    });
  }
  return out.sort((a, b) => a.minutesAway - b.minutesAway);
}

/** One step of the viewer's walk to the plan. */
export async function postWalkStep(store: CoreStore, viewerId: ID, questId: ID, location: LatLng): Promise<{ ok: true }> {
  const { v, q, members } = await memberQuest(store, viewerId, questId);
  const t = now().toISOString();
  if (q.status === 'done' || q.endsAt <= t) throw forbidden('this plan is over');
  // A step from across town is not a walk to this plan.
  if (haversineMeters(location, q.location) > 5_000) throw forbidden('too far from the plan to walk there');
  const had = (v.db.locationShares ?? []).some((s) => s.userId === viewerId);
  await updateMyLocation(store, viewerId, { location, placeLabel: walkLabel(q), ...(had ? {} : { paused: true }) });
  await Promise.all(members.filter((id) => id !== viewerId).map((id) => publish(`user:${id}`, { type: 'location', id: viewerId })));
  return { ok: true };
}
