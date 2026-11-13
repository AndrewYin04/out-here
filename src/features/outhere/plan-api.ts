// Client calls for the plan sheet. The plan call uses fetch directly because the UI needs the
// x-muse-source and x-muse-mode headers (apiFetch returns only the body).
import { ApiFetchError, apiPost, currentPersona } from '@/features/data';
import { DEMO_CENTER, type LatLng, type MusePlan } from '@/shared';
import type { DroppedView } from './dropped';
import { availabilityChanged } from './plan-state';

export type PlanResponse = MusePlan & {
  meta: {
    mode: 'mock' | 'live'; source: 'muse' | 'fallback' | 'mock'; contextSource: 'store' | 'seed';
    dropped: DroppedView[]; origin?: LatLng; friendsChecked?: number;
    // What Muse did, for the "Muse's work" steps. Optional so an older response still renders.
    understood?: boolean; candidateCount?: number;
    cache?: { parse:boolean; rank:boolean };
    friendsFree?: { friendId?: string; firstName: string; freeUntil: string }[];
    models?: { parse: string; rank: string }; rankFallback?: boolean;
    timings?: { totalMs: number };
    /** Agent coordination checks availability, never attendance or consent. */
    coordination?: boolean;
  };
};
/** "mock" = offline heuristic text, "fallback" = code answered after a live model step failed. */
export type PlanResult = { plan: PlanResponse; museSource: 'muse' | 'fallback' | 'mock' };

export async function requestPlan(text: string, signal?: AbortSignal): Promise<PlanResult> {
  const res = await fetch('/api/muse/plan', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-persona': currentPersona() },
    // No location: the server starts from the viewer's own place (Alex: the demo center, others: home).
    body: JSON.stringify({ text }),
    signal,
  });
  const data = (await res.json().catch(() => ({}))) as PlanResponse & { error?: string };
  if (!res.ok) throw new ApiFetchError(res.status, data.error ?? `HTTP ${res.status}`);
  const header = res.headers.get('x-muse-source');
  const mode = res.headers.get('x-muse-mode') ?? data.meta?.mode;
  const museSource = header === 'fallback' || data.meta?.source === 'fallback'
    ? 'fallback'
    : mode === 'mock' || data.meta?.source === 'mock' ? 'mock' : 'muse';
  return { plan: data, museSource };
}

/**
 * Tells friends the viewer is free for the window Muse resolved, from where the plan started.
 * Best effort. The server keeps one active signal per person, so a new ask replaces the last one.
 */
export async function shareAvailability(text: string, plan: PlanResponse): Promise<void> {
  const startsAt = new Date(Math.max(Date.now(), Date.parse(plan.intent.windowStart) || Date.now()));
  const endsAt = new Date(Date.parse(plan.intent.windowEnd) || 0);
  if (!(endsAt > startsAt)) return;
  try {
    await apiPost('/api/availability', {
      text, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), location: plan.meta?.origin ?? DEMO_CENTER,
    });
    availabilityChanged();
  } catch {
    // the plan still works without the shared signal
  }
}

export function errorText(e: unknown, fallback: string): string {
  if (e instanceof ApiFetchError) {
    if (e.message === 'quest_full') return 'That plan just filled up.';
    if (e.message === 'invite_already_answered') return 'You already answered this invite.';
    if (e.status === 404) return 'That plan is no longer available.';
  }
  return fallback;
}
