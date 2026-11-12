// Muse Intros rules, in code: reach, trust path, consent-safe candidates, shared facts, the
// quality bar and the weekly cap. Pure functions over one store snapshot (View), so the unit
// tests and the routes agree. The model never decides who is in reach or whether the bar is met.
import {
  haversineMeters, INTRO_KINDS,
  type DatingPrefs, type ID, type Intro, type IntroGender, type IntroKind, type IntroProfile, type Profile, type TrustPath,
} from '@/shared';
import type { View } from '@/features/data/server';

export const SCORE_THRESHOLD = 85;
export const MIN_REASONS = 2;
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** A pair introduced within this window is never proposed again. */
export const REINTRO_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
/** Proposed intros nobody answered expire after this. */
export const INTRO_TTL_MS = 14 * 24 * 60 * 60 * 1000;
/** Pairs the agents vet per round (cheap code score picks them). */
export const AGENT_SHORTLIST = 3;

export const firstName = (p: Pick<Profile, 'name'> | undefined) => p?.name.split(' ')[0] ?? 'Someone';

export function defaultIntroProfile(userId: ID): IntroProfile {
  const off = { on: false, lookingFor: '' };
  return { userId, kinds: { friendship: { ...off }, networking: { ...off }, dating: { ...off } }, datingPrefs: null, maxKm: 25, paused: false };
}

export function introProfileOf(v: View, userId: ID): IntroProfile {
  const row = v.db.introProfiles.find((p) => p.userId === userId);
  if (!row) return defaultIntroProfile(userId);
  const d = defaultIntroProfile(userId);
  return { ...d, ...row, kinds: { ...d.kinds, ...(row.kinds ?? {}) } };
}

export const kindsOn = (p: IntroProfile): IntroKind[] => INTRO_KINDS.filter((k) => p.kinds[k]?.on);

// ---------- reach and trust path ----------
/** Friends-of-friends plus members of the viewer's Groups, never the viewer or a friend. */
export function reachOf(v: View, viewerId: ID): Set<ID> {
  const friends = v.friendIds(viewerId);
  const out = new Set<ID>();
  for (const f of friends) for (const ff of v.friendIds(f)) out.add(ff);
  for (const g of v.groupIdsOf(viewerId)) for (const m of v.groupMemberIds(g)) out.add(m);
  out.delete(viewerId);
  for (const f of friends) out.delete(f);
  return out;
}

/** Named mutual friends first, then shared Groups. Null when the two have no path. */
export function trustPathOf(v: View, a: ID, b: ID): TrustPath | null {
  const mutualIds = v.mutualIds(a, b).sort((x, y) => firstName(v.profileById.get(x)).localeCompare(firstName(v.profileById.get(y))));
  const bGroups = new Set(v.groupIdsOf(b));
  const groupIds = v.groupIdsOf(a).filter((g) => bGroups.has(g)).sort();
  if (!mutualIds.length && !groupIds.length) return null;
  return { mutualIds, groupIds, label: trustLabels(v, { mutualIds, groupIds, label: '' })[0] };
}

/** Chip texts: "You both know Maya", "You're both in Bay Area Local Shows". */
export function trustLabels(v: View, t: TrustPath): string[] {
  const out: string[] = [];
  const names = t.mutualIds.map((id) => firstName(v.profileById.get(id)));
  if (names.length === 1) out.push(`You both know ${names[0]}`);
  else if (names.length === 2) out.push(`You both know ${names[0]} and ${names[1]}`);
  else if (names.length > 2) out.push(`You both know ${names[0]}, ${names[1]} and ${names.length - 2} more`);
  const g = t.groupIds.map((id) => v.groupById.get(id)?.name).filter((n): n is string => !!n);
  if (g.length) out.push(`You're both in ${g[0]}${g.length > 1 ? ` (+${g.length - 1})` : ''}`);
  return out;
}

