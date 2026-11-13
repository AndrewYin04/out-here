// Arrival → selfie → rating → memory board (#47, docs/DEMO_FLOW.md scenes 9–11).
// The 3D view opens the selfie when you reach a plan you joined. Saving it fires two window
// events other parts of the app hook into, so the pieces stay in their own areas:
//   - MEMORY_SAVED: the memory board refetches (the server's `user:<id>` memory broadcast only
//     reaches the *other* crew members, so the uploader's own board listens for this).
//   - RATE_HANGOUT: "Rate it" after the selfie. The rating questionnaire (#18) listens, opens for
//     `questId`, and pre-fills `photoIds`. It calls preventDefault() to say it handled it.
import { EARLY_PHOTO_MS, type ID } from '@/shared';

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
 * Up to EARLY_PHOTO_MS before the start the photo opens right away: you walked there together and
 * the server forms the crew early (docs/UX_PLAN.md). Earlier than that, the arrival waits with a
 * countdown to the start. `minutes` is always the time until the start.
 */
export function arrivalWait(startsAt: string, now: number): { early: boolean; minutes: number } {
  const ms = new Date(startsAt).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return { early: false, minutes: 0 };
  return { early: ms > EARLY_PHOTO_MS, minutes: Math.max(1, Math.ceil(ms / 60_000)) };
}

/** "Take a photo together" from anywhere (the Up next card): the 3D view opens its selfie. */
export const OPEN_SELFIE = 'outhere:open-selfie';

/** Asks the arrival selfie to open for `questId`. Returns false when nothing on the page handled it. */
export function requestSelfie(questId: ID): boolean {
  const e = new CustomEvent<ID>(OPEN_SELFIE, { detail: questId, cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
}

/** Who actually arrived at a plan, remembered for this tab so the memory page names them, not every member. */
const HERE_KEY = (questId: string) => `outhere.here.${questId}`;
export function rememberHere(questId: string, ids: string[]): void {
  try { window.sessionStorage.setItem(HERE_KEY(questId), JSON.stringify(ids)); } catch { /* private mode: page falls back to all members */ }
}
export function recallHere(questId: string): string[] | null {
  try {
    const raw = window.sessionStorage.getItem(HERE_KEY(questId));
    const ids = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(ids) && ids.every((x) => typeof x === 'string') && ids.length > 0 ? ids : null;
  } catch { return null; }
}
