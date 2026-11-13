import type { ChatMessage } from './controller';
import type { AgentEncounter } from './encounter';
import type { MuseState } from './state';
import type { PlanStageEvent } from '@/shared';
import type { PlanResponse } from '@/features/outhere/plan-api';
import { museSteps } from '@/features/outhere';

/** Longest line a thought cloud shows; longer Muse text is cut at a word with an ellipsis. */
export const THOUGHT_MAX = 110;

/**
 * What a thought is about, so the map can point at it: you, the friends who are free, the plans
 * Muse checked (lit = still in the running, dimmed = dropped, with the short reason), or one plan.
 */
export type ThoughtFocus =
  | { kind: 'me' }
  | { kind: 'friends'; ids: string[] }
  | { kind: 'checked'; lit: string[]; dropped: { id: string; label: string }[]; friends?: string[] }
  | { kind: 'quest'; id: string; friendIds: string[] }
  | { kind: 'encounter'; friendId: string };
export type Thought = { text: string; focus: ThoughtFocus | null };

/** Short labels for a dropped plan's tag on the map (the long reasons live in "Why not others?"). */
const DROP_LABEL: Record<string, string> = { walk: 'too far', budget: 'over budget', window: 'wrong time', late: 'wrong time', full: 'full' };

function clip(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= THOUGHT_MAX) return t;
  const cut = t.slice(0, THOUGHT_MAX - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > 60 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * Muse's running commentary: the thoughts Jolly shows one after another, in order, each with what
 * it is about. Every line comes from something that actually happened (an agent message, the plan
 * response, and Muse's own reason and bridge text). It never invents stages, people, times or
 * agreement, and a recap from before your latest message is never replayed.
 */
export function companionThoughts(state: MuseState, encounter: AgentEncounter | null, last: ChatMessage | undefined, freshReply: boolean): Thought[] {
  if (encounter) {
    const who = encounter.recipient.name.split(' ')[0];
    const focus: ThoughtFocus = { kind: 'encounter', friendId: encounter.recipient.id };
    const t = (text: string): Thought => ({ text, focus });
    if (encounter.outcome === 'cancelled') return [];
    if (encounter.outcome === 'error') return [t('The request did not finish. You can try again.')];
    if (encounter.outcome === 'unavailable' || encounter.outcome === 'no_response') return [t(`${who}’s Muse didn’t confirm a time`), t('No plan was confirmed.')];
    const lines = [t(`Asking ${who}’s Muse`)];
    if (encounter.sent > 0) lines.push(t('Message sent'));
    if (encounter.received > 0) lines.push(t(`${who}’s Muse replied`));
    if (encounter.outcome === 'success') lines.push(t(`${who}’s Muse’s answer is in the chat`));
    return lines;
  }
  if (state === 'thinking' || state === 'sending' || state === 'receiving') return [{ text: 'Working on your request', focus: { kind: 'me' } }];
  if (state === 'evaluating') return [{ text: 'Looking at your photo', focus: null }];
  if (state === 'error' || !freshReply || last?.role !== 'muse' || !last.plan?.intent || !last.plan.meta) return [];

  const plan = last.plan;
  if (plan.meta.coordination) {
    // A friend's Muse answered: its finding (the evidence line) and the next step, nothing parsed.
    const top = plan.suggestions?.[0];
    if (!top) return [];
    const focus: ThoughtFocus | null = top.questId ? { kind: 'quest', id: top.questId, friendIds: top.friendIds ?? [] } : top.friendIds?.length ? { kind: 'friends', ids: top.friendIds } : null;
    return [top.reason, `${top.emoji} ${top.title}`, 'They still need to say yes'].filter(Boolean).map((text) => ({ text: clip(text), focus }));
  }
  const steps = museSteps(plan, last.source);
  if (plan.meta.understood === false) return steps.map((s) => ({ text: clip(s.text), focus: { kind: 'me' } }));
  const picks = (plan.suggestions ?? []).filter((s) => s.questId);
  const pickIds = picks.map((s) => s.questId!) ;
  const freeIds = (plan.meta.friendsFree ?? []).flatMap((f) => (f.friendId ? [f.friendId] : []));
  const dropped = (plan.meta.dropped ?? []).flatMap((d) => (DROP_LABEL[d.reason] ? [{ id: d.questId, label: DROP_LABEL[d.reason] }] : []));
  // What it understood, who is free, what it checked; then the pick in its own words.
  const lines: Thought[] = [];
  for (const s of steps) {
    if (s.key === 'intent') lines.push({ text: s.text, focus: { kind: 'me' } });
    else if (s.key === 'friends') lines.push({ text: s.text, focus: freeIds.length ? { kind: 'friends', ids: freeIds } : { kind: 'me' } });
    else if (s.key === 'plans') lines.push({ text: s.text, focus: { kind: 'checked', lit: pickIds, dropped } });
  }
  const top = plan.suggestions?.[0];
  if (top) {
    const focus: ThoughtFocus | null = top.questId ? { kind: 'quest', id: top.questId, friendIds: top.friendIds ?? [] } : top.friendIds?.length ? { kind: 'friends', ids: top.friendIds } : null;
    const facts = [`${top.travelMinutes} min walk`];
    if (top.seatsLeft !== null) facts.push(`${top.seatsLeft} seat${top.seatsLeft === 1 ? '' : 's'} left`);
    lines.push({ text: `${top.emoji} ${top.title}: ${facts.join(' · ')}`, focus });
    if (top.reason) lines.push({ text: top.reason, focus });
    if (top.bridge) lines.push({ text: top.bridge, focus });
    const more = plan.suggestions.length - 1;
    if (more > 0) lines.push({ text: `${more} more idea${more === 1 ? '' : 's'} for you`, focus: { kind: 'checked', lit: pickIds, dropped: [] } });
  } else {
    const rank = steps.find((s) => s.key === 'rank');
    if (rank) lines.push({ text: rank.text, focus: { kind: 'me' } });
  }
  return lines.map((l) => ({ ...l, text: clip(l.text) })).filter((l) => l.text);
}

/** How long one thought stays up: long enough to read it (about 15 characters a second). */
export function thoughtDwellMs(text: string): number {
  return Math.min(6500, Math.max(2600, 1400 + text.length * 65));
}

const MODEL = (m: string) => /ember/i.test(m) ? 'Ember' : /spark/i.test(m) ? 'Spark' : /wonder/i.test(m) ? 'Wonder' : m === 'heuristic' ? 'code' : m === 'mock' ? 'offline' : m;

/**
 * While an "I'm free" run is still going: one thought for the stage the server last reported, so
 * Jolly says what Muse is actually on. The stage order is fixed, so "next" is never a guess about
 * what happened, only about what the pipeline does next.
 */
export function stageThought(stages: PlanStageEvent[]): Thought {
  const last = stages.at(-1);
  const parse = stages.find((s) => s.stage === 'parse');
  if (!last || last.stage === 'context') return { text: 'Reading what you asked', focus: { kind: 'me' } };
  if (last.stage === 'parse') {
    if (!last.understood) return { text: 'I couldn’t tell what you’re up for', focus: { kind: 'me' } };
    const intent = museSteps({ intent: last.intent, suggestions: [], summary: '', meta: { dropped: [] } } as unknown as PlanResponse, 'muse')[0]?.text ?? 'Got it';
    return { text: `${intent} · checking who’s free`, focus: { kind: 'me' } };
  }
  if (last.stage === 'candidates') {
    const plans = museSteps({ intent: parse?.stage === 'parse' ? parse.intent : {}, suggestions: [], summary: '',
      meta: { dropped: last.dropped, candidateCount: last.fit, understood: true } } as unknown as PlanResponse, 'muse')
      .find((x) => x.key === 'plans')?.text ?? `${last.fit} fit`;
    const dropped = last.dropped.flatMap((d) => (DROP_LABEL[d.reason] ? [{ id: d.questId, label: DROP_LABEL[d.reason] }] : []));
    return { text: last.fit > 0 ? `${plans} · ranking them` : plans, focus: { kind: 'checked', lit: [], dropped, friends: last.friendsFree.map((f) => f.friendId) } };
  }
  if (last.stage === 'rank') {
    const by = MODEL(last.model);
    const how = by === 'offline' ? 'offline' : by === 'code' ? 'by time and distance' : `with ${by}`;
    return { text: `Ranked ${last.picks} ${how} · double-checking the facts`, focus: { kind: 'me' } };
  }
  return { text: `Kept ${last.kept} after checking walks, times and seats`, focus: { kind: 'me' } };
}
