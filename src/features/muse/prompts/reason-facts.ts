// The rank prompt asks every reason to cite one concrete fact from the candidate data. Code
// checks that it did; a reason with no fact is replaced by one built from the card's numbers.
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

/** "4 min walk, $7, starts in 9 min": built only from checked numbers. */
export function factReason(c: PlanCandidate, now: Date): string {
  const parts = [`${c.travelMinutes} min walk`, c.quest.priceMax === 0 ? 'free' : `$${c.quest.priceMax}`];
  const startsIn = Math.round((Date.parse(c.quest.startsAt) - now.getTime()) / 60_000);
  parts.push(startsIn <= 0 ? 'happening now' : `starts in ${startsIn} min`);
  const head = parts.join(', ');
  return `${head.charAt(0).toUpperCase()}${head.slice(1)}.`;
}

/** The reason as given when it cites a fact; otherwise the fact-based reason. */
export function concreteReason(reason: string, c: PlanCandidate, now: Date): string {
  return hasConcreteFact(reason, c) ? reason : factReason(c, now);
}
