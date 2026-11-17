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

export type FactReasonOptions = { budgetMax?: number | null; windowEnd?: string | null };

/**
 * A reason built only from checked candidate data. It prefers facts the card's meta row
 * (walk minutes, start time, price) does not already show: a free friend's bubble or shared
 * interest, the viewer's own interests by name, a friend already going, then the budget
 * headroom ("$8 under your $15 budget"). Returns '' when only meta-row facts remain, and
 * the card then hides the reason line instead of printing a copy of the meta row.
 */
export function factReason(c: PlanCandidate, opts: FactReasonOptions = {}): string {
  const f = c.friendOverlap[0];
  if (f?.status) return `${f.firstName}'s status says "${f.status}".`;
  if (f?.sharedWithQuest[0]) return `You and ${f.firstName} both like ${f.sharedWithQuest[0]}.`;
  const broad = new Set([...BROAD_WORDS, c.quest.category]);
  const interests = c.viewerInterests.filter((i) => !broad.has(i.trim().toLowerCase()));
  if (interests.length > 0) return `You listed ${interests.slice(0, 2).join(' and ')} in your interests.`;
  const m = c.friendMembers[0];
  if (m) return `Your friend ${m.firstName} is already going.`;
  const asked = c.matchedActivities.find((a) => !broad.has(a.trim().toLowerCase()));
  if (asked) return `It is the ${asked} you asked for.`;
  const budget = opts.budgetMax ?? null;
  if (budget !== null && budget > c.quest.priceMax) {
    return `$${budget - c.quest.priceMax} under your $${budget} budget.`;
  }
  if (opts.windowEnd) {
    const spare = Math.floor((Date.parse(opts.windowEnd) - Date.parse(c.arriveAt)) / 60_000);
    if (spare >= 5) return `You get there with ${spare} min of your free time left.`;
  }
  const tags = c.quest.tags.filter((t) => !broad.has(t.trim().toLowerCase())).slice(0, 2);
  if (tags.length > 0) return `For people into ${tags.join(' and ')}.`;
  return '';
}

/** The reason as given when it cites a fact; otherwise the fact-based reason (possibly ''). */
export function concreteReason(reason: string, c: PlanCandidate, opts: FactReasonOptions = {}): string {
  return hasConcreteFact(reason, c) ? reason : factReason(c, opts);
}
