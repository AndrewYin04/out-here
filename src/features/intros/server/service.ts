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
import type { IntroCardData, IntroPlanAction, IntroPlanOption, IntroPlanView } from '../types';
import { rankSteps, runClick, stepOf, type ClickResult } from './agents';
import { privacyGuard, privateTexts } from './privacy';
import {
  AGENT_SHORTLIST, candidatesFor, firstName, INTRO_TTL_MS, introProfileOf, kindsOn, lookingForOf, passesBar, SCORE_THRESHOLD,
  trustLabels, underWeeklyCap,
} from './rules';

export const MUSE_PREFIX = '✨ Muse: ';
/** Whole-round budget for live Muse calls (3 pairs run in parallel, 5 calls each). */
const ROUND_BUDGET_MS = 40_000;
const TZ = 'America/Los_Angeles';

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

const dayKey = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: TZ });

/** "Starts in 25 min", "Today 5:45 PM", "Tomorrow 10:00 AM", "Sat 2:00 PM"; minutes rounded to 5. */
export function relativeWhen(startsAt: string, nowMs: number): string {
  const ms = Date.parse(startsAt);
  const mins = Math.round((ms - nowMs) / 60_000);
  if (mins <= 0) return 'Happening now';
  if (mins < 60) return `Starts in ${Math.max(5, Math.round(mins / 5) * 5)} min`;
  const rounded = Math.round(ms / 300_000) * 300_000;
  const time = new Date(rounded).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
  const day = dayKey(rounded);
  if (day === dayKey(nowMs)) return `Today ${time}`;
  if (day === dayKey(nowMs + 86_400_000)) return `Tomorrow ${time}`;
  return `${new Date(rounded).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short' })} ${time}`;
}

