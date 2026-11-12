// Deterministic wording and scoring: the mock ranker, the fallback when the model fails,
// and the replacement text validate() uses when a model sentence names someone it may not.
import { formatDemoTime, type MuseIntent, type PlanSuggestion } from '../../shared';
import type { PlanCandidate } from './candidates';
import { windowMinutes } from './time';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function priceText(priceMax: number): string {
  return priceMax === 0 ? 'free' : `up to $${priceMax}`;
}

export function windowText(intent: MuseIntent): string {
  const mins = windowMinutes(intent.windowStart, intent.windowEnd);
  if (mins <= 90) return `${mins} min`;
  return `window until ${formatDemoTime(intent.windowEnd)}`;
}

/** Higher is better. Friends who can come weigh most, then a named-activity match. */
export function heuristicScore(c: PlanCandidate, intent: MuseIntent, nowMs: number): number {
  let s = 0;
  if (intent.wantsFriends && c.friendOverlap.length > 0) s += 40;
  s += Math.min(30, 15 * c.friendMembers.length);
  if (c.specificMatch) s += 20;
  s += 8 * c.viewerInterests.length;
  s += 5 * c.matchedActivities.length;
  s -= 0.5 * c.travelMinutesExact;
  s -= 0.1 * Math.max(0, (Date.parse(c.quest.startsAt) - nowMs) / 60_000);
  if (c.seatsLeft === 1) s += 3;
  return s;
}

export function rankHeuristic(candidates: PlanCandidate[], intent: MuseIntent, now: Date): PlanCandidate[] {
  const nowMs = now.getTime();
  return candidates
    .map((c) => ({ c, s: heuristicScore(c, intent, nowMs) }))
    .sort((a, b) => b.s - a.s || a.c.questId.localeCompare(b.c.questId))
    .map((x) => x.c);
}

export function invitedFriends(c: PlanCandidate, intent: MuseIntent): PlanCandidate['friendOverlap'] {
  return intent.wantsFriends ? c.friendOverlap.slice(0, 2) : [];
}

const joinNames = (names: string[]) =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

export function reasonText(c: PlanCandidate, friendIds: string[]): string {
  const q = c.quest;
  const first = `${q.title} at ${q.venueName} starts at ${formatDemoTime(q.startsAt)}, a ${c.travelMinutes} min walk, ${priceText(q.priceMax)}.`;
  const friends = c.friendOverlap.filter((f) => friendIds.includes(f.friendId));
  if (friends.length > 0) {
    const shared = friends[0].sharedWithQuest[0];
    return `${first} You and ${joinNames(friends.map((f) => f.firstName))} both like ${shared}.`;
  }
  if (c.viewerInterests.length > 0) return `${first} It lines up with your interest in ${c.viewerInterests[0]}.`;
  return `${first} ${plural(c.seatsLeft, 'seat')} left.`;
}

export function bridgeText(c: PlanCandidate, friendIds: string[]): string | null {
  const f = c.friendOverlap.find((x) => friendIds.includes(x.friendId));
  if (f) return `${f.firstName}'s free till ${formatDemoTime(f.freeUntil)} and is into ${f.sharedWithQuest[0]} too.`;
  const m = c.friendMembers[0];
  if (m) return `${m.firstName} is already going.`;
  return null;
}

export function inviteText(c: PlanCandidate, friendIds: string[]): string | null {
  const names = c.friendOverlap.filter((f) => friendIds.includes(f.friendId)).map((f) => f.firstName);
  if (names.length === 0) return null;
  const q = c.quest;
  return `Hey ${joinNames(names)}! ${q.emoji} ${q.title} at ${q.venueName}, ${formatDemoTime(q.startsAt)}? ${plural(c.seatsLeft, 'seat')} left, want to come?`;
}

/** PlanSuggestion for a candidate with deterministic text. */
export function heuristicSuggestion(c: PlanCandidate, intent: MuseIntent): PlanSuggestion {
  const friendIds = invitedFriends(c, intent).map((f) => f.friendId);
  return {
    kind: 'join_quest',
    questId: c.questId,
    friendIds,
    title: c.quest.title,
    emoji: c.quest.emoji,
    reason: reasonText(c, friendIds),
    bridge: bridgeText(c, friendIds),
    startsAt: c.quest.startsAt,
    travelMinutes: c.travelMinutes,
    fitsWindow: true,
    seatsLeft: c.seatsLeft,
    inviteDraft: inviteText(c, friendIds),
  };
}

export function summaryText(suggestions: PlanSuggestion[], intent: MuseIntent, friendsFreeNames: string[]): string {
  const w = windowText(intent);
  if (suggestions.length === 0) {
    const friends = friendsFreeNames.length ? ` ${joinNames(friendsFreeNames.slice(0, 2))} ${friendsFreeNames.length === 1 ? 'is' : 'are'} free though.` : '';
    return `Nothing nearby fits your ${w} right now.${friends}`;
  }
  const top = suggestions[0];
  const withFriend = top.friendIds.length > 0 && top.bridge ? ` ${top.bridge}` : '';
  return `${plural(suggestions.length, 'plan')} ${suggestions.length === 1 ? 'fits' : 'fit'} your ${w}. Best bet: ${top.title}.${withFriend}`;
}

export const NOT_UNDERSTOOD_SUMMARY =
  'I couldn\'t tell what you\'re up for. Try something like "hungry, 30 min, under $15".';
