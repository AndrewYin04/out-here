// Post-hangout rating (spec: docs/HANGOUT_RATINGS.md). Server-only; CoreStore exposes these as
// store methods.
//
// Rules:
// - Only a member of a quest rates it, and only after its start time.
// - score lies inside VERDICT_RANGES[verdict]; highlights come from HANGOUT_HIGHLIGHTS; each
//   hang-again subject is another member; photoIds are memories of that quest.
// - Privacy: no viewer-facing method returns another user's hang_again rows or note. The recap
//   has counts and chips only. hangAgainSignals / hangAgainAbout / mutualHangAgain /
//   hangoutRatings are for route handlers and Muse server code, never for a client.
import {
  HANGOUT_HIGHLIGHTS, NEGATIVE_HIGHLIGHTS, now, RECAP_MIN_OTHER_RATERS, seedId, VERDICT_RANGES,
  type HangAgain, type HangoutRating, type HangoutVerdict, type ID, type Memory,
} from '@/shared';
import type { HangoutRatingState, HangoutRecap, MyRating, RateHangoutBody } from '@/shared/api';
import type { CoreStore } from './core';
import type { QuestRow } from './db';
import { badRequest, conflict, forbidden, notFound } from './errors';
import { publish } from './realtime-server';
import type { View } from './view';

const VERDICTS: HangoutVerdict[] = ['loved', 'fine', 'meh'];
const HIGHLIGHTS = new Set<string>(HANGOUT_HIGHLIGHTS);
export const NOTE_MAX = 500;
/** A quest that ended within this window, unrated, gets a lazy hangout_rate notification. */
export const RATE_PROMPT_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

const round1 = (n: number) => Math.round(n * 10 + 1e-9) / 10;

/** Stable id, so a second "We're done" or a concurrent read never creates a duplicate. */
export const rateNotificationId = (questId: ID, userId: ID) => seedId('hangout-rate', `${questId}:${userId}`);

/** The quest a member may rate: 404 when unknown or hidden, 403 for non-members, 409 before start. */
function ratableQuest(v: View, viewerId: ID, questId: ID): QuestRow {
  const q = v.questById.get(questId);
  if (!q || !v.canSeeQuest(viewerId, q)) throw notFound('quest_not_found');
  if (!v.questMemberIds(questId).includes(viewerId)) throw forbidden('only attendees can rate a hangout');
  if (new Date(q.startsAt) > now()) throw conflict('This hangout has not started yet.');
  return q;
}

function ownAgain(v: View, viewerId: ID, questId: ID) {
  return v.db.hangAgain.filter((a) => a.questId === questId && a.raterId === viewerId)
    .map((a) => ({ subjectId: a.subjectId, again: a.again }));
}

/**
 * Sends "How was <venue>?" to every member who has not had one for this quest. The actor shown is
 * another member, so the row has a familiar face. `skipRated` leaves out members who already rated.
 */
export async function promptRatings(store: CoreStore, v: View, q: QuestRow, recipients: ID[], skipRated = false): Promise<void> {
  const members = v.questMemberIds(q.id);
  const rows = recipients.filter((m) => members.includes(m))
    .filter((m) => !v.db.notifications.some((n) => n.id === rateNotificationId(q.id, m)))
    .filter((m) => !skipRated || !v.db.hangoutRatings.some((r) => r.questId === q.id && r.raterId === m))
    .map((m) => ({
      id: rateNotificationId(q.id, m), recipientId: m, type: 'hangout_rate' as const,
      actorId: members.find((x) => x !== m) ?? null, objectType: 'quest' as const, objectId: q.id,
      text: `How was ${q.venueName}? Rate ${q.title} and add your photos.`,
      createdAt: now().toISOString(), readAt: null,
    }));
  if (!rows.length) return;
  await store.backend.upsert('notifications', rows);
  for (const r of rows) await publish(`user:${r.recipientId}`, { type: 'notification', id: r.id });
}

/** Lazy prompt for hangouts whose end time passed without anyone tapping "We're done". */
export async function promptEndedHangouts(store: CoreStore, v: View, viewerId: ID): Promise<boolean> {
  const t = now().getTime();
  const due = v.db.questMembers.filter((m) => m.userId === viewerId)
    .map((m) => v.questById.get(m.questId))
    .filter((q): q is QuestRow => !!q)
    .filter((q) => {
      const end = new Date(q.endsAt).getTime();
      return end <= t && end > t - RATE_PROMPT_WINDOW_MS
        && !v.db.notifications.some((n) => n.id === rateNotificationId(q.id, viewerId))
        && !v.db.hangoutRatings.some((r) => r.questId === q.id && r.raterId === viewerId);
    });
  for (const q of due) await promptRatings(store, v, q, [viewerId], true);
  return due.length > 0;
}

