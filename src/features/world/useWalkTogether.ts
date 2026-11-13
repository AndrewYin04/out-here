'use client';
// Walking there together (#46, DEMO_FLOW scene 8). While you walk to a plan you joined with
// others, your steps go to /api/quests/:id/walk and theirs come back, so each screen shows the
// other person's avatar moving toward the plan. Real GPS is not needed: the demo walk posts too.
//
// Which plan: the one you are walking to ("Walk there"), else the soonest plan you joined that is
// on now or starts within the hour and has someone else in it. Sharing can be stopped from the
// chip on screen; it is per tab and starts on, because joining the plan was the opt-in.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiPost, useApi, type Walker } from '@/features/data';
import { haversineMeters, type LatLng, type Quest } from '@/shared';

/** Post a step at most this often, and only after moving this far. */
const POST_EVERY_MS = 1500;
const POST_MIN_M = 6;
/** Plans starting further out than this are not "walking there now". */
const SOON_MS = 60 * 60_000;

export function walkPlan(quests: Quest[], viewerId: string, walkingTo: string | null, nowMs: number): Quest | null {
  const mine = quests.filter((q) => q.memberIds.includes(viewerId) && q.memberIds.length > 1
    && q.status !== 'done' && new Date(q.endsAt).getTime() > nowMs);
  if (walkingTo) {
    const q = mine.find((x) => x.id === walkingTo);
    if (q) return q;
  }
  return mine
    .filter((q) => new Date(q.startsAt).getTime() - nowMs <= SOON_MS)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0] ?? null;
}

export type WalkTogether = {
  plan: Quest | null;
  walkers: Walker[];
  sharing: boolean;
  setSharing: (on: boolean) => void;
  /** Call every frame you moved; it throttles itself. */
  step: (p: LatLng) => void;
};

export function useWalkTogether(quests: Quest[], viewerId: string, walkingTo: string | null): WalkTogether {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const plan = useMemo(() => walkPlan(quests, viewerId, walkingTo, nowMs), [quests, viewerId, walkingTo, nowMs]);
  const [sharing, setSharing] = useState(true);
  // walk:<planId> carries each member's step (ids only); nothing else refetches on a step.
  const api = useApi<{ walkers: Walker[] }>(plan ? `/api/quests/${plan.id}/walk` : null, plan ? [`walk:${plan.id}`] : []);
  const walkers = useMemo(() => (plan && api.data ? api.data.walkers : []), [plan, api.data]);

  const last = useRef<{ at: number; p: LatLng } | null>(null);
  const planId = plan?.id ?? null;
  const ok = useRef(false);
  ok.current = sharing && !!planId;
  const target = useRef(planId);
  target.current = planId;
  useEffect(() => { last.current = null; }, [planId]);

  const step = useCallback((p: LatLng) => {
    const id = target.current;
    if (!ok.current || !id) return;
    const t = Date.now();
    const prev = last.current;
    if (prev && (t - prev.at < POST_EVERY_MS || haversineMeters(prev.p, p) < POST_MIN_M)) return;
    last.current = { at: t, p };
    // Fire and forget: a dropped step is replaced by the next one.
    void apiPost(`/api/quests/${id}/walk`, { location: { lat: p.lat, lng: p.lng } }).catch(() => {});
  }, []);

  return { plan, walkers, sharing, setSharing, step };
}