// ---------- dating ----------
export function genderOf(p: Profile): IntroGender | null {
  const pr = (p.pronouns ?? '').toLowerCase();
  if (pr.startsWith('he')) return 'man';
  if (pr.startsWith('she')) return 'woman';
  if (pr.startsWith('they')) return 'nonbinary';
  return null;
}

/** b fits a's stated preferences (no preferences = anyone 18+). */
export function fitsPrefs(prefs: DatingPrefs | null, b: Profile): boolean {
  const age = b.age ?? null;
  if (age !== null && age < 18) return false;
  if (!prefs) return true;
  if (age === null || age < prefs.ageMin || age > prefs.ageMax) return false;
  const g = genderOf(b);
  return !!g && prefs.genders.includes(g);
}

// ---------- shared facts ----------
const STOP = new Set([
  'people', 'person', 'friends', 'friend', 'someone', 'with', 'about', 'coffee', 'chats', 'chat', 'more', 'some', 'into',
  'buddies', 'buddy', 'partner', 'partners', 'classes', 'work', 'that', 'this', 'from', 'like', 'love', 'want', 'wants',
  'good', 'great', 'nights', 'night', 'other', 'their', 'them', 'they', 'just', 'here', 'also', 'free',
]);
export function keywords(text: string): string[] {
  return [...new Set(text.toLowerCase().split(/[^a-z0-9-]+/).flatMap((w) => w.split('-')).filter((w) => w.length >= 4 && !STOP.has(w)))];
}
const hit = (keys: string[], text: string | null | undefined) => {
  if (!text) return null;
  const t = text.toLowerCase();
  return keys.find((k) => t.includes(k)) ?? null;
};
const article = (s: string) => (/^[aeiou]/i.test(s) ? 'an' : 'a');

/**
 * Where y's public profile (as x may see it) matches what x is looking for: interests, job, bio.
 * y's own Intro settings are never evidence here; a want both sides wrote is a mutual fact.
 */
type Evidence = { they: (name: string) => string; term: string };
function evidence(y: Profile, keys: string[], kind: IntroKind): Evidence | null {
  const job = y.job ?? null;
  const lowerJob = job ? `${article(job)} ${job.charAt(0).toLowerCase()}${job.slice(1)}` : '';
  const byJob = (): Evidence | null => (job && hit(keys, job) ? { they: (n) => `${n} works as ${lowerJob}`, term: job } : null);
  const byInterest = (): Evidence | null => {
    const i = y.interests.find((x) => hit(keys, x));
    return i ? { they: (n) => `${n} is into ${i}`, term: i } : null;
  };
  const byBio = (): Evidence | null => {
    const k = hit(keys, y.bio);
    return k ? { they: (n) => `${n}'s bio mentions ${k}`, term: k } : null;
  };
  const order = kind === 'networking' ? [byJob, byInterest, byBio] : [byInterest, byJob, byBio];
  for (const f of order) { const e = f(); if (e) return e; }
  return null;
}

