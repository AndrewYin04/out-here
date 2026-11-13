// Muse Intros service: rounds, on-request intros, double opt-in, settings and per-side views.
// Every function takes the viewer id from x-persona (the route passes it) and returns only what
// that side may see: the other person's first name and photo, the shared trust path, the reasons
// and note written to the viewer, and the viewer's own agent's turns (the other agent's turns as
// one-line outcomes). Like Boardy, A hears first; B sees the intro only after A says yes.
import {
  INTRO_KINDS, now,
  type ID, type Intro, type IntroCardView, type IntroKind, type IntroKindSetting, type IntroProfile, type IntroStepView,
} from '@/shared';
import { badRequest, conflict, notFound, publish, type DataStore, type View } from '@/features/data/server';
import type { IntroCardData, IntroChoice, IntroPlanAction, IntroPlanOption, IntroPlanView } from '../types';
import { rankSteps, runClick, stepOf, type ClickResult } from './agents';
import { privacyGuard, privateTexts } from './privacy';
import {
  AGENT_SHORTLIST, candidatesFor, firstName, INTRO_TTL_MS, introProfileOf, isJoinablePlan, kindsOn, lookingForOf, passesBar,
  relativeWhen, SCORE_THRESHOLD, trustLabels, underWeeklyCap, walkToPlan,
} from './rules';

export { relativeWhen };

type QuestRow = View['db']['quests'][number];

export const MUSE_PREFIX = '✨ Muse: ';
/** Whole-round budget for live Muse calls (3 pairs run in parallel, 5 calls each). */
const ROUND_BUDGET_MS = 40_000;

const isOpen = (i: Intro) => i.status === 'proposed' || i.status === 'a_accepted' || i.status === 'b_accepted';
const isExpired = (i: Intro, nowMs: number) => isOpen(i) && nowMs - Date.parse(i.createdAt) > INTRO_TTL_MS;

/** B hears about an intro only once A said yes; A's pass or an unanswered proposal stays invisible to B. */
function visibleTo(i: Intro, viewerId: ID): boolean {
  if (i.aId === viewerId) return true;
  if (i.bId !== viewerId) return false;
  if (i.status === 'proposed') return false;
  if (i.status === 'declined' && i.declinedBy === i.aId) return false;
  return true;
}


function stepView(v: View, i: Intro, nowMs: number): IntroStepView {
  const q = i.firstStep.questId ? v.db.quests.find((x) => x.id === i.firstStep.questId) : undefined;
  const anchored = !!i.firstStep.anchored;
  if (!q) return { label: i.firstStep.text, when: null, href: null, seatsLeft: null, anchored };
  // A full plan is still on (the pair may be the ones who filled it); only done or over ends it.
  const live = q.status !== 'done' && Date.parse(q.endsAt) > nowMs;
  return {
    label: `${q.emoji} ${q.title} at ${q.venueName}`,
    when: live ? relativeWhen(q.startsAt, nowMs) : 'This plan has ended',
    href: live ? `/out-here?quest=${encodeURIComponent(q.id)}` : null,
    seatsLeft: live ? v.seatsLeft(q) : null,
    anchored,
  };
}

const seatsText = (n: number) => `${n} ${n === 1 ? 'seat' : 'seats'}`;
const liveStep = (s: IntroStepView) => !!s.href && s.seatsLeft !== null;

/** Which of the two people are not yet on the first step's quest (both, until Muse holds seats). */
function notYetOn(v: View, i: Intro): ID[] {
  const members = i.firstStep.questId ? v.questMemberIds(i.firstStep.questId) : [];
  return [i.aId, i.bId].filter((id) => !members.includes(id));
}

/**
 * Muse's concrete ask for a connected pair, tied to the first step: "Want me to hold 2 seats at
 * 📚 Comics open house at Inkwell Comics Café (Starts in 30 min, 5 seats left)? ..."
 * With `viewerId` the ask is written to that person when only one of them still needs a seat
 * ("Jordan's already going to X. Want me to hold you a seat?" / "You're already going to X. Want
 * me to save Alex a seat?"); without it (the pair's shared chat) it names both in the third person.
 */
export function museAsk(v: View, i: Intro, nowMs: number, viewerId?: ID): string {
  const s = stepView(v, i, nowMs);
  if (!liveStep(s)) return 'Want me to find a plan for you two? Tap Pick a time on your intro.';
  const missing = notYetOn(v, i);
  if (missing.length === 0) return `You're both going to ${s.label} (${s.when}).`;
  const tail = 'Tap Hold seats or Pick another time on your intro.';
  const at = `${s.label} (${s.when}, ${seatsText(s.seatsLeft ?? 0)} left)`;
  if (missing.length === 2) return `Want me to hold 2 seats at ${at}? ${tail}`;
  const goingId = [i.aId, i.bId].find((id) => !missing.includes(id)) ?? i.aId;
  const going = firstName(v.profileById.get(goingId));
  const needs = firstName(v.profileById.get(missing[0]));
  if (viewerId === goingId) return `You're already going to ${at}. Want me to save ${needs} a seat? ${tail}`;
  if (viewerId === missing[0]) return `${going}'s already going to ${at}. Want me to hold you a seat? ${tail}`;
  return `${going}'s already going to ${at}. Want me to hold a seat for ${needs}? ${tail}`;
}

