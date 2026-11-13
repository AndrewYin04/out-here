// Beli-style placement for the rating questionnaire. Pure, so Vitest covers it.
//
// The viewer picks a bucket (loved / fine / meh). Their past ratings in that bucket, sorted from
// best to worst, form a list. "Which was better?" runs a binary search over that list for the new
// hangout's slot, asking at most MAX_COMPARISONS questions. The score is the midpoint between the
// neighbours of that slot, clamped to the bucket's range. An empty bucket, or a skipped step,
// gives the bucket's midpoint.
import { VERDICT_RANGES, type HangoutVerdict } from '@/shared';

export const MAX_COMPARISONS = 3;

/** Binary-search state: the new hangout's slot lies in [lo, hi] of the best-first list. */
export type Placement = { lo: number; hi: number; asked: number };

export const round1 = (n: number) => Math.round(n * 10 + 1e-9) / 10;

export function startPlacement(count: number): Placement {
  return { lo: 0, hi: count, asked: 0 };
}

/** Index of the past hangout to compare with next, or null when placement is finished. */
export function nextComparison(p: Placement, max = MAX_COMPARISONS): number | null {
  if (p.lo >= p.hi || p.asked >= max) return null;
  return Math.floor((p.lo + p.hi) / 2);
}

/** Records the answer to "Which was better?" against the item nextComparison returned. */
export function answerComparison(p: Placement, newIsBetter: boolean): Placement {
  const mid = Math.floor((p.lo + p.hi) / 2);
  return newIsBetter ? { lo: p.lo, hi: mid, asked: p.asked + 1 } : { lo: mid + 1, hi: p.hi, asked: p.asked + 1 };
}

/** The slot once comparisons stop: exact when lo === hi, else the middle of what is left. */
export function placementIndex(p: Placement): number {
  return p.lo >= p.hi ? p.lo : Math.floor((p.lo + p.hi) / 2);
}

export function bucketMidpoint(verdict: HangoutVerdict): number {
  const [lo, hi] = VERDICT_RANGES[verdict];
  return round1((lo + hi) / 2);
}

/**
 * Score for a hangout placed at `index` in `scoresBestFirst` (the bucket's past scores, best
 * first): halfway between its neighbours, where the bucket's ends stand in for missing ones.
 */
export function scoreAt(verdict: HangoutVerdict, scoresBestFirst: number[], index: number): number {
  const [lo, hi] = VERDICT_RANGES[verdict];
  if (scoresBestFirst.length === 0) return bucketMidpoint(verdict);
  const i = Math.max(0, Math.min(index, scoresBestFirst.length));
  const above = i === 0 ? hi : scoresBestFirst[i - 1];
  const below = i === scoresBestFirst.length ? lo : scoresBestFirst[i];
  return Math.min(hi, Math.max(lo, round1((above + below) / 2)));
}

/** 1-based rank of `score` among all the viewer's scores (ties rank together). */
export function rankOf(score: number, allScores: number[]): number {
  return allScores.filter((s) => s > score).length + 1;
}
