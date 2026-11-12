// Privacy guard for intro text (review E4, P2). A person's "looking for" settings are private:
// the other side may learn that the two of them want the same thing, never the other person's
// words. Model-written notes, summaries and agent turns pass through here before they are
// stored, and every card text again when it is built. A text leaks when it contains
//  - the other person's looking-for text,
//  - two adjacent words from it ("gig nights", "product people") in either order, or
//  - one rare word from it ("gig", "pilates")
// that the viewer could not have seen elsewhere (their own settings, their own profile, the other
// person's profile as the viewer sees it, the trust path, the first step). Words are compared
// lowercased, split at hyphens and slashes, with plurals folded ("gigs" = "gig").
import type { AgentTurn, IntroProfile, Profile } from '@/shared';
import { kindsOn, stem } from './rules';

const STOP = new Set([
  'the', 'and', 'for', 'with', 'about', 'some', 'more', 'into', 'from', 'that', 'this', 'who', 'you', 'your',
  'are', 'was', 'were', 'has', 'have', 'had', 'but', 'not', 'any', 'all', 'can', 'get', 'out', 'our', 'their',
  'they', 'them', 'his', 'her', 'its', 'one', 'also', 'just', 'like', 'want', 'wants', 'looking',
  'someone', 'something', 'both',
]);
/**
 * Words too common to give a want away on their own; they still count inside a pair
 * ("product people" leaks, "people" alone does not).
 */
const COMMON = new Set([
  'friend', 'people', 'person', 'new', 'meet', 'coffee', 'chat', 'work', 'time', 'week', 'weekend', 'night', 'day',
  'fun', 'together', 'around', 'local', 'nearby', 'hang', 'group', 'other', 'good', 'great', 'love', 'thing',
]);

const words = (t: string) => t.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
/** Stemmed words, with stop words and words under 3 letters kept as '' so they break a pair. */
const tokens = (t: string) => words(t).map((w) => (w.length >= 3 && !STOP.has(w) ? stem(w) : ''));
const content = (w: string) => w !== '';

/** Adjacent content-word pairs, order-free: "friends for local shows" -> ["local|show"]. */
function bigrams(t: string): string[] {
  const ws = tokens(t);
  const out: string[] = [];
  for (let i = 0; i + 1 < ws.length; i++) {
    if (content(ws[i]) && content(ws[i + 1])) out.push([ws[i], ws[i + 1]].sort().join('|'));
  }
  return out;
}

/** Every looking-for text a person has written, on or off (all of it is private). */
export function privateTexts(p: IntroProfile): string[] {
  return Object.values(p.kinds).map((k) => k?.lookingFor?.trim() ?? '').filter((s) => s.length > 0);
}

export type PrivacyGuard = {
  /** True when the text quotes the other side's private looking-for. */
  leaks: (text: string) => boolean;
  /** Reasons with leaking ones rewritten as a shared-interest reason (or dropped), no repeats. */
  reasons: (rs: string[]) => string[];
  /** The text, or `fallback` when it leaks. */
  text: (t: string, fallback: string) => string;
  /** This side's log: own turns that leak show their outcome instead; other outcomes that leak show "replied". */
  log: (log: AgentTurn[], side: 'a' | 'b') => AgentTurn[];
};

/**
 * The guard for what `viewer` may read about `other`. `viewerIntro` is the viewer's own settings
 * (with an on-request override if any); `secrets` is the other side's private looking-for text.
 * `seenOther` is the other profile as the viewer may see it; `extra` is other visible text
 * (the viewer's stored settings, trust labels, the first step).
 */
export function privacyGuard(opts: {
  viewer: Profile; viewerIntro: IntroProfile; seenOther: Profile; secrets: string[]; extra?: string[];
}): PrivacyGuard {
  const { viewer, viewerIntro, seenOther, secrets } = opts;
  const mine = privateTexts(viewerIntro);
  const visible = [
    ...mine, ...viewer.interests, viewer.bio ?? '', viewer.job ?? '',
    ...seenOther.interests, seenOther.bio ?? '', seenOther.job ?? '', ...(opts.extra ?? []),
  ];
  const allowed = new Set(visible.flatMap(bigrams));
  const secretPhrases = [...new Set(secrets.flatMap(bigrams))].filter((b) => !allowed.has(b));
  const seenWords = new Set(visible.flatMap(tokens));
  const rareWords = [...new Set(secrets.flatMap(tokens))].filter((w) => content(w) && !COMMON.has(w) && !seenWords.has(w));

  const leaks = (text: string) => {
    if (!text) return false;
    const low = text.toLowerCase();
    if (secrets.some((s) => s.length >= 6 && low.includes(s.toLowerCase()))) return true;
    const have = new Set(bigrams(text));
    if (secretPhrases.some((b) => have.has(b))) return true;
    const ws = new Set(tokens(text));
    return rareWords.some((w) => ws.has(w));
  };

  /** "You're both looking for people into local shows", from words both sides wrote. */
  const sharedReason = (): string | null => {
    const theirs = new Set(secrets.flatMap(tokens).filter(content));
    for (const k of kindsOn(viewerIntro)) {
      const ws = words(viewerIntro.kinds[k].lookingFor);
      // Longest run of consecutive content words the other side also used, in the viewer's spelling.
      let best: string[] = []; let run: string[] = [];
      for (const w of ws) {
        const t = tokens(w)[0] ?? '';
        if (content(t) && theirs.has(t)) { run.push(w); if (run.length > best.length) best = [...run]; } else run = [];
      }
      if (best.length) return `You're both looking for people into ${best.join(' ')}`;
    }
    const otherInterests = new Set(seenOther.interests.map((i) => i.toLowerCase()));
    const i = viewer.interests.find((x) => otherInterests.has(x.toLowerCase()));
    return i ? `You're both into ${i}` : null;
  };

  return {
    leaks,
    reasons: (rs) => {
      const out: string[] = [];
      for (const r of rs) {
        const safe = leaks(r) ? sharedReason() : r;
        if (safe && !out.some((x) => x.toLowerCase() === safe.toLowerCase())) out.push(safe);
      }
      return out;
    },
    text: (t, fallback) => (leaks(t) ? fallback : t),
    log: (log, side) => log.map((t) => {
      if (t.agent === side) {
        if (!leaks(t.text)) return t;
        const o = t.outcome && !leaks(t.outcome) ? t.outcome : 'replied';
        return { ...t, text: o.charAt(0).toUpperCase() + o.slice(1), outcome: o };
      }
      return t.outcome && leaks(t.outcome) ? { ...t, text: '', outcome: 'replied' } : t;
    }),
  };
}
