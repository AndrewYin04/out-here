// Client calls for the plan sheet. The plan call uses fetch directly because the UI needs the
// x-muse-source and x-muse-mode headers (apiFetch returns only the body).
import { ApiFetchError, apiPost, currentPersona } from '@/features/data';
import { DEMO_CENTER, type LatLng, type MusePlan, type PlanStageEvent } from '@/shared';
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

/** A plan request that has not answered in this long is sent again once (a dropped request on stage Wi-Fi). */
const PLAN_ATTEMPT_MS = 15_000;

export async function requestPlan(text: string, signal?: AbortSignal): Promise<PlanResult> {
  try {
    return await planAttempt(text, signal, PLAN_ATTEMPT_MS);
  } catch (e) {
    if (signal?.aborted || !(e instanceof DOMException && e.name === 'TimeoutError')) throw e;
    return planAttempt(text, signal, PLAN_ATTEMPT_MS * 2);
  }
}

async function planAttempt(text: string, outer: AbortSignal | undefined, ms: number): Promise<PlanResult> {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort(outer?.reason);
  outer?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => ctrl.abort(new DOMException('plan timed out', 'TimeoutError')), ms);
  try {
    return await planOnce(text, ctrl.signal);
  } catch (e) {
    if (ctrl.signal.aborted && !outer?.aborted) throw new DOMException('plan timed out', 'TimeoutError');
    throw e;
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', onAbort);
  }
}

async function planOnce(text: string, signal?: AbortSignal): Promise<PlanResult> {
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
 * The same plan request, streamed: onStage gets each pipeline stage as the server finishes it (what
 * Muse read, who is free, what fit, which model ranked, what validation kept), then the result
 * resolves exactly like requestPlan. A server or proxy that does not stream still works: the
 * stages simply arrive together just before the result.
 */
export async function requestPlanStream(text: string, onStage: (e: PlanStageEvent) => void, signal?: AbortSignal): Promise<PlanResult> {
  const res = await fetch('/api/muse/plan?stream=1', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-persona': currentPersona() },
    body: JSON.stringify({ text }),
    signal,
  });
  if (!res.ok || !res.body) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiFetchError(res.status, data.error ?? `HTTP ${res.status}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let result: PlanResult | null = null;
  const handle = (raw: string) => {
    if (!raw.trim()) return;
    let msg: { type?: string; body?: PlanResponse; headers?: Record<string, string>; status?: number; error?: string } & Partial<PlanStageEvent>;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === 'stage' && msg.stage) { const { type: _t, ...e } = msg; void _t; onStage(e as PlanStageEvent); }
    else if (msg.type === 'error') throw new ApiFetchError(msg.status ?? 502, msg.error ?? 'Muse could not make a plan right now');
    else if (msg.type === 'result' && msg.body) {
      const data = msg.body, h = msg.headers ?? {};
      const mode = h['x-muse-mode'] ?? data.meta?.mode;
      const museSource = h['x-muse-source'] === 'fallback' || data.meta?.source === 'fallback'
        ? 'fallback' : mode === 'mock' || data.meta?.source === 'mock' ? 'mock' : 'muse';
      result = { plan: data, museSource };
    }
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) { handle(buf.slice(0, nl)); buf = buf.slice(nl + 1); }
    if (done) break;
  }
  handle(buf);
  if (!result) throw new ApiFetchError(502, 'Muse could not make a plan right now');
  return result;
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