/**
 * Muse's note that opens the pair's chat, addressed to both people, ending with Muse's ask:
 * "✨ Muse: Alex, meet Jordan. Jordan, meet Alex. You both know Maya. … Want me to hold 2 seats
 * at 🎸 Local-band show pregame at The Signal Room (Today 7:50 PM, 3 seats left)? …"
 */
export function museNote(v: View, i: Intro, nowMs: number): string {
  const A = firstName(v.profileById.get(i.aId)); const B = firstName(v.profileById.get(i.bId));
  return `${MUSE_PREFIX}${A}, meet ${B}. ${B}, meet ${A}. ${i.summary} ${museAsk(v, i, nowMs)}`;
}

export type PlanJoin = 'joined' | 'full' | 'gone';

/**
 * Muse's note for a plan-anchored intro once both said yes. Joined: it names the plan, the time
 * and each person's walk. Full or gone: the intro still connects, and Muse says the plan filled
 * up and offers the next plan that fits both of them.
 */
export function anchoredNote(v: View, i: Intro, nowMs: number, result: PlanJoin): string {
  const A = firstName(v.profileById.get(i.aId)); const B = firstName(v.profileById.get(i.bId));
  const head = `${MUSE_PREFIX}${A}, meet ${B}. ${B}, meet ${A}. ${i.summary}`;
  const q = v.db.quests.find((x) => x.id === i.firstStep.questId);
  if (result === 'joined' && q) {
    const s = stepView(v, i, nowMs);
    const wa = walkToPlan(v, i.aId, q, nowMs); const wb = walkToPlan(v, i.bId, q, nowMs);
    const walk = wa !== null && wb !== null ? ` It's about a ${wa} min walk for ${A} and ${wb} min for ${B}.` : '';
    return `${head} You're both going to ${s.label} (${s.when}).${walk} I saved both your seats, and it's on both your Out Here maps.`;
  }
  const label = q ? `${q.emoji} ${q.title} at ${q.venueName}` : i.firstStep.text;
  const next = planOptions(v, i, nowMs)[0];
  const then = next
    ? `Next one that fits you both: ${next.label} (${next.when}, ${seatsText(next.seatsLeft)} left). Tap Pick another time on your intro.`
    : 'Want me to find another plan? Tap Pick a time on your intro.';
  return `${head} ${label} ${result === 'full' ? 'filled up' : 'is no longer happening'} before you both said yes. ${then}`;
}

/**
 * Muse's reveal once both people are on the plan, like a Marketplace seller sharing the address
 * after accepting: the exact spot (members only, View.meetSpotFor), each walk from the same rule
 * the plan sheet uses, and the start. Null until both are on it.
 *   for a viewer: "It's on. Exact spot: Ivy Commons, side gate on Ivy Dr: .... 9 min walk for you, starts in 30 min."
 *   for the chat: "It's on. Exact spot: .... Starts in 30 min."
 */
export function revealText(v: View, i: Intro, nowMs: number, viewerId?: ID): string | null {
  const q = i.firstStep.questId ? v.db.quests.find((x) => x.id === i.firstStep.questId) : undefined;
  if (!q || q.status === 'done' || Date.parse(q.endsAt) <= nowMs || notYetOn(v, i).length) return null;
  const spot = v.meetSpotFor(viewerId ?? i.aId, q);
  if (!spot) return null;
  const when = relativeWhen(q.startsAt, nowMs);
  const lower = when.charAt(0).toLowerCase() + when.slice(1);
  if (viewerId) {
    const w = walkToPlan(v, viewerId, q, nowMs);
    return `It's on. Exact spot: ${spot}.${w !== null ? ` ${w} min walk for you,` : ''} ${w !== null ? lower : when}.`;
  }
  // The chat note just before this one already gave each walk.
  return `It's on. Exact spot: ${spot}. ${when}.`;
}

/**
 * Both people join a plan-anchored intro's plan through join_quest (one atomic seat each), called
 * only by the request that won the move to accepted, so each joins at most once. Not enough seats
 * for everyone not yet on it means nobody joins ('full'); a join that loses a race undoes the
 * other one, so the pair never ends up split.
 */
