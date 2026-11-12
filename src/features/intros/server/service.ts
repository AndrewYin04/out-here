// Muse Intros service: rounds, on-request intros, double opt-in, settings and per-side views.
// Every function takes the viewer id from x-persona (the route passes it) and returns only what
// that side may see: the other person's first name and photo, the shared trust path and
// reasons, Muse's note to the viewer, and the viewer's own agent's turns. Nothing about the
// other person's agent log, decision or settings leaves the server.
import {
  INTRO_KINDS, now,
  type ID, type Intro, type IntroCardView, type IntroKind, type IntroKindSetting, type IntroProfile,
} from '@/shared';
import { badRequest, notFound, publish, type DataStore, type View } from '@/features/data/server';
import { runClick } from './agents';
import {
  AGENT_SHORTLIST, candidatesFor, firstName, INTRO_TTL_MS, introProfileOf, kindsOn, passesBar, trustLabels,
  underWeeklyCap,
} from './rules';

export const MUSE_PREFIX = '✨ Muse: ';
/** Whole-round budget for live Muse calls (3 pairs run in parallel, 5 calls each). */
const ROUND_BUDGET_MS = 40_000;

const isExpired = (i: Intro, nowMs: number) =>
  (i.status === 'proposed' || i.status === 'a_accepted' || i.status === 'b_accepted') && nowMs - Date.parse(i.createdAt) > INTRO_TTL_MS;

export function cardFor(v: View, viewerId: ID, i: Intro, nowMs = now().getTime()): IntroCardView | null {
  const isA = i.aId === viewerId;
  if (!isA && i.bId !== viewerId) return null;
  const other = v.profileById.get(isA ? i.bId : i.aId);
  if (!other) return null;
  let state: IntroCardView['state'] = 'new';
  let closedText: string | null = null;
  if (i.status === 'accepted') state = 'connected';
  else if (i.status === 'declined') {
    state = 'closed';
    closedText = i.declinedBy === viewerId ? 'You passed on this intro' : "Didn't work out this time";
  } else if (i.status === 'expired' || isExpired(i, nowMs)) {
    state = 'closed'; closedText = 'This intro expired';
  } else if ((i.status === 'a_accepted' && isA) || (i.status === 'b_accepted' && !isA)) state = 'waiting';
  return {
    id: i.id, kind: i.kind, score: i.score,
    other: { id: other.id, handle: other.handle, firstName: firstName(other), avatarUrl: other.avatarUrl },
    trustPath: trustLabels(v, i.trustPath),
    summary: i.summary, reasons: i.reasons, note: isA ? i.noteA : i.noteB, firstStep: i.firstStep,
    myAgentLog: (isA ? i.agentLogA : i.agentLogB).map((t) => t.text),
    state, closedText,
    threadId: state === 'connected' ? i.threadId : null,
    createdAt: i.createdAt,
  };
}

export async function listIntros(store: DataStore, viewerId: ID): Promise<{ intros: IntroCardView[] }> {
  const { view } = await store.museContext();
  const nowMs = now().getTime();
  const intros = view.db.intros
    .filter((i) => i.aId === viewerId || i.bId === viewerId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((i) => cardFor(view, viewerId, i, nowMs))
    .filter((c): c is IntroCardView => !!c);
  return { intros };
}

export type RoundResult = {
  intro: IntroCardView | null;
  /** Pairs the agents vetted that did not clear the bar (names never sent). */
  considered: number;
  belowBar: number;
  capped: boolean;
  paused: boolean;
  message: string;
};

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
  const vetted = await Promise.all(shortlist.map(async (c) => {
    try {
      return { c, r: await runClick(view, me, opts.profile, c, nowMs, deadline) };
    } catch (err) {
      console.error('[intros] agent exchange failed:', String((err as Error)?.message ?? err).slice(0, 200));
      return null;
    }
  }));
  const passing = vetted
    .filter((x): x is NonNullable<typeof x> => !!x && passesBar(x.r.score, x.r.reasons, x.c.trust).ok)
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
    trustPath: best.c.trust, score: best.r.score, reasons: best.r.reasons.slice(0, 3), summary: best.r.summary,
    noteA: best.r.noteA, noteB: best.r.noteB, firstStep: best.r.firstStep,
    agentLogA: best.r.logA, agentLogB: best.r.logB,
    status: 'proposed', declinedBy: null, threadId: null, createdAt: now().toISOString(), decidedAt: null,
  };
  await store.insertIntro(row);
  await publish(`user:${viewerId}`, { type: 'intro', id: row.id });
  await publish(`user:${row.bId}`, { type: 'intro', id: row.id });
  const after = (await store.museContext()).view;
  return {
    intro: cardFor(after, viewerId, row, nowMs), considered, belowBar: considered - 1, capped: false, paused: false,
    message: `Muse found someone. ${considered - 1 > 0 ? `${considered - 1} other ${considered - 1 === 1 ? 'person was' : 'people were'} considered but not a strong enough match.` : ''}`.trim(),
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

export async function respondIntro(store: DataStore, viewerId: ID, introId: ID, accept: boolean): Promise<{ intro: IntroCardView }> {
  const { view } = await store.museContext();
  const i = view.db.intros.find((x) => x.id === introId);
  if (!i || (i.aId !== viewerId && i.bId !== viewerId)) throw notFound('intro_not_found');
  const isA = i.aId === viewerId;
  const nowMs = now().getTime();
  const open = (i.status === 'proposed' || i.status === 'a_accepted' || i.status === 'b_accepted') && !isExpired(i, nowMs);
  if (!open) return { intro: cardFor(view, viewerId, i, nowMs)! };
  const otherId = isA ? i.bId : i.aId;
  if (!accept) {
    await store.updateIntro(i.id, { status: 'declined', declinedBy: viewerId, decidedAt: now().toISOString() });
    // Silent to the other side: no realtime message, no notification.
    await publish(`user:${viewerId}`, { type: 'intro', id: i.id });
  } else {
    const otherAccepted = (isA && i.status === 'b_accepted') || (!isA && i.status === 'a_accepted');
    if (!otherAccepted) {
      await store.updateIntro(i.id, { status: isA ? 'a_accepted' : 'b_accepted' });
      await publish(`user:${viewerId}`, { type: 'intro', id: i.id });
    } else {
      const thread = await store.openThread(viewerId, [otherId]);
      const a = view.profileById.get(i.aId); const b = view.profileById.get(i.bId);
      const text = `${MUSE_PREFIX}${firstName(a)}, meet ${firstName(b)}. ${i.summary} First step idea: ${i.firstStep.text}.`;
      await store.sendMessage(viewerId, thread.id, text);
      await store.updateIntro(i.id, { status: 'accepted', threadId: thread.id, decidedAt: now().toISOString() });
      await publish(`user:${i.aId}`, { type: 'intro', id: i.id });
      await publish(`user:${i.bId}`, { type: 'intro', id: i.id });
    }
  }
  const after = (await store.museContext()).view;
  const updated = after.db.intros.find((x) => x.id === i.id) ?? i;
  return { intro: cardFor(after, viewerId, updated, nowMs)! };
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
  await store.removeIntros(mine.map((i) => i.id));
  for (const i of mine) {
    await publish(`user:${i.aId}`, { type: 'intro', id: i.id });
    await publish(`user:${i.bId}`, { type: 'intro', id: i.id });
  }
  return { removed: mine.length };
}