function stepView(v: View, i: Intro, nowMs: number): IntroStepView {
  const q = i.firstStep.questId ? v.db.quests.find((x) => x.id === i.firstStep.questId) : undefined;
  if (!q) return { label: i.firstStep.text, when: null, href: null, seatsLeft: null };
  const live = (q.status === 'open' || q.status === 'live') && Date.parse(q.endsAt) > nowMs;
  return {
    label: `${q.emoji} ${q.title} at ${q.venueName}`,
    when: live ? relativeWhen(q.startsAt, nowMs) : 'This plan has ended',
    href: live ? `/out-here?quest=${encodeURIComponent(q.id)}` : null,
    seatsLeft: live ? v.seatsLeft(q) : null,
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
 * 🎸 Local-band show pregame at The Signal Room (Today 7:50 PM, 3 seats left)? ..."
 */
export function museAsk(v: View, i: Intro, nowMs: number): string {
  const s = stepView(v, i, nowMs);
  if (!liveStep(s)) return 'Want me to find a plan for you two? Tap Pick a time on your intro.';
  const missing = notYetOn(v, i);
  if (missing.length === 0) return `You're both going to ${s.label} (${s.when}).`;
  const going = [i.aId, i.bId].find((id) => !missing.includes(id)) ?? i.aId;
  const hold = missing.length === 2 ? 'hold 2 seats'
    : `hold a seat for ${firstName(v.profileById.get(missing[0]))} (${firstName(v.profileById.get(going))} is already going)`;
  return `Want me to ${hold} at ${s.label} (${s.when}, ${seatsText(s.seatsLeft ?? 0)} left)? Tap Hold seats or Pick another time on your intro.`;
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
export function planView(v: View, i: Intro, nowMs: number): IntroPlanView | null {
  if (i.status !== 'accepted') return null;
  const s = stepView(v, i, nowMs);
  const live = liveStep(s);
  const need = live ? notYetOn(v, i).length : 0;
  return {
    questId: live ? i.firstStep.questId : null,
    ask: museAsk(v, i, nowMs),
    held: live && need === 0,
    seatsNeeded: need,
    canHold: live && need > 0 && (s.seatsLeft ?? 0) >= need,
    options: planOptions(v, i, nowMs),
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
  over: { viewerIntro?: IntroProfile; otherIntro?: IntroProfile } = {},
) {
  const viewer = v.profileById.get(viewerId); const other = v.profileById.get(otherId);
  if (!viewer || !other) return null;
  const stored = introProfileOf(v, viewerId);
  const otherStored = introProfileOf(v, otherId);
  const otherIntro = over.otherIntro ?? otherStored;
  return privacyGuard({
    viewer, viewerIntro: over.viewerIntro ?? stored,
    seenOther: v.profileFor(viewerId, other),
    secrets: [...new Set([...privateTexts(otherStored), ...privateTexts(otherIntro)])],
    extra: [...privateTexts(stored), ...trustLabels(v, i.trustPath), i.firstStep.text],
    // A leaking reason is rewritten from what both wrote for this intro's kind only.
    kind: i.kind, otherKindText: lookingForOf(otherIntro, i.kind),
  });
}

/**
 * Rewrites one vetted result so neither side's text quotes the other side's private looking-for
 * (review E4). A's settings may carry an on-request override, so they are passed in.
 */
function scrubResult(v: View, aId: ID, aIntro: IntroProfile, bId: ID, i: Pick<Intro, 'kind' | 'trustPath' | 'firstStep'>, r: ClickResult): ClickResult {
  const gA = guardFor(v, i, aId, bId, { viewerIntro: aIntro });
  const gB = guardFor(v, i, bId, aId, { otherIntro: aIntro });
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
    plan: state === 'connected' ? planView(v, i, nowMs) : null,
  };
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
  /** Pairs the agents vetted that did not clear the bar (names never sent). */
  considered: number;
  belowBar: number;
  capped: boolean;
  paused: boolean;
  message: string;
};

const introNotice = (otherName: string, trust: string | undefined) =>
  `✨ Muse has an intro for you: meet ${otherName}.${trust ? ` ${trust}.` : ''}`;

/** One vetting round for the viewer. auto rounds obey the weekly cap; requests do not. */
async function round(
  store: DataStore, viewerId: ID, opts: { kinds: IntroKind[]; source: Intro['source']; profile: IntroProfile },
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
  let pool = candidatesFor(view, viewerId, { kinds, nowMs, viewerProfile: opts.profile });
  if (opts.source === 'auto') pool = pool.filter((c) => underWeeklyCap(view.db.intros, c.profile.id, nowMs));
  const shortlist = pool.slice(0, AGENT_SHORTLIST);
  const deadline = Date.now() + ROUND_BUDGET_MS;
  // Candidates run in parallel and fail alone: one that errors or times out is skipped.
  const vetted = await Promise.all(shortlist.map(async (c) => {
    try {
      const raw = await runClick(view, me, opts.profile, c, nowMs, deadline);
      return { c, r: scrubResult(view, viewerId, opts.profile, c.profile.id, { kind: c.kind, trustPath: c.trust, firstStep: raw.firstStep }, raw) };
    } catch (err) {
      console.error('[intros] agent exchange failed:', String((err as Error)?.message ?? err).slice(0, 200));
      return null;
    }
  }));
  // Each person must get at least 2 concrete reasons written to them.
  const passing = vetted
    .filter((x): x is NonNullable<typeof x> => !!x
      && passesBar(x.r.score, x.r.reasonsA, x.c.trust).ok && passesBar(x.r.score, x.r.reasonsB, x.c.trust).ok)
    .sort((x, y) => y.r.score - x.r.score);
  const best = passing[0];
  const considered = vetted.filter(Boolean).length;
  if (!best) {
    return {
      ...empty, considered, belowBar: considered,
      message: considered
        ? `No great match yet. Muse considered ${considered} ${considered === 1 ? 'person' : 'people'}, but nobody was a strong enough match.`
        : 'No great match yet. Muse only introduces when it\'s confident.',
    };
  }
  const row: Intro = {
    id: crypto.randomUUID(), kind: best.c.kind, source: opts.source, aId: viewerId, bId: best.c.profile.id,
    trustPath: best.c.trust, score: best.r.score,
    reasons: best.r.reasonsA.slice(0, 3), reasonsB: best.r.reasonsB.slice(0, 3), summary: best.r.summary,
    noteA: best.r.noteA, noteB: best.r.noteB, firstStep: best.r.firstStep,
    agentLogA: best.r.logA, agentLogB: best.r.logB,
    status: 'proposed', declinedBy: null, threadId: null, createdAt: now().toISOString(), decidedAt: null,
  };
  await store.insertIntro(row);
  // Only A hears now. B is asked after A says yes.
  await store.notifyIntro(viewerId, row.bId, row.id, introNotice(firstName(best.c.profile), trustLabels(view, row.trustPath)[0]));
  await publish(`user:${viewerId}`, { type: 'intro', id: row.id });
  const after = (await store.museContext()).view;
  const others = considered - 1;
  return {
    intro: cardFor(after, viewerId, row, nowMs), considered, belowBar: others, capped: false, paused: false,
    message: `Muse found someone. ${others > 0 ? `${others} other ${others === 1 ? 'person was' : 'people were'} considered but not a strong enough match.` : ''}`.trim(),
  };
}

/** The automatic round (runIntroRound in the plan); the /intros demo control calls it. */
export async function runIntroRound(store: DataStore, viewerId: ID, kind?: IntroKind): Promise<RoundResult> {
  const { view } = await store.museContext();
  const profile = introProfileOf(view, viewerId);
  return round(store, viewerId, { kinds: kind ? [kind] : kindsOn(profile), source: 'auto', profile });
}

/** "Ask Muse for an intro": still must clear the bar, else "No great match yet". */
export async function requestIntro(store: DataStore, viewerId: ID, kind: IntroKind, lookingFor: string): Promise<RoundResult> {
  const { view } = await store.museContext();
  const base = introProfileOf(view, viewerId);
  // The request counts as opting into that kind for this search only; settings stay as they are.
  const profile: IntroProfile = { ...base, kinds: { ...base.kinds, [kind]: { on: true, lookingFor: lookingFor.trim() || base.kinds[kind].lookingFor } } };
  return round(store, viewerId, { kinds: [kind], source: 'request', profile });
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
        await store.notifyIntro(i.bId, i.aId, i.id, introNotice(firstName(a), trustLabels(view, i.trustPath)[0]));
        await publish(`user:${i.bId}`, { type: 'intro', id: i.id });
      }
    }
    return current();
  }
  if (!(await store.transitionIntro(i.id, i.status, { status: 'accepted', decidedAt: now().toISOString() }))) return current();
  // This request won the transition to accepted: it alone opens the chat and posts the note.
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
  if (!already) await store.sendMessage(viewerId, thread.id, museNote(view, i, nowMs), 'muse');
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