async function joinAnchored(store: DataStore, i: Intro, nowMs: number): Promise<PlanJoin> {
  const { view } = await store.museContext();
  const q = view.db.quests.find((x) => x.id === i.firstStep.questId);
  if (!q || q.status === 'done' || Date.parse(q.endsAt) <= nowMs) return 'gone';
  const need = notYetOn(view, i);
  if (need.length === 0) return 'joined';
  if (view.seatsLeft(q) < need.length) return 'full';
  const joined: ID[] = [];
  for (const id of need) {
    try {
      await store.joinQuest(id, q.id);
      joined.push(id);
    } catch (err) {
      for (const j of joined) await store.leaveQuest(j, q.id).catch(() => undefined);
      return (err as { status?: number })?.status === 409 ? 'full' : 'gone';
    }
  }
  return 'joined';
}

/** The pair's chat name, so the chat header shows Muse is in it: "Alex, Jordan + Muse". */
export const threadNameFor = (v: View, i: Pick<Intro, 'aId' | 'bId'>) =>
  `${firstName(v.profileById.get(i.aId))}, ${firstName(v.profileById.get(i.bId))} + Muse`;

/** Up to 3 other upcoming plans that match the pair and have room for both of them. */
function planOptions(v: View, i: Intro, nowMs: number): IntroPlanOption[] {
  const a = v.profileById.get(i.aId); const b = v.profileById.get(i.bId);
  if (!a || !b) return [];
  return rankSteps(v, a, b, [], nowMs)
    .filter((q) => q.id !== i.firstStep.questId)
    .filter((q) => {
      const m = v.questMemberIds(q.id);
      return v.seatsLeft(q) >= [i.aId, i.bId].filter((id) => !m.includes(id)).length;
    })
    .slice(0, 3)
    .map((q) => ({ questId: q.id, label: `${q.emoji} ${q.title} at ${q.venueName}`, when: relativeWhen(q.startsAt, nowMs), seatsLeft: v.seatsLeft(q) }));
}

/** The plan step on a connected card: Muse's ask, whether seats are held, and other plans. */
export function planView(v: View, i: Intro, nowMs: number, viewerId?: ID): IntroPlanView | null {
  if (i.status !== 'accepted') return null;
  const s = stepView(v, i, nowMs);
  const live = liveStep(s);
  const need = live ? notYetOn(v, i).length : 0;
  return {
    questId: live ? i.firstStep.questId : null,
    ask: museAsk(v, i, nowMs, viewerId),
    held: live && need === 0,
    seatsNeeded: need,
    canHold: live && need > 0 && (s.seatsLeft ?? 0) >= need,
    options: planOptions(v, i, nowMs),
    reveal: live && need === 0 ? revealText(v, i, nowMs, viewerId) : null,
  };
}

/** Fallback texts when a model-written note or summary quotes private settings. */
const safeNote = (otherName: string) => `Your agents agree ${otherName} would be a good intro for you.`;
const safeSummary = (trust: string | undefined) => `${trust ?? 'You share a connection'}, and both of your agents said yes.`;

/**
 * The privacy guard for what `viewerId` may read about `otherId` in intro `i`. On-request
 * settings (`viewerIntro` for the viewer, `otherExtra` for the other side) add to the stored ones.
 */
function guardFor(
  v: View, i: Pick<Intro, 'kind' | 'trustPath' | 'firstStep'>, viewerId: ID, otherId: ID,
  over: { viewerIntro?: IntroProfile; otherIntro?: IntroProfile; otherAsk?: string } = {},
) {
  const viewer = v.profileById.get(viewerId); const other = v.profileById.get(otherId);
  if (!viewer || !other) return null;
  const stored = introProfileOf(v, viewerId);
  const otherStored = introProfileOf(v, otherId);
  const otherIntro = over.otherIntro ?? otherStored;
  return privacyGuard({
    viewer, viewerIntro: over.viewerIntro ?? stored,
    seenOther: v.profileFor(viewerId, other),
    secrets: [...new Set([...privateTexts(otherStored), ...privateTexts(otherIntro), ...(over.otherAsk ? [over.otherAsk] : [])])],
    extra: [...privateTexts(stored), ...trustLabels(v, i.trustPath), i.firstStep.text],
    // A leaking reason is rewritten from what both wrote for this intro's kind only.
    kind: i.kind, otherKindText: lookingForOf(otherIntro, i.kind),
  });
}

/**
 * Rewrites one vetted result so neither side's text quotes the other side's private looking-for
 * (review E4). A's settings may carry an on-request override, so they are passed in.
 */
function scrubResult(
  v: View, aId: ID, aIntro: IntroProfile, bId: ID, i: Pick<Intro, 'kind' | 'trustPath' | 'firstStep'>, r: ClickResult, aAsk = '',
): ClickResult {
  const gA = guardFor(v, i, aId, bId, { viewerIntro: aIntro });
  // What A typed when asking is as private as A's saved looking-for.
  const gB = guardFor(v, i, bId, aId, { otherIntro: aIntro, otherAsk: aAsk });
  if (!gA || !gB) return r;
  const aName = firstName(v.profileById.get(aId)); const bName = firstName(v.profileById.get(bId));
  return {
    ...r,
    reasonsA: gA.reasons(r.reasonsA),
    reasonsB: gB.reasons(r.reasonsB),
    // The summary goes to both people (Muse's note in their chat), so both guards apply.
    summary: gA.leaks(r.summary) || gB.leaks(r.summary) ? safeSummary(trustLabels(v, i.trustPath)[0]) : r.summary,
    noteA: gA.text(r.noteA, safeNote(bName)),
    noteB: gB.text(r.noteB, safeNote(aName)),
    logA: gA.log(r.logA, 'a'),
    logB: gB.log(r.logB, 'b'),
  };
}

