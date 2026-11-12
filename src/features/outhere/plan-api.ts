// Client calls for the plan sheet. The plan call uses fetch directly because the UI needs the
// x-muse-source header (apiFetch returns only the body).
import { ApiFetchError, apiPost, currentPersona } from '@/features/data';
import { DEMO_CENTER, type MusePlan } from '@/shared';
import type { DroppedView } from './dropped';

export type PlanResponse = MusePlan & {
  meta: { mode: 'mock' | 'live'; source: 'muse' | 'fallback' | 'mock'; contextSource: 'store' | 'seed'; dropped: DroppedView[] };
};
export type PlanResult = { plan: PlanResponse; museSource: 'muse' | 'fallback' };

export async function requestPlan(text: string): Promise<PlanResult> {
  const res = await fetch('/api/muse/plan', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-persona': currentPersona() },
    body: JSON.stringify({ text, location: DEMO_CENTER }),
  });
  const data = (await res.json().catch(() => ({}))) as PlanResponse & { error?: string };
  if (!res.ok) throw new ApiFetchError(res.status, data.error ?? `HTTP ${res.status}`);
  const header = res.headers.get('x-muse-source');
  return { plan: data, museSource: header === 'fallback' || data.meta?.source === 'fallback' ? 'fallback' : 'muse' };
}

/** Tells friends the viewer is free for the window Muse resolved. Best effort. */
export async function shareAvailability(text: string, plan: MusePlan): Promise<void> {
  const startsAt = new Date(Math.max(Date.now(), Date.parse(plan.intent.windowStart) || Date.now()));
  const endsAt = new Date(Date.parse(plan.intent.windowEnd) || 0);
  if (!(endsAt > startsAt)) return;
  try {
    await apiPost('/api/availability', { text, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), location: DEMO_CENTER });
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
