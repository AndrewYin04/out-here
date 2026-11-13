// Arrival → selfie → rating → memory board (#47, docs/DEMO_FLOW.md scenes 9–11).
// The 3D view opens the selfie when you reach a plan you joined. Saving it fires two window
// events other parts of the app hook into, so the pieces stay in their own areas:
//   - MEMORY_SAVED: the memory board refetches (the server's `user:<id>` memory broadcast only
//     reaches the *other* crew members, so the uploader's own board listens for this).
//   - RATE_HANGOUT: "Rate it" after the selfie. The rating questionnaire (#18) listens, opens for
//     `questId`, and pre-fills `photoIds`. It calls preventDefault() to say it handled it.
import type { ID } from '@/shared';

export const MEMORY_SAVED = 'outhere:memory-saved';
export const RATE_HANGOUT = 'outhere:rate-hangout';

export type MemorySavedDetail = { questId: ID; crewId: ID; memoryId: ID };
export type RateHangoutDetail = { questId: ID; crewId: ID | null; photoIds: ID[] };

export function emitMemorySaved(detail: MemorySavedDetail) {
  window.dispatchEvent(new CustomEvent<MemorySavedDetail>(MEMORY_SAVED, { detail }));
}

/** Asks the rating questionnaire to open. Returns false when nothing on the page handled it. */
export function requestRating(detail: RateHangoutDetail): boolean {
  const e = new CustomEvent<RateHangoutDetail>(RATE_HANGOUT, { detail, cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
}

/**
 * Before a plan starts the server won't make its crew album yet (`complete` is attendees only,
 * after the start), so an early arrival waits with a countdown. The demo walk is sped up, so this
 * happens on stage.
 */
export function arrivalWait(startsAt: string, now: number): { early: boolean; minutes: number } {
  const ms = new Date(startsAt).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return { early: false, minutes: 0 };
  return { early: true, minutes: Math.max(1, Math.ceil(ms / 60_000)) };
}
