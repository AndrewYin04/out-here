// Plain-language reasons for the plans Muse ruled out. Pure and client-safe: the route
// returns the numbers code compared (walk minutes, price, start time) and the sheet formats them.
import { MAX_WALK_MINUTES, formatDemoTime, type ID, type MuseIntent } from '@/shared';

export type DropReasonCode =
  | 'not_open' | 'already_member' | 'full' | 'activity' | 'budget' | 'walk' | 'window' | 'late' | 'small_group';

/**
 * What the plan route returns for each candidate it left out. The numbers are the ones code
 * compared; they are optional so an older response still renders with `text`.
 */
export type DroppedView = {
  questId: ID; title: string; venueName: string; emoji: string; reason: DropReasonCode; text: string;
  walkMinutes?: number; priceMax?: number; startsAt?: string;
};

/** Reasons worth showing: the rest ("not what you asked for") would list every quest on the map. */
const SHOWN: ReadonlySet<DropReasonCode> = new Set(['budget', 'walk', 'window', 'late', 'full', 'already_member', 'small_group']);

export function dropText(reason: DropReasonCode, d: { walkMinutes: number; priceMax: number; budgetMax: number | null }): string {
  switch (reason) {
    case 'walk': return `${d.walkMinutes} min walk, too far`;
    case 'budget': return d.budgetMax === null ? `$${d.priceMax}, over your budget` : `$${d.priceMax}, over your $${d.budgetMax} budget`;
    case 'window': return "doesn't fit your time, walk included";
    case 'late': return 'starts before you can get there';
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

// ---------- "ruled out" rows on the plan sheet ----------

/** The limits code checked each quest against, from the parsed ask. */
export type AskLimits = { budgetMax: number | null; walkCap: number; windowEnd: string | null };

export function askLimits(intent: Pick<MuseIntent, 'budgetMax' | 'maxWalkMinutes' | 'windowEnd'>): AskLimits {
  return {
    budgetMax: intent.budgetMax,
    // candidates.ts walkCap(): the ask's limit, else the default cap
    walkCap: intent.maxWalkMinutes ?? MAX_WALK_MINUTES,
    windowEnd: Number.isFinite(Date.parse(intent.windowEnd)) ? intent.windowEnd : null,
  };
}

/**
 * One ruled-out reason with the number code compared against your limit:
 * "28 min walk, over your 25", "$26, over your $15". Falls back to the route's text when the
 * numbers are missing.
 */
export function ruledOutText(d: DroppedView, limits: AskLimits): string {
  switch (d.reason) {
    case 'walk':
      return d.walkMinutes !== undefined ? `${d.walkMinutes} min walk, over your ${limits.walkCap}` : d.text;
    case 'budget':
      if (d.priceMax === undefined) return d.text;
      return limits.budgetMax === null ? `$${d.priceMax}, over your budget` : `$${d.priceMax}, over your $${limits.budgetMax}`;
    case 'window':
      // candidates.ts drops on "window" when the quest starts after the window or ends before it
      if (!d.startsAt || !limits.windowEnd) return d.text;
      return Date.parse(d.startsAt) >= Date.parse(limits.windowEnd)
        ? `starts ${formatDemoTime(d.startsAt)}, after you're free till ${formatDemoTime(limits.windowEnd)}`
        : 'over before your free time starts';
    case 'late':
      if (!d.startsAt || d.walkMinutes === undefined) return d.text;
      return `starts ${formatDemoTime(d.startsAt)}, before a ${d.walkMinutes} min walk gets you there`;
    default:
      return d.text;
  }
}

export type RuledOutRow = { questId: ID; emoji: string; title: string; reason: DropReasonCode; text: string };
export type RuledOut = {
  /** Rows shown without a tap: distance and price first, then time and seats. */
  top: RuledOutRow[];
  /** The other rows with a concrete reason, shown on "more". */
  more: RuledOutRow[];
  /** Plans left out because they are not what you asked for: counted, not listed. */
  offTopic: number;
};

const ORDER: readonly DropReasonCode[] = ['walk', 'budget', 'late', 'window', 'full', 'small_group', 'already_member', 'not_open'];

export function ruledOut(all: DroppedView[], limits: AskLimits, topN = 3): RuledOut {
  const seen = new Set<ID>();
  const unique = all.filter((d) => !seen.has(d.questId) && seen.add(d.questId));
  const rows = unique
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => d.reason !== 'activity')
    .sort((a, b) => ORDER.indexOf(a.d.reason) - ORDER.indexOf(b.d.reason) || a.i - b.i)
    .map(({ d }) => ({ questId: d.questId, emoji: d.emoji, title: d.title, reason: d.reason, text: ruledOutText(d, limits) }));
  return { top: rows.slice(0, topN), more: rows.slice(topN), offTopic: unique.length - rows.length };
}
