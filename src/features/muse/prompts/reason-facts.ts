// The rank prompt asks every reason to cite one concrete fact from the candidate data. Code
// checks that it did; a reason with no fact is replaced by one built from candidate data.
import type { PlanCandidate } from '../candidates';

/** Phrases that say nothing specific about this plan. A reason made only of these is replaced. */
export const GENERIC_REASON_PHRASES = [
  'fits your time best', 'fits your time', 'fits your window', 'fits your schedule',
  'open plan nearby', 'great option', 'good option', 'perfect fit', 'a great choice',
];

/** Broad activity words that name no particular interest ("the food plan"). */
const BROAD_WORDS = new Set(['food', 'eat', 'eats', 'drink', 'drinks', 'hang', 'hangout', 'other', 'fun', 'something']);

/** The concrete words a reason may cite: interests by name, friends' names and their own words. */
export function reasonFactWords(c: PlanCandidate): string[] {
  const words = [
    ...c.matchedActivities, ...c.viewerInterests, ...c.quest.tags,
    ...c.friendOverlap.flatMap((f) => [f.firstName, ...f.sharedWithQuest, ...(f.status ? [f.status] : [])]),
    ...c.friendMembers.map((m) => m.firstName),
  ];
  const broad = new Set([...BROAD_WORDS, c.quest.category]);
  return [...new Set(words.map((w) => w.trim().toLowerCase()).filter((w) => w.length >= 3 && !broad.has(w)))];
}

const stripGeneric = (text: string) =>
  GENERIC_REASON_PHRASES.reduce((t, p) => t.split(p).join(' '), text.toLowerCase());

/**
 * True when the reason cites a number (price, walk minutes, a free-until time) or a named
 * interest, friend or bubble from this candidate, outside the generic phrases.
 */
export function hasConcreteFact(reason: string, c: PlanCandidate): boolean {
  const rest = stripGeneric(reason);
  if (/\d/.test(rest)) return true;
  return reasonFactWords(c).some((w) => rest.includes(w));
}

export type FactReasonOptions = {
  budgetMax?: number | null; windowEnd?: string | null;
  /** When the free window starts (ISO): with windowEnd it gives "your 15 min". */
  windowStart?: string | null;
  /** The plan's clock. Accepted for callers; the fit reason no longer repeats the start time. */
  now?: Date | null;
};

const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;

/**
 * A friend's status bubble paraphrased, never pasted: the bubble line is
 * "craving dumplings 🥟 · lunch break for ~45 min · wants to try Dumpling Den", and this returns
 * "Maya's craving dumplings and wants to try Dumpling Den". The "doing" part is left out; the
 * reason names the free-until time instead. Null when the line has no thought or wish.
 */
export function statusPhrase(firstName: string, line: string | null | undefined): string | null {
  if (!line) return null;
  const parts = line.split(' · ').map((p) => p.replace(EMOJI, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const wants = parts.find((p) => /^wants to /i.test(p)) ?? null;
  const thought = parts[0] && parts[0] !== wants ? parts[0] : null;
  // "craving dumplings" reads as "Maya's craving dumplings"; anything else is quoted, short
  const said = thought
    ? /^[a-z]+ing\b/i.test(thought) ? `${firstName}'s ${thought}` : `${firstName} says "${thought}"`
    : null;
  if (said && wants) {
    const both = `${said} and ${wants}`;
    return both.length <= 80 ? both : said;
  }
  return said ?? (wants ? `${firstName} ${wants}` : null);
}

/**
 * "Fits inside your 40 min, $8 under your $15": the concrete fit for a pick with no friend. The
 * card's meta row already shows the walk, the start and the price, so this names only what that
 * row does not: the trip fits the window, and what the plan leaves of the budget. '' when the
 * trip does not fit a window (the budget alone is never a reason).
 */
function fitReason(c: PlanCandidate, opts: FactReasonOptions): string {
  const start = Date.parse(opts.windowStart ?? '');
  const end = Date.parse(opts.windowEnd ?? '');
  if (!Number.isFinite(end) || Date.parse(c.arriveAt) > end) return '';
  const mins = Number.isFinite(start) && end > start ? Math.round((end - start) / 60_000) : null;
  const fits = mins !== null && mins <= 120 ? `Fits inside your ${mins} min` : 'Fits your free time';
  const budget = opts.budgetMax ?? null;
  if (budget === null || budget < c.quest.priceMax) return `${fits}.`;
  const left = budget - c.quest.priceMax;
  const money = c.quest.priceMax === 0 ? `costs nothing of your $${budget}` : left === 0 ? `uses exactly your $${budget}` : `$${left} under your $${budget}`;
  return `${fits}, ${money}.`;
}

/**
 * A reason built only from checked candidate data: a free friend's bubble (paraphrased) or shared
 * interest, the viewer's own interests by name, a friend already going, the activity asked for.
 * With none of those it names the concrete fit ("Fits inside your 15 min, $8 under your $15"),
 * never a fact the card's meta row shows and never the budget alone. Returns '' only when
 * nothing is left to cite.
 */
export function factReason(c: PlanCandidate, opts: FactReasonOptions = {}): string {
  const f = c.friendOverlap[0];
  const said = f ? statusPhrase(f.firstName, f.status) : null;
  if (said) return `${said}.`;
  if (f?.sharedWithQuest[0]) return `You and ${f.firstName} both like ${f.sharedWithQuest[0]}.`;
  const broad = new Set([...BROAD_WORDS, c.quest.category]);
  const interests = c.viewerInterests.filter((i) => !broad.has(i.trim().toLowerCase()));
  if (interests.length > 0) return `You listed ${interests.slice(0, 2).join(' and ')} in your interests.`;
  const m = c.friendMembers[0];
  if (m) return `Your friend ${m.firstName} is already going.`;
  const asked = c.matchedActivities.find((a) => !broad.has(a.trim().toLowerCase()));
  if (asked) return `It is the ${asked} you asked for.`;
  const fit = opts.windowEnd ? fitReason(c, opts) : '';
  if (fit) return fit;
  const tags = c.quest.tags.filter((t) => !broad.has(t.trim().toLowerCase())).slice(0, 2);
  if (tags.length > 0) return `For people into ${tags.join(' and ')}.`;
  return '';
}

/** The reason as given when it cites a fact; otherwise the fact-based reason (possibly ''). */
export function concreteReason(reason: string, c: PlanCandidate, opts: FactReasonOptions = {}): string {
  return hasConcreteFact(reason, c) ? reason : factReason(c, opts);
}