export function cardFor(v: View, viewerId: ID, i: Intro, nowMs = now().getTime()): IntroCardData | null {
  if (!visibleTo(i, viewerId)) return null;
  const isA = i.aId === viewerId;
  const other = v.profileById.get(isA ? i.bId : i.aId);
  if (!other) return null;
  // Read-time guard too, for rows written before the write-time scrub existed.
  const guard = guardFor(v, i, viewerId, other.id);
  if (!guard) return null;
  let state: IntroCardView['state'] = 'new';
  let closedText: string | null = null;
  if (i.status === 'accepted') state = 'connected';
  else if (i.status === 'declined' && i.declinedBy === viewerId) {
    state = 'closed'; closedText = 'You passed on this intro';
  } else if (i.status === 'declined') {
    // Silent to the other side: the person who said yes keeps waiting until the intro expires,
    // the same end every unanswered intro reaches, so a no never shows.
    if (nowMs - Date.parse(i.createdAt) > INTRO_TTL_MS) { state = 'closed'; closedText = 'This intro expired'; } else state = 'waiting';
  } else if (i.status === 'expired' || isExpired(i, nowMs)) {
    state = 'closed'; closedText = 'This intro expired';
  } else if ((i.status === 'a_accepted' && isA) || (i.status === 'b_accepted' && !isA)) state = 'waiting';
  const mySide = isA ? 'a' : 'b';
  const mutuals = i.trustPath.mutualIds.slice(0, 3).flatMap((id) => {
    const p = v.profileById.get(id);
    return p ? [{ id: p.id, firstName: firstName(p), avatarUrl: p.avatarUrl }] : [];
  });
  return {
    id: i.id, kind: i.kind, score: i.score,
    other: { id: other.id, handle: other.handle, firstName: firstName(other), avatarUrl: other.avatarUrl },
    trustPath: trustLabels(v, i.trustPath),
    mutuals,
    summary: guard.text(isA ? i.noteA : i.noteB, safeNote(firstName(other))),
    reasons: guard.reasons(isA ? i.reasons : (i.reasonsB ?? [])),
    step: stepView(v, i, nowMs),
    myAgentLog: guard.log(isA ? i.agentLogA : i.agentLogB, mySide).map((t) => (t.agent === mySide
      ? { mine: true, text: t.text }
      : { mine: false, text: t.outcome || 'replied' })),
    judgeLine: `Muse judge: ${i.score}/100, ${i.score >= SCORE_THRESHOLD ? 'above' : 'below'} the ${SCORE_THRESHOLD} bar`,
    otherAccepted: !isA && i.status === 'a_accepted',
    state, closedText,
    threadId: state === 'connected' ? i.threadId : null,
    createdAt: i.createdAt,
    plan: state === 'connected' ? planView(v, i, nowMs, viewerId) : null,
    joinLine: state === 'new' ? joinLineFor(v, i, viewerId, nowMs) : null,
  };
}

/**
 * For a plan-anchored intro the viewer has not answered: saying yes also puts them on the plan,
 * so the card says so under the button. "Saying yes adds you to 🖼️ Art walk · Today 8:35 PM ·
 * 11 min walk". Null when the intro has no live plan or the viewer is already on it.
 */
export function joinLineFor(v: View, i: Intro, viewerId: ID, nowMs: number): string | null {
  if (!i.firstStep.anchored || !i.firstStep.questId) return null;
  const q = v.db.quests.find((x) => x.id === i.firstStep.questId);
  if (!q || q.status === 'done' || Date.parse(q.endsAt) <= nowMs) return null;
  if (v.questMemberIds(q.id).includes(viewerId)) return null;
  const walk = walkToPlan(v, viewerId, q, nowMs);
  return [`Saying yes adds you to ${q.emoji} ${q.title}`, relativeWhen(q.startsAt, nowMs), walk !== null ? `${walk} min walk` : null]
    .filter(Boolean).join(' · ');
}