/** "shows" and "show", "gigs" and "gig" count as one word when two wants are compared. */
export const stem = (w: string) => (w.length > 4 && w.endsWith('ies') ? `${w.slice(0, -3)}y`
  : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

const MUTUAL_LINE: Record<IntroKind, (words: string) => string> = {
  friendship: (w) => `You're both looking for new friends into ${w}`,
  networking: (w) => `You're both open to coffee chats about ${w}`,
  dating: (w) => `You're both hoping to meet someone into ${w}`,
};
const joinWords = (ws: string[]) => (ws.length > 2 ? `${ws.slice(0, -1).join(', ')} and ${ws.at(-1)}` : ws.join(' and '));

/**
 * The words two looking-for texts share, in `mine`'s order and spelling: "people to go to local
 * shows with" and "friends for local shows and gig nights" share "local", "shows". Empty when none.
 */
export function sharedWants(mine: string, theirs: string): string[] {
  const t = new Set(keywords(theirs).map(stem));
  return keywords(mine).filter((w) => t.has(stem(w)));
}

/**
 * One concrete shared fact, written to each side: forA addresses A as "you", forB addresses B.
 * A side whose text is null never sees the fact. A fact about what x is looking for is written
 * to x only ("You're looking for ..., and Jordan works as ..."): y is never told what x's agent
 * was looking for. A want both sides wrote for a kind both turned on is written to both
 * symmetrically ("You're both open to coffee chats about design"), each in their own words.
 */
export type SharedFact = {
  keyword: string; forA: string | null; forB: string | null; looker: 'a' | 'b' | null;
  /** Keywords of the underlying thing (an interest, a job): two facts sharing one are the same fact. */
  topic: string[];
};

const sameTopic = (x: string[], y: string[]) => x.some((k) => y.includes(k));

/** How many different underlying facts there are ("local bands" counted once however it is phrased). */
export function distinctTopics(facts: SharedFact[]): number {
  const groups: string[][] = [];
  for (const f of facts) {
    const g = groups.find((t) => sameTopic(t, f.topic));
    if (g) g.push(...f.topic); else groups.push([...f.topic]);
  }
  return groups.length;
}

/**
 * One reason per underlying fact, in the order one side reads them: what that side is looking
 * for first (the most specific), then shared interests, then what the other side is looking for.
 * A fact whose topic is already covered ("You both love local bands" after "You're looking for
 * people to go to local shows with, and Jordan is into local bands") is dropped.
 */
export function factsFor(facts: SharedFact[], side: 'a' | 'b'): string[] {
  const rank = (f: SharedFact) => (f.looker === side ? 0 : f.looker === null ? 1 : 2);
  const seen: string[][] = [];
  const out: string[] = [];
  for (const f of [...facts].sort((x, y) => rank(x) - rank(y))) {
    const text = side === 'a' ? f.forA : f.forB;
    if (!text || seen.some((t) => sameTopic(t, f.topic))) continue;
    seen.push(f.topic);
    out.push(text);
  }
  return out;
}

/**
 * Concrete shared facts between a and b, each citing real profile or Intro-settings text:
 * shared interests, then what each one is looking for against the other's profile.
 */
export function sharedFacts(v: View, a: Profile, b: Profile, aOverride?: IntroProfile): SharedFact[] {
  const out: SharedFact[] = [];
  const aP = aOverride ?? introProfileOf(v, a.id);
  const bP = introProfileOf(v, b.id);
  const bInterests = new Set(b.interests.map((i) => i.toLowerCase()));
  for (const i of a.interests) {
    if (bInterests.has(i.toLowerCase())) {
      const t = `You both love ${i}`;
      out.push({ keyword: i.toLowerCase(), forA: t, forB: t, looker: null, topic: keywords(i) });
    }
  }
  // A want both sides wrote, for a kind both turned on: one symmetric line, each in their own words.
  for (const k of INTRO_KINDS) {
    if (!aP.kinds[k]?.on || !bP.kinds[k]?.on) continue;
    const aw = sharedWants(aP.kinds[k].lookingFor, bP.kinds[k].lookingFor);
    const bw = sharedWants(bP.kinds[k].lookingFor, aP.kinds[k].lookingFor);
    if (!aw.length || !bw.length) continue;
    out.push({ keyword: aw[0], forA: MUTUAL_LINE[k](joinWords(aw)), forB: MUTUAL_LINE[k](joinWords(bw)), looker: null, topic: aw });
  }
  // Evidence about y uses only the fields x is allowed to see (y always sees their own).
  const pairs: [IntroProfile, Profile, boolean][] = [
    [aP, v.profileFor(a.id, b), true], [bP, v.profileFor(b.id, a), false],
  ];
  for (const [xP, y, xIsA] of pairs) {
    for (const k of kindsOn(xP)) {
      const looking = xP.kinds[k].lookingFor.trim();
      if (!looking) continue;
      const keys = keywords(looking);
      const e = evidence(y, keys, k);
      if (!e) continue;
      const forX = `You're looking for ${looking}, and ${e.they(firstName(y))}`;
      out.push({
        keyword: hit(keys, looking) ?? keys[0],
        forA: xIsA ? forX : null, forB: xIsA ? null : forX,
        looker: xIsA ? 'a' : 'b',
        topic: keywords(e.term),
      });
    }
  }
  return out;
}

/**
 * Cheap code score from the number of distinct shared facts, used to shortlist pairs for the
 * agents and as the mock judge's score: 0 -> 55, 1 -> 67, 2 -> 79, 3 -> 91, 4+ -> 97.
 */
export function codeScore(distinctFacts: number): number {
  return Math.min(97, 55 + 12 * distinctFacts);
}

// ---------- candidates ----------
export type Candidate = { profile: Profile; kind: IntroKind; trust: TrustPath; facts: SharedFact[]; codeScore: number };

/** Who can be introduced to the viewer for `kinds` right now (consent, reach, distance, cooldown). */
export function candidatesFor(
  v: View, viewerId: ID, opts: { kinds: IntroKind[]; nowMs: number; viewerProfile?: IntroProfile },
): Candidate[] {
  const me = v.profileById.get(viewerId);
  if (!me) return [];
  const myP = opts.viewerProfile ?? introProfileOf(v, viewerId);
  const reach = reachOf(v, viewerId);
  const recent = new Set(v.db.intros
    .filter((i) => (i.aId === viewerId || i.bId === viewerId) && opts.nowMs - Date.parse(i.createdAt) < REINTRO_COOLDOWN_MS)
    .map((i) => (i.aId === viewerId ? i.bId : i.aId)));
  const pendingFriend = (other: ID) => v.friendship(viewerId, other) !== null;
  const out: Candidate[] = [];
  for (const id of reach) {
    const p = v.profileById.get(id);
    if (!p || recent.has(id) || pendingFriend(id)) continue;
    const theirs = introProfileOf(v, id);
    if (theirs.paused) continue;
    const kinds = opts.kinds.filter((k) => theirs.kinds[k]?.on && myP.kinds[k]?.on);
    const kind = kinds.find((k) => k !== 'dating' || (fitsPrefs(myP.datingPrefs, p) && fitsPrefs(theirs.datingPrefs, me)));
    if (!kind) continue;
    if (me.home && p.home) {
      const km = haversineMeters(me.home, p.home) / 1000;
      if (km > Math.min(myP.maxKm, theirs.maxKm)) continue;
    }
    const trust = trustPathOf(v, viewerId, id);
    if (!trust) continue;
    const facts = sharedFacts(v, me, p, opts.viewerProfile);
    out.push({ profile: p, kind, trust, facts, codeScore: codeScore(distinctTopics(facts)) });
  }
  return out.sort((x, y) => y.codeScore - x.codeScore || x.profile.id.localeCompare(y.profile.id));
}

// ---------- bar and cap ----------
export type BarResult = { ok: true } | { ok: false; why: 'score' | 'reasons' | 'trust_path' };

/** Send only when score >= 85 AND at least 2 concrete reasons AND a trust path exists. */
export function passesBar(score: number, reasons: readonly string[], trust: TrustPath | null): BarResult {
  if (!trust || (!trust.mutualIds.length && !trust.groupIds.length)) return { ok: false, why: 'trust_path' };
  if (reasons.filter((r) => r.trim().length >= 12).length < MIN_REASONS) return { ok: false, why: 'reasons' };
  if (!(score >= SCORE_THRESHOLD)) return { ok: false, why: 'score' };
  return { ok: true };
}

/** At most 1 automatic intro per person per week (either side counts). */
export function underWeeklyCap(intros: readonly Intro[], userId: ID, nowMs: number): boolean {
  return !intros.some((i) => i.source === 'auto' && (i.aId === userId || i.bId === userId) && nowMs - Date.parse(i.createdAt) < WEEK_MS);
}
