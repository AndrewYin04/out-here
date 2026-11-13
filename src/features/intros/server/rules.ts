// Muse Intros rules, in code: reach, trust path, consent-safe candidates, shared facts, the
// quality bar and the weekly cap. Pure functions over one store snapshot (View), so the unit
// tests and the routes agree. The model never decides who is in reach or whether the bar is met.
import {
  haversineMeters, INTRO_KINDS, overlapWindow, walkingMinutesExact,
  type DatingPrefs, type ID, type Intro, type IntroGender, type IntroKind, type IntroProfile, type LatLng, type Profile, type TrustPath,
} from '@/shared';
import { interestsMatchingQuest } from '@/features/muse';
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
/** What p wrote under `kind`, or '' when that kind is off. */
export const lookingForOf = (p: IntroProfile, kind: IntroKind): string => (p.kinds[kind]?.on ? p.kinds[kind].lookingFor.trim() : '');

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
  'likes', 'loves', 'wants', 'liking', 'loving', 'looking', 'find', 'anyone', 'come', 'along', 'going',
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

/** The symmetric line for a want both sides wrote under the same kind, filled with the shared words. */
export const MUTUAL_LINE: Record<IntroKind, (words: string) => string> = {
  friendship: (w) => `You're both looking for new friends into ${w}`,
  networking: (w) => `You're both open to coffee chats about ${w}`,
  dating: (w) => `You're both hoping to meet someone into ${w}`,
};
const joinWords = (ws: string[]) => (ws.length > 2 ? `${ws.slice(0, -1).join(', ')} and ${ws.at(-1)}` : ws.join(' and '));

/**
 * Words that name the kind of intro or the person wanted, not a topic. The MUTUAL_LINE template
 * already says them, so a shared run never repeats them ("coffee chats about coffee chats").
 */
export const KIND_WORDS = new Set([
  'coffee', 'chat', 'friend', 'buddy', 'buddie', 'people', 'person', 'someone', 'date', 'dating', 'partner', 'meet',
  'new', 'work', 'night', 'like', 'love', 'want', 'more', 'some', 'with', 'into', 'about', 'from', 'that', 'this',
  'other', 'the', 'and', 'for', 'who', 'go', 'to',
]);
const isTopicWord = (w: string) => w.length >= 3 && !KIND_WORDS.has(stem(w)) && !STOP.has(w);
const splitWords = (t: string) => t.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/**
 * The topic phrases two looking-for texts share, as runs of consecutive words in `mine`'s order
 * and spelling: "someone into local shows" and "someone into local shows and dumplings" share
 * ["local shows"]; "product/design coffee chats" and "coffee chats with product people about
 * design work" share ["product design"]. Kind words never count. Empty when none.
 */
export function sharedRuns(mine: string, theirs: string): string[] {
  const t = new Set(splitWords(theirs).filter(isTopicWord).map(stem));
  const out: string[] = []; let run: string[] = [];
  const flush = () => { const r = run.join(' '); if (r && !out.includes(r)) out.push(r); run = []; };
  for (const w of splitWords(mine)) {
    if (isTopicWord(w) && t.has(stem(w))) run.push(w); else flush();
  }
  flush();
  return out;
}

/** The MUTUAL_LINE for `kind` from two looking-for texts, or null when they share no topic word. */
export function mutualLine(kind: IntroKind, mine: string, theirs: string): string | null {
  const runs = sharedRuns(mine, theirs);
  return runs.length ? MUTUAL_LINE[kind](joinWords(runs)) : null;
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
  /** Ties b to the plan a plan-anchored intro is for; such facts read first. */
  plan?: true;
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
  const rank = (f: SharedFact) => (f.plan ? -1 : f.looker === side ? 0 : f.looker === null ? 1 : 2);
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
 * Concrete shared facts between a and b for an intro of `kind`, each citing real profile or
 * Intro-settings text: shared interests, a want both wrote under `kind`, then what each one is
 * looking for under `kind` against the other's profile. Text written under another kind (a
 * dating want on a coffee-chat intro) is never used.
 */