export async function listIntros(store: DataStore, viewerId: ID): Promise<{ intros: IntroCardData[] }> {
  const { view } = await store.museContext();
  const nowMs = now().getTime();
  const intros = view.db.intros
    .filter((i) => i.aId === viewerId || i.bId === viewerId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((i) => cardFor(view, viewerId, i, nowMs))
    .filter((c): c is IntroCardData => !!c);
  return { intros };
}

export type RoundResult = {
  intro: IntroCardData | null;
  /**
   * Plan-anchored requests with 2 or 3 people above the bar: each is a proposed intro only the
   * viewer sees. The viewer picks one (pickIntro), the others are removed, and only the picked
   * person is asked. Absent when one person or nobody passed.
   */
  choices?: IntroChoice[];
  /** Pairs the agents vetted that did not clear the bar (names never sent). */
  considered: number;
  belowBar: number;
  capped: boolean;
  paused: boolean;
  message: string;
};

const introNotice = (otherName: string, trust: string | undefined, step?: Intro['firstStep']) =>
  `✨ Muse has an intro for you: meet ${otherName}${step?.anchored ? ` to go to ${step.text}` : ''}.${trust ? ` ${trust}.` : ''}`;

/** One vetting round for the viewer. auto rounds obey the weekly cap; requests do not. */
async function round(
  store: DataStore, viewerId: ID,
  opts: { kinds: IntroKind[]; source: Intro['source']; profile: IntroProfile; quest?: QuestRow; ask?: string },
): Promise<RoundResult> {
  const { view } = await store.museContext();
  const me = view.profileById.get(viewerId);
  if (!me) throw notFound('person_not_found');
  const nowMs = now().getTime();
  const empty = { intro: null, considered: 0, belowBar: 0, capped: false, paused: false };
  if (opts.source === 'auto' && opts.profile.paused) return { ...empty, paused: true, message: 'Intros are paused.' };
  if (opts.source === 'auto' && !underWeeklyCap(view.db.intros, viewerId, nowMs)) {
    return { ...empty, capped: true, message: 'Muse already made your intro this week. Muse takes its time to find someone great.' };
  }
  const kinds = opts.kinds.filter((k) => opts.profile.kinds[k]?.on);
  let pool = candidatesFor(view, viewerId, { kinds, nowMs, viewerProfile: opts.profile, quest: opts.quest, ask: opts.ask });
  if (opts.source === 'auto') pool = pool.filter((c) => underWeeklyCap(view.db.intros, c.profile.id, nowMs));
  const shortlist = pool.slice(0, AGENT_SHORTLIST);
  const deadline = Date.now() + ROUND_BUDGET_MS;
  // Candidates run in parallel and fail alone: one that errors or times out is skipped.
  const vetted = await Promise.all(shortlist.map(async (c) => {
    try {
      // An on-request ask ("someone into thrifting to go to the closet sale with") also steers the first step.
      const ask = opts.source === 'request' ? lookingForOf(opts.profile, c.kind) : '';
      const raw = await runClick(view, me, opts.profile, c, nowMs, deadline, ask, opts.quest);
      return { c, r: scrubResult(view, viewerId, opts.profile, c.profile.id, { kind: c.kind, trustPath: c.trust, firstStep: raw.firstStep }, raw, opts.ask) };
    } catch (err) {
      console.error('[intros] agent exchange failed:', String((err as Error)?.message ?? err).slice(0, 200));
      return null;
    }
  }));
  // Each person must get at least 2 concrete reasons written to them. For a plan, A's first
  // reason must also say why this person fits that plan.
  const passing = vetted
    .filter((x): x is NonNullable<typeof x> => !!x
      && passesBar(x.r.score, x.r.reasonsA, x.c.trust).ok && passesBar(x.r.score, x.r.reasonsB, x.c.trust).ok
      && (!opts.quest || (!!x.c.planTie && !!x.r.planTied)))
    .sort((x, y) => y.r.score - x.r.score);
  const best = passing[0];
  const considered = vetted.filter(Boolean).length;
  const forPlan = opts.quest ? ` for ${opts.quest.emoji} ${opts.quest.title}` : '';
  if (!best) {
    return {
      ...empty, considered, belowBar: considered,
      message: opts.quest && !considered
        ? `No great match yet${forPlan}. Nobody Muse could introduce you to is free then and close enough to walk.`
        : opts.quest && !vetted.some((x) => x?.c.planTie)
        ? `No great match yet${forPlan}. Muse considered ${considered} ${considered === 1 ? 'person' : 'people'}, but nothing on their profile says they'd want to go to this plan.`
        : considered
        ? `No great match yet. Muse considered ${considered} ${considered === 1 ? 'person' : 'people'}, but nobody was a strong enough match.`
        : 'No great match yet. Muse only introduces when it\'s confident.',
    };
  }
  const rowOf = (x: typeof best): Intro => ({
    id: crypto.randomUUID(), kind: x.c.kind, source: opts.source, aId: viewerId, bId: x.c.profile.id,
    trustPath: x.c.trust, score: x.r.score,
    reasons: x.r.reasonsA.slice(0, 3), reasonsB: x.r.reasonsB.slice(0, 3), summary: x.r.summary,
    noteA: x.r.noteA, noteB: x.r.noteB, firstStep: x.r.firstStep,
    agentLogA: x.r.logA, agentLogB: x.r.logB,
    status: 'proposed', declinedBy: null, threadId: null, createdAt: now().toISOString(), decidedAt: null,
  });
  if (opts.quest && passing.length >= 2) {
    // Scene 5: 2 or 3 people for the plan, each with a one-line why. Nobody hears anything yet.
    const picks = passing.slice(0, 3).map((x) => ({ x, row: rowOf(x) }));
    for (const { row: r } of picks) await store.insertIntro(r);
    await publish(`user:${viewerId}`, { type: 'intro', id: picks[0].row.id });
    const after = (await store.museContext()).view;
    const choices: IntroChoice[] = picks.map(({ x, row: r }) => ({
      introId: r.id, kind: r.kind, score: r.score,
      other: { id: x.c.profile.id, handle: x.c.profile.handle, firstName: firstName(x.c.profile), avatarUrl: x.c.profile.avatarUrl },
      trustPath: trustLabels(after, r.trustPath)[0] ?? '',
      why: cardFor(after, viewerId, r, nowMs)?.reasons[0] ?? '',
    }));
    const others = considered - choices.length;
    return {
      intro: null, choices, considered, belowBar: others, capped: false, paused: false,
      message: `Muse found ${choices.length} people${forPlan}.${others > 0 ? ` ${others} other ${others === 1 ? 'person was' : 'people were'} considered and fell below the bar.` : ''} Pick one and Muse asks only them.`,
    };
  }
  const row = rowOf(best);
  await store.insertIntro(row);
  // Only A hears now. B is asked after A says yes.
  await store.notifyIntro(viewerId, row.bId, row.id, introNotice(firstName(best.c.profile), trustLabels(view, row.trustPath)[0], row.firstStep));
  await publish(`user:${viewerId}`, { type: 'intro', id: row.id });
  const after = (await store.museContext()).view;
  const others = considered - 1;
  return {
    intro: cardFor(after, viewerId, row, nowMs), considered, belowBar: others, capped: false, paused: false,
    message: `Muse found someone${forPlan}. ${others > 0 ? `${others} other ${others === 1 ? 'person was' : 'people were'} considered but not a strong enough match.` : ''}`.trim(),
  };
}

/** The automatic round (runIntroRound in the plan); the /intros demo control calls it. */
export async function runIntroRound(store: DataStore, viewerId: ID, kind?: IntroKind): Promise<RoundResult> {
  const { view } = await store.museContext();
  const profile = introProfileOf(view, viewerId);
  return round(store, viewerId, { kinds: kind ? [kind] : kindsOn(profile), source: 'auto', profile });
}

/**
 * "Ask Muse for an intro": still must clear the bar, else "No great match yet". With a questId
 * ("find someone to go to THIS plan with") only people free for the plan, within walking
 * distance of it and not already on it are considered; the plan is the first step, and on double
 * accept both people join it.
 */
export async function requestIntro(
  store: DataStore, viewerId: ID, kind: IntroKind | null, ask: string, questId?: ID | null,
): Promise<RoundResult> {
  const { view } = await store.museContext();
  const base = introProfileOf(view, viewerId);
  let quest: QuestRow | undefined;
  if (questId) {
    const q = view.db.quests.find((x) => x.id === questId);
    if (!q || !view.canSeeQuest(viewerId, q)) throw notFound('quest_not_found');
    if (!isJoinablePlan(q, now().getTime())) throw conflict('This plan is over or full.');
    quest = q;
  }
  // For a plan, Muse tries every kind the viewer has on (the asked kind first, Dating only when
  // asked for), so the default Friendship tab never hides a match another kind would find.
  const others = quest ? kindsOn(base).filter((k) => k !== kind && k !== 'dating') : [];
  const kinds: IntroKind[] = kind ? [kind, ...others] : others.length ? others : ['friendship'];
  // The request counts as opting into the asked kind for this search only; settings stay as they
  // are. The typed ask is an extra fact source and never replaces the saved looking-for text
  // (it fills in only when nothing was saved).
  const first = kinds[0];
  const saved = base.kinds[first]?.on ? base.kinds[first].lookingFor.trim() : '';
  const profile: IntroProfile = { ...base, kinds: { ...base.kinds, [first]: { on: true, lookingFor: saved || ask.trim() } } };
  return round(store, viewerId, { kinds, source: 'request', profile, quest, ask: ask.trim() });
}

/**
 * The viewer picks one of a plan request's choices: the other proposed choices are removed (they
 * were never shown to anyone else), and the pick counts as the viewer's yes, so only that person
 * is asked.
 */
export async function pickIntro(store: DataStore, viewerId: ID, introId: ID, dropIds: ID[]): Promise<{ intro: IntroCardData }> {
  const { view } = await store.museContext();
  const i = view.db.intros.find((x) => x.id === introId);
  if (!i || i.aId !== viewerId) throw notFound('intro_not_found');
  if (i.status !== 'proposed') throw conflict('intro_already_answered');
  const drop = view.db.intros.filter((x) => dropIds.includes(x.id) && x.id !== i.id && x.aId === viewerId && x.status === 'proposed'
    && x.firstStep.anchored && x.firstStep.questId === i.firstStep.questId);
  if (drop.length) await store.removeIntros(drop.map((x) => x.id), []);
  return respondIntro(store, viewerId, i.id, true);
}

/**
 * Accept or pass. Each status change is one conditional update from the status this request
 * read, so of two simultaneous requests (a double click, or both people at once) exactly one
 * makes the change and does its side effects (notifying B, opening the chat, Muse's note);
 * the other re-reads and returns the card as it now stands.
 */
export async function respondIntro(store: DataStore, viewerId: ID, introId: ID, accept: boolean): Promise<{ intro: IntroCardData }> {
  const { view } = await store.museContext();
  const nowMs = now().getTime();
  const i = view.db.intros.find((x) => x.id === introId);
  if (!i || !visibleTo(i, viewerId)) throw notFound('intro_not_found');
  const current = async () => {
    const after = (await store.museContext()).view;
    const updated = after.db.intros.find((x) => x.id === i.id) ?? i;
    return { intro: cardFor(after, viewerId, updated, nowMs)! };
  };
  const isA = i.aId === viewerId;
  if (!isOpen(i) || isExpired(i, nowMs)) return { intro: cardFor(view, viewerId, i, nowMs)! };
  const otherId = isA ? i.bId : i.aId;
  const a = view.profileById.get(i.aId); const b = view.profileById.get(i.bId);
  const mine: Intro['status'] = isA ? 'a_accepted' : 'b_accepted';
  if (!accept) {
    if (await store.transitionIntro(i.id, i.status, { status: 'declined', declinedBy: viewerId, decidedAt: now().toISOString() })) {
      // Silent to the other side: no realtime message, no notification.
      await publish(`user:${viewerId}`, { type: 'intro', id: i.id });
    }
    return current();
  }
  if (i.status === mine) return current();   // a repeat yes while waiting for the other person
  const otherAccepted = (isA && i.status === 'b_accepted') || (!isA && i.status === 'a_accepted');
  if (!otherAccepted) {
    if (await store.transitionIntro(i.id, i.status, { status: mine })) {
      await publish(`user:${viewerId}`, { type: 'intro', id: i.id });
      if (isA) {
        // Now B is asked, the way Boardy asks the second person once the first said yes.
        await store.notifyIntro(i.bId, i.aId, i.id, introNotice(firstName(a), trustLabels(view, i.trustPath)[0], i.firstStep));
        await publish(`user:${i.bId}`, { type: 'intro', id: i.id });
      }
    }
    return current();
  }
  if (!(await store.transitionIntro(i.id, i.status, { status: 'accepted', decidedAt: now().toISOString() }))) return current();
  // This request won the transition to accepted: it alone opens the chat, seats a plan-anchored
  // pair (join_quest broadcasts quest:<id> with the seats) and posts the note.
  const joinResult = i.firstStep.anchored && i.firstStep.questId ? await joinAnchored(store, i, nowMs) : null;
  // The pair's own chat, named so Muse shows as the third person in it; a rehearsal reuses it.
  const name = threadNameFor(view, i);
  const existing = view.db.threads.find((t) => t.name === name && (() => {
    const ms = view.threadMemberIds(t.id);
    return ms.length === 2 && ms.includes(i.aId) && ms.includes(i.bId);
  })());
  const thread = existing ?? await store.openThread(viewerId, [otherId], name);
  // One Muse note per pair: a reused thread that already has this pair's note gets no copy.
  const opener = `${MUSE_PREFIX}${firstName(a)}, meet ${firstName(b)}.`;
  const already = (await store.museContext()).view.messages(thread.id).some((m) => m.kind === 'muse' && m.text.startsWith(opener));
  if (!already) {
    const fresh = joinResult ? (await store.museContext()).view : view;
    await store.sendMessage(viewerId, thread.id, joinResult ? anchoredNote(fresh, i, nowMs, joinResult) : museNote(view, i, nowMs), 'muse');
    // Both are on the plan now: Muse shares the exact spot in the pair's chat.
    const reveal = joinResult === 'joined' ? revealText(fresh, i, nowMs) : null;
    if (reveal) await store.sendMessage(viewerId, thread.id, `${MUSE_PREFIX}${reveal}`, 'muse');
  }
  await store.updateIntro(i.id, { threadId: thread.id });
  await store.notifyIntro(otherId, viewerId, i.id,
    `✨ Muse: you and ${firstName(view.profileById.get(viewerId))} are connected. Muse started your chat.`);
  await publish(`user:${i.aId}`, { type: 'intro', id: i.id });
  await publish(`user:${i.bId}`, { type: 'intro', id: i.id });
  return current();
}

/**
 * Muse's quick replies in a connected intro. 'hold' takes a seat on the first step's quest for
 * each of the two people not yet on it (join_quest, one atomic seat each) and Muse confirms in the
 * pair's chat. 'pick' switches the first step to another plan from the card's options and Muse
 * reposts its ask with the new time. Either person may answer; both see the result live.
 */
export async function planIntro(store: DataStore, viewerId: ID, introId: ID, act: IntroPlanAction): Promise<{ intro: IntroCardData }> {
  const { view } = await store.museContext();
  const nowMs = now().getTime();
  const i = view.db.intros.find((x) => x.id === introId);
  if (!i || !visibleTo(i, viewerId)) throw notFound('intro_not_found');
  if (i.status !== 'accepted' || !i.threadId) throw conflict('intro_not_connected');
  const plan = planView(view, i, nowMs)!;
  const viewerName = firstName(view.profileById.get(viewerId));
  const names = `${firstName(view.profileById.get(i.aId))} and ${firstName(view.profileById.get(i.bId))}`;
  if (act.action === 'hold') {
    if (!plan.questId) throw conflict('no_plan_to_hold');
    if (!plan.held) {
      if (!plan.canHold) throw conflict(`Only ${seatsText(stepView(view, i, nowMs).seatsLeft ?? 0)} left`);
      for (const id of notYetOn(view, i)) await store.joinQuest(id, plan.questId);
      const after = (await store.museContext()).view;
      const s = stepView(after, i, nowMs);
      await store.sendMessage(viewerId, i.threadId,
        `${MUSE_PREFIX}Done, ${viewerName} asked me to hold it: ${names} are both going to ${s.label} (${s.when}). It's on both your Out Here maps. See you there!`, 'muse');
      const reveal = revealText(after, i, nowMs);
      if (reveal) await store.sendMessage(viewerId, i.threadId, `${MUSE_PREFIX}${reveal}`, 'muse');
    }
  } else {
    const pick = plan.options.find((o) => o.questId === act.questId);
    if (!pick) throw badRequest('questId is not one of this intro\'s options');
    const q = view.db.quests.find((x) => x.id === pick.questId)!;
    await store.updateIntro(i.id, { firstStep: stepOf(q) });
    const after = (await store.museContext()).view;
    const moved = after.db.intros.find((x) => x.id === i.id)!;
    await store.sendMessage(viewerId, i.threadId,
      `${MUSE_PREFIX}${viewerName} picked another time. ${museAsk(after, moved, nowMs)}`, 'muse');
  }
  await publish(`user:${i.aId}`, { type: 'intro', id: i.id });
  await publish(`user:${i.bId}`, { type: 'intro', id: i.id });
  const after = (await store.museContext()).view;
  return { intro: cardFor(after, viewerId, after.db.intros.find((x) => x.id === i.id)!, nowMs)! };
}

export async function getIntroProfile(store: DataStore, viewerId: ID): Promise<{ profile: IntroProfile }> {
  const { view } = await store.museContext();
  return { profile: introProfileOf(view, viewerId) };
}

export type IntroProfilePatch = {
  kinds?: Partial<Record<IntroKind, Partial<IntroKindSetting>>>;
  datingPrefs?: IntroProfile['datingPrefs'];
  maxKm?: number;
  paused?: boolean;
};

export async function putIntroProfile(store: DataStore, viewerId: ID, patch: IntroProfilePatch): Promise<{ profile: IntroProfile }> {
  const { view } = await store.museContext();
  const cur = introProfileOf(view, viewerId);
  const kinds = { ...cur.kinds };
  for (const k of INTRO_KINDS) {
    const p = patch.kinds?.[k];
    if (p) kinds[k] = { on: p.on ?? kinds[k].on, lookingFor: (p.lookingFor ?? kinds[k].lookingFor).trim() };
  }
  const datingPrefs = patch.datingPrefs === undefined ? cur.datingPrefs : patch.datingPrefs;
  if (datingPrefs && datingPrefs.ageMin > datingPrefs.ageMax) throw badRequest('datingPrefs: ageMin must be <= ageMax');
  const next: IntroProfile = {
    userId: viewerId, kinds, datingPrefs, maxKm: patch.maxKm ?? cur.maxKm, paused: patch.paused ?? cur.paused,
  };
  await store.saveIntroProfile(next);
  return { profile: next };
}

/** Demo control: removes the viewer's intros (both sides) so a round can run again. */
export async function resetIntros(store: DataStore, viewerId: ID): Promise<{ removed: number }> {
  const { view } = await store.museContext();
  const mine = view.db.intros.filter((i) => i.aId === viewerId || i.bId === viewerId);
  // Also clears their notifications and Muse's note in the pair's chat, so a rehearsal leaves no duplicates.
  await store.removeIntros(mine.map((i) => i.id), mine.flatMap((i) => (i.threadId ? [i.threadId] : [])));
  for (const i of mine) {
    await publish(`user:${i.aId}`, { type: 'intro', id: i.id });
    await publish(`user:${i.bId}`, { type: 'intro', id: i.id });
  }
  return { removed: mine.length };
}