/** The rating's photos as Memory rows, in photoIds order, so clients render each photoUrl as stored. */
function ratingPhotos(v: View, rating: HangoutRating): Memory[] {
  const byId = new Map(v.db.memories.filter((m) => m.questId === rating.questId).map((m) => [m.id, m]));
  return rating.photoIds.map((id) => byId.get(id)).filter((m): m is Memory => !!m).map((m) => ({ ...m }));
}

export async function ratingState(store: CoreStore, viewerId: ID, questId: ID): Promise<HangoutRatingState> {
  const v = await store.view();
  ratableQuest(v, viewerId, questId);
  const rating = v.db.hangoutRatings.find((r) => r.questId === questId && r.raterId === viewerId) ?? null;
  const compareWith = v.db.hangoutRatings.filter((r) => r.raterId === viewerId && r.questId !== questId)
    .map((r) => ({ r, q: v.questById.get(r.questId) }))
    .filter((x): x is { r: HangoutRating; q: QuestRow } => !!x.q)
    .sort((a, b) => b.r.score - a.r.score)
    .map(({ r, q }) => ({ questId: q.id, title: q.title, emoji: q.emoji, score: r.score, verdict: r.verdict }));
  return {
    rating: rating ? { ...rating } : null,
    photos: rating ? ratingPhotos(v, rating) : [],
    again: ownAgain(v, viewerId, questId),
    attendees: v.people(viewerId, v.questMemberIds(questId).filter((m) => m !== viewerId)),
    compareWith,
  };
}

/** PUT: upsert the viewer's rating and replace their hang-again answers for this quest. */
export async function rateHangout(store: CoreStore, viewerId: ID, questId: ID, body: RateHangoutBody): Promise<HangoutRating> {
  const v = await store.view();
  const q = ratableQuest(v, viewerId, questId);
  if (!VERDICTS.includes(body.verdict)) throw badRequest('verdict must be loved, fine or meh');
  const [lo, hi] = VERDICT_RANGES[body.verdict];
  const score = round1(body.score);
  if (!Number.isFinite(score) || score < lo || score > hi) throw badRequest(`score must be between ${lo} and ${hi} for "${body.verdict}"`);
  const highlights = [...new Set(body.highlights)];
  const unknown = highlights.find((h) => !HIGHLIGHTS.has(h));
  if (unknown !== undefined) throw badRequest(`unknown highlight "${unknown}"`);
  const note = (body.note ?? '').trim();
  if (note.length > NOTE_MAX) throw badRequest(`note is longer than ${NOTE_MAX} characters`);
  const photoIds = [...new Set(body.photoIds ?? [])];
  const questPhotos = new Set(v.db.memories.filter((m) => m.questId === q.id).map((m) => m.id));
  if (photoIds.some((id) => !questPhotos.has(id))) throw badRequest('photoIds must be photos from this hangout');
  const others = new Set(v.questMemberIds(q.id).filter((m) => m !== viewerId));
  const answers = new Map<ID, boolean>();
  for (const a of body.again) {
    if (a.subjectId === viewerId) throw badRequest('you cannot answer about yourself');
    if (!others.has(a.subjectId)) throw badRequest('each subjectId must be another attendee of this hangout');
    answers.set(a.subjectId, a.again);
  }

  const t = now().toISOString();
  const prev = v.db.hangoutRatings.find((r) => r.questId === q.id && r.raterId === viewerId);
  const rating: HangoutRating = {
    id: prev?.id ?? crypto.randomUUID(), questId: q.id, raterId: viewerId, verdict: body.verdict, score,
    highlights, note, photoIds, createdAt: prev?.createdAt ?? t, updatedAt: t,
  };
  await store.backend.upsert('hangoutRatings', [rating]);

  const prevAgain = v.db.hangAgain.filter((a) => a.questId === q.id && a.raterId === viewerId);
  const dropped = prevAgain.filter((a) => !answers.has(a.subjectId)).map((a) => a.subjectId);
  if (dropped.length) await store.backend.remove('hangAgain', { questId: q.id, raterId: viewerId, subjectId: dropped });
  const rows: HangAgain[] = [...answers].map(([subjectId, again]) => ({
    questId: q.id, raterId: viewerId, subjectId, again,
    createdAt: prevAgain.find((a) => a.subjectId === subjectId)?.createdAt ?? t,
  }));
  if (rows.length) await store.backend.upsert('hangAgain', rows);

  // ids only: the recap refetches its counts through the API.
  for (const m of v.questMemberIds(q.id)) await publish(`user:${m}`, { type: 'rating', id: q.id });
  return rating;
}

