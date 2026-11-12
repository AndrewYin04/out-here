// Plain-language reasons for the "Why not others?" list. Pure and client-safe: the route
// computes the detail (walk minutes, price) and the sheet only renders strings.
import type { ID } from '@/shared';

export type DropReasonCode =
  | 'not_open' | 'already_member' | 'full' | 'activity' | 'budget' | 'walk' | 'window' | 'late' | 'small_group';

/** What the plan route returns for each candidate it left out. */
export type DroppedView = { questId: ID; title: string; venueName: string; emoji: string; reason: DropReasonCode; text: string };

/** Reasons worth showing: the rest ("not what you asked for") would list every quest on the map. */
const SHOWN: ReadonlySet<DropReasonCode> = new Set(['budget', 'walk', 'window', 'late', 'full', 'already_member', 'small_group']);

export function dropText(reason: DropReasonCode, d: { walkMinutes: number; priceMax: number; budgetMax: number | null }): string {
  switch (reason) {
    case 'walk': return `${d.walkMinutes} min walk, too far`;
    case 'budget': return d.budgetMax === null ? `$${d.priceMax}, over your budget` : `$${d.priceMax}, over your $${d.budgetMax} budget`;
    case 'window': return "doesn't fit your time, walk included";
    case 'late': return 'starts after your window';
    case 'full': return 'no seats left';
    case 'already_member': return "you're already going";
    case 'small_group': return 'needs a bigger group to join as a stranger';
    case 'not_open': return 'not open right now';
    case 'activity': return 'not what you asked for';
  }
}

export function shownDrops(all: DroppedView[], max = 6): DroppedView[] {
  const seen = new Set<ID>();
  return all.filter((d) => SHOWN.has(d.reason) && !seen.has(d.questId) && seen.add(d.questId)).slice(0, max);
}
