// Muse matching: the private "hang out with them again?" signal from post-hangout ratings
// (docs/HANGOUT_RATINGS.md, issue #11). Server only: never send these values to the browser and
// never show them as a reason. Until feat/hangout-ratings merges, the store has no
// mutualHangAgain and every pair is 'unknown'; after the merge this calls it automatically.
import type { ID } from '@/shared';

export type PairSignal = 'both_yes' | 'one_no' | 'unknown';

type MaybeRatings = { mutualHangAgain?: (a: ID, b: ID) => Promise<PairSignal> };

/** Signals for every pair among `ids` (viewer included), keyed "a|b" with a < b. */
export async function pairSignals(store: object, ids: readonly ID[]): Promise<(a: ID, b: ID) => PairSignal> {
  const fn = (store as MaybeRatings).mutualHangAgain;
  const out = new Map<string, PairSignal>();
  const key = (a: ID, b: ID) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  if (typeof fn === 'function') {
    const pairs: [ID, ID][] = [];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) pairs.push([ids[i], ids[j]]);
    const results = await Promise.all(pairs.map(([a, b]) => fn.call(store, a, b).catch(() => 'unknown' as const)));
    pairs.forEach(([a, b], i) => out.set(key(a, b), results[i]));
  }
  return (a, b) => out.get(key(a, b)) ?? 'unknown';
}