export function sharedFacts(v: View, a: Profile, b: Profile, kind: IntroKind, aOverride?: IntroProfile): SharedFact[] {
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
  const aText = lookingForOf(aP, kind);
  const bText = lookingForOf(bP, kind);
  // A want both sides wrote for this kind: one symmetric line, each in their own words.
  const forA = aText && bText ? mutualLine(kind, aText, bText) : null;
  const forB = aText && bText ? mutualLine(kind, bText, aText) : null;
  if (forA && forB) {
    const runs = sharedRuns(aText, bText);
    out.push({ keyword: runs[0], forA, forB, looker: null, topic: runs.flatMap(keywords) });
  }
  // Evidence about y uses only the fields x is allowed to see (y always sees their own).
  const pairs: [string, Profile, boolean][] = [
    [aText, v.profileFor(a.id, b), true], [bText, v.profileFor(b.id, a), false],
  ];
  for (const [looking, y, xIsA] of pairs) {
    if (!looking) continue;
    const keys = keywords(looking);
    const e = evidence(y, keys, kind);
    if (!e) continue;
    const forX = `You're looking for ${looking}, and ${e.they(firstName(y))}`;
    out.push({
      keyword: hit(keys, looking) ?? keys[0],
      forA: xIsA ? forX : null, forB: xIsA ? null : forX,
      looker: xIsA ? 'a' : 'b',
      topic: keywords(e.term),
    });
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

// ---------- plan-anchored intros ("find someone to go to THIS plan with") ----------
type QuestRow = View['db']['quests'][number];
/** The walk cap for a plan-anchored candidate, the same 25 min Muse plans use. */
export const PLAN_WALK_MIN = 25;

/** A plan anyone could still join: open or live, and not over. */
export const isJoinablePlan = (q: QuestRow | undefined, nowMs: number): q is QuestRow =>
  !!q && (q.status === 'open' || q.status === 'live') && Date.parse(q.endsAt) > nowMs;

/**
 * Where `userId` would walk to `q` from, when they are free for it: one of their shared
 * availability windows (their Free status) overlaps the plan's startsAt..endsAt, using the same
 * overlapWindow as "who's free when you are", and that window's spot is within PLAN_WALK_MIN on
 * foot. The nearest such window wins. Null when they are busy then or too far away.
 */
export function freeForPlan(v: View, userId: ID, q: QuestRow, nowMs: number): { location: LatLng; walkMin: number } | null {
  const at = new Date(nowMs);
  let best: { location: LatLng; walkMin: number } | null = null;
  for (const a of v.db.availability) {
    if (a.userId !== userId || Date.parse(a.endsAt) <= nowMs) continue;
    if (!overlapWindow(a, q, at)) continue;
    const walkMin = walkingMinutesExact(a.location, q.location);
    if (walkMin > PLAN_WALK_MIN) continue;
    if (!best || walkMin < best.walkMin) best = { location: a.location, walkMin };
  }
  return best;
}

/** Whole walking minutes to the plan: from the window that makes them free for it, else from home. */
export function walkToPlan(v: View, userId: ID, q: QuestRow, nowMs: number): number | null {
  const free = freeForPlan(v, userId, q, nowMs);
  if (free) return Math.max(1, Math.round(free.walkMin));
  const home = v.profileById.get(userId)?.home;
  return home ? Math.max(1, Math.round(walkingMinutesExact(home, q.location))) : null;
}

/**
 * Interests of b (as a may see them) that match the plan's tags, title or category. Each is a
 * concrete reason for this intro: Jordan likes comics and this is a comics open house. When a
 * likes it too it reads "You both love comics, and that's what 🦸 Comic open house is about";
 * otherwise A reads "Jordan is into comics, a fit for 🦸 Comic open house" and B reads that A
 * wants company for a plan about something B likes. The topic is the interest's keywords, so the
 * generic "You both love comics" fact is replaced, not repeated.
 */
export function planFacts(v: View, a: Profile, b: Profile, q: QuestRow): SharedFact[] {
  const plan = `${q.emoji} ${q.title}`;
  const quest = { ...q, memberIds: [] };
  const bSeen = v.profileFor(a.id, b).interests;
  const aLikes = new Set(interestsMatchingQuest(v.profileFor(b.id, a).interests, quest).map((i) => i.toLowerCase()));
  const A = firstName(a); const B = firstName(b);
  const out: SharedFact[] = interestsMatchingQuest(bSeen, quest).map((i) => {
    const both = aLikes.has(i.toLowerCase());
    const shared = `You both love ${i}, and that's what ${plan} is about`;
    return {
      keyword: i.toLowerCase(),
      forA: both ? shared : `${B} is into ${i}, a fit for ${plan}`,
      forB: both ? shared : `${A} wants company for ${plan}, and you're into ${i}`,
      looker: null,
      topic: keywords(i).length ? keywords(i) : [i.toLowerCase()],
      plan: true as const,
    };
  });
  if (out.length) return out;
  // No interest matches: b's job or bio (as a may see them) naming what the plan is about still
  // ties b to it ("Jordan's bio mentions posters, a fit for 🖼️ Art walk").
  const seen = v.profileFor(a.id, b);
  const planKeys = questKeywords(q);
  const job = seen.job ? hit(planKeys, seen.job) : null;
  const k = job ?? hit(planKeys, seen.bio);
  if (!k) return [];
  return [{
    keyword: k,
    forA: job && seen.job
      ? `${B} works as ${article(seen.job)} ${seen.job.toLowerCase()}, a fit for ${plan}`
      : `${B}'s bio mentions ${k}, a fit for ${plan}`,
    forB: `${A} wants company for ${plan}, and it's about ${k}`,
    looker: null, topic: [k], plan: true,
  }];
}

/** The words a plan is about: its title, tags and category, minus generic plan words. */
export function questKeywords(q: Pick<QuestRow, 'title' | 'tags' | 'category'>): string[] {
  return keywords([q.title, ...q.tags.filter((t) => !t.includes(':')), q.category === 'other' ? '' : q.category].join(' '))
    .filter((w) => !['open', 'house', 'hangout', 'pregame', 'night'].includes(w));
}

/**
 * What the viewer typed when asking ("someone who likes comics") checked against b's profile as
 * the viewer may see it. The ask is an extra fact for the viewer only (b is never told what a
 * typed): "You asked for someone who likes comics, and Jordan is into comics". It never replaces
 * the viewer's saved looking-for text.
 */
export function askFacts(v: View, a: Profile, b: Profile, ask: string, kind: IntroKind): SharedFact[] {
  const text = ask.trim().replace(/[.!?]+$/, '');
  const keys = keywords(text);
  if (!keys.length) return [];
  const e = evidence(v.profileFor(a.id, b), keys, kind);
  if (!e) return [];
  return [{
    keyword: hit(keys, e.term) ?? keys[0],
    forA: `You asked for ${text}, and ${e.they(firstName(b))}`,
    forB: null, looker: 'a', topic: keywords(e.term).length ? keywords(e.term) : [e.term.toLowerCase()],
  }];
}

// ---------- candidates ----------
export type Candidate = {
  profile: Profile; kind: IntroKind; trust: TrustPath; facts: SharedFact[]; codeScore: number;
  /** For a plan-anchored request: at least one fact ties this person to the plan. */
  planTie?: boolean;
};

/** Who can be introduced to the viewer for `kinds` right now (consent, reach, distance, cooldown). */
export function candidatesFor(
  v: View, viewerId: ID, opts: { kinds: IntroKind[]; nowMs: number; viewerProfile?: IntroProfile; quest?: QuestRow; ask?: string },
): Candidate[] {
  const me = v.profileById.get(viewerId);
  if (!me) return [];
  const myP = opts.viewerProfile ?? introProfileOf(v, viewerId);
  const reach = reachOf(v, viewerId);
  const recent = new Set(v.db.intros
    .filter((i) => (i.aId === viewerId || i.bId === viewerId) && opts.nowMs - Date.parse(i.createdAt) < REINTRO_COOLDOWN_MS)
    .map((i) => (i.aId === viewerId ? i.bId : i.aId)));
  const pendingFriend = (other: ID) => v.friendship(viewerId, other) !== null;
  // A plan-anchored request: only people who could go to it (see it, not already on it, free
  // for its window and within the walk cap of it).
  const q = opts.quest;
  const planMembers = new Set(q ? v.questMemberIds(q.id) : []);
  const couldGo = (id: ID) => !q || (!planMembers.has(id) && v.canSeeQuest(id, q) && !!freeForPlan(v, id, q, opts.nowMs));
  const out: Candidate[] = [];
  for (const id of reach) {
    const p = v.profileById.get(id);
    if (!p || recent.has(id) || pendingFriend(id) || !couldGo(id)) continue;
    const theirs = introProfileOf(v, id);
    if (theirs.paused) continue;
    const kinds = opts.kinds.filter((k) => theirs.kinds[k]?.on && myP.kinds[k]?.on);
    const eligible = kinds.filter((k) => k !== 'dating' || (fitsPrefs(myP.datingPrefs, p) && fitsPrefs(theirs.datingPrefs, me)));
    if (!eligible.length) continue;
    if (me.home && p.home) {
      const km = haversineMeters(me.home, p.home) / 1000;
      if (km > Math.min(myP.maxKm, theirs.maxKm)) continue;
    }
    const trust = trustPathOf(v, viewerId, id);
    if (!trust) continue;
    // Facts come from one kind only, so the intro is made for the kind with the most distinct
    // facts (ties keep the order of `kinds`): Alex and Jordan share more as a coffee chat than
    // as friends, and a friendship intro never borrows their coffee-chat wants.
    // For a plan, the first kind (in `kinds` order) that clears the bar wins, so a comics open
    // house stays a Friendship intro even when a coffee chat would share one more fact.
    let best: { kind: IntroKind; facts: SharedFact[]; score: number } | null = null;
    const pf = q ? planFacts(v, me, p, q) : [];
    for (const kind of eligible) {
      if (q && best && best.score >= SCORE_THRESHOLD) break;
      // Plan facts go first, so they replace a generic shared interest on the same topic; the
      // viewer's typed ask adds a fact without replacing what they saved.
      const facts = [...pf, ...(opts.ask ? askFacts(v, me, p, opts.ask, kind) : []), ...sharedFacts(v, me, p, kind, opts.viewerProfile)];
      const score = codeScore(distinctTopics(facts));
      if (!best || score > best.score) best = { kind, facts, score };
    }
    out.push({ profile: p, kind: best!.kind, trust, facts: best!.facts, codeScore: best!.score, ...(q ? { planTie: pf.length > 0 } : {}) });
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