export async function hangoutRecap(store: CoreStore, viewerId: ID, questId: ID): Promise<HangoutRecap> {
  const v = await store.view();
  const q = v.questById.get(questId);
  if (!q || !v.canSeeQuest(viewerId, q)) throw notFound('quest_not_found');
  const memberIds = v.questMemberIds(questId);
  if (!memberIds.includes(viewerId)) throw forbidden('only attendees can see the recap');
  const ratings = v.db.hangoutRatings.filter((r) => r.questId === questId);
  const verdicts: Record<HangoutVerdict, number> = { loved: 0, fine: 0, meh: 0 };
  const chips = new Map<string, number>();
  for (const r of ratings) {
    verdicts[r.verdict]++;
    for (const h of r.highlights) chips.set(h, (chips.get(h) ?? 0) + 1);
  }
  const mine = ratings.find((r) => r.raterId === viewerId);
  const base = {
    quest: v.questFor(viewerId, q),
    members: v.people(viewerId, memberIds),
    photos: v.db.memories.filter((m) => m.questId === questId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    ratedCount: ratings.length,
    myRating: mine ? { ...mine } : null,
  };
  // k-anonymity: the viewer knows their own answer, so on a small hangout the counts would reveal
  // what the others said. Below RECAP_MIN_OTHER_RATERS other raters, no verdict counts, and only
  // positive chips every rater picked ("Everyone who rated it said good food").
  if (ratings.filter((r) => r.raterId !== viewerId).length < RECAP_MIN_OTHER_RATERS) {
    const unanimous = ratings.length >= 2
      ? [...chips].filter(([label, n]) => n === ratings.length && !NEGATIVE_HIGHLIGHTS.has(label)).map(([label]) => label).sort()
      : [];
    return { ...base, countsHidden: true, verdicts: null, highlights: unanimous.map((label) => ({ label, count: ratings.length })) };
  }
  return {
    ...base,
    countsHidden: false,
    verdicts,
    highlights: [...chips].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([label, count]) => ({ label, count })),
  };
}

export async function myRatings(store: CoreStore, viewerId: ID): Promise<MyRating[]> {
  const v = await store.view();
  return v.db.hangoutRatings.filter((r) => r.raterId === viewerId)
    .map((r) => ({ r, q: v.questById.get(r.questId) }))
    .filter((x): x is { r: HangoutRating; q: QuestRow } => !!x.q)
    .sort((a, b) => b.r.score - a.r.score || b.r.updatedAt.localeCompare(a.r.updatedAt))
    .map(({ r, q }) => ({ ...r, quest: v.questFor(viewerId, q), photos: ratingPhotos(v, r) }));
}

// ---------- server-only reads for Muse matching ----------

export async function hangAgainSignals(store: CoreStore, userId: ID): Promise<HangAgain[]> {
  return (await store.view()).db.hangAgain.filter((a) => a.raterId === userId).map((a) => ({ ...a }));
}

export async function hangAgainAbout(store: CoreStore, userId: ID): Promise<HangAgain[]> {
  return (await store.view()).db.hangAgain.filter((a) => a.subjectId === userId).map((a) => ({ ...a }));
}

/**
 * 'one_no' when either person ever said no about the other; 'both_yes' when each said yes about
 * the other at least once; otherwise 'unknown'.
 */
export async function mutualHangAgain(store: CoreStore, a: ID, b: ID): Promise<'both_yes' | 'one_no' | 'unknown'> {
  const rows = (await store.view()).db.hangAgain.filter((x) =>
    (x.raterId === a && x.subjectId === b) || (x.raterId === b && x.subjectId === a));
  if (rows.some((x) => !x.again)) return 'one_no';
  const aYes = rows.some((x) => x.raterId === a && x.again);
  const bYes = rows.some((x) => x.raterId === b && x.again);
  return aYes && bYes ? 'both_yes' : 'unknown';
}

/**
 * mutualHangAgain for many people at once, in one pass over the hang_again snapshot: for each id in
 * otherIds, the same 'both_yes' | 'one_no' | 'unknown' as mutualHangAgain(viewerId, id).
 */
export async function mutualHangAgainMany(
  store: CoreStore, viewerId: ID, otherIds: ID[],
): Promise<Record<ID, 'both_yes' | 'one_no' | 'unknown'>> {
  const want = new Set(otherIds);
  const seen = new Map<ID, { no: boolean; mine: boolean; theirs: boolean }>();
  for (const x of (await store.view()).db.hangAgain) {
    const other = x.raterId === viewerId ? x.subjectId : x.subjectId === viewerId ? x.raterId : null;
    if (other === null || other === viewerId || !want.has(other)) continue;
    const s = seen.get(other) ?? { no: false, mine: false, theirs: false };
    if (!x.again) s.no = true;
    else if (x.raterId === viewerId) s.mine = true;
    else s.theirs = true;
    seen.set(other, s);
  }
  const out: Record<ID, 'both_yes' | 'one_no' | 'unknown'> = {};
  for (const id of otherIds) {
    const s = seen.get(id);
    out[id] = !s ? 'unknown' : s.no ? 'one_no' : s.mine && s.theirs ? 'both_yes' : 'unknown';
  }
  return out;
}

export async function hangoutRatings(store: CoreStore, userId: ID): Promise<HangoutRating[]> {
  return (await store.view()).db.hangoutRatings.filter((r) => r.raterId === userId)
    .sort((a, b) => b.score - a.score).map((r) => ({ ...r, highlights: [...r.highlights], photoIds: [...r.photoIds] }));
}

