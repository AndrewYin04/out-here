import type { AgentEncounter, ChatMessage, MuseState } from '@/features/muse-companion';
import { museSteps } from '@/features/outhere';

/** Longest line a thought cloud shows; longer Muse text is cut at a word with an ellipsis. */
export const THOUGHT_MAX = 110;

function clip(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= THOUGHT_MAX) return t;
  const cut = t.slice(0, THOUGHT_MAX - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > 60 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * Muse's running commentary: the thoughts Jolly shows one after another, in order.
 * Every line comes from something that actually happened (an agent message, the plan response, and
 * Muse's own reason and bridge text). It never invents stages, people, times or agreement, and a
 * recap from before your latest message is never replayed.
 */
export function companionThoughts(state: MuseState, encounter: AgentEncounter | null, last: ChatMessage | undefined, freshReply: boolean): string[] {
  if (encounter) {
    const who = encounter.recipient.name.split(' ')[0];
    if (encounter.outcome === 'cancelled') return [];
    if (encounter.outcome === 'error') return ['The request did not finish. You can try again.'];
    if (encounter.outcome === 'unavailable' || encounter.outcome === 'no_response') return [`${who}’s Muse didn’t confirm a time`, 'No plan was confirmed.'];
    const lines = [`Asking ${who}’s Muse`];
    if (encounter.sent > 0) lines.push('Message sent');
    if (encounter.received > 0) lines.push(`${who}’s Muse replied`);
    if (encounter.outcome === 'success') lines.push(`${who}’s Muse’s answer is in the chat`);
    return lines;
  }
  if (state === 'thinking' || state === 'sending' || state === 'receiving') return ['Working on your request'];
  if (state === 'evaluating') return ['Looking at your photo'];
  if (state === 'error' || !freshReply || last?.role !== 'muse' || !last.plan?.intent || !last.plan.meta) return [];

  const plan = last.plan;
  const steps = museSteps(plan, last.source);
  if (plan.meta.understood === false) return steps.map((s) => clip(s.text));
  // What it understood, who is free, what it checked; then the pick in its own words.
  const lines = steps.filter((s) => s.key !== 'rank').map((s) => s.text);
  const top = plan.suggestions?.[0];
  if (top) {
    const facts = [`${top.travelMinutes} min walk`];
    if (top.seatsLeft !== null) facts.push(`${top.seatsLeft} seat${top.seatsLeft === 1 ? '' : 's'} left`);
    lines.push(`${top.emoji} ${top.title}: ${facts.join(' · ')}`);
    if (top.reason) lines.push(top.reason);
    if (top.bridge) lines.push(top.bridge);
    const more = plan.suggestions.length - 1;
    if (more > 0) lines.push(`${more} more idea${more === 1 ? '' : 's'} in the chat`);
  } else {
    const rank = steps.find((s) => s.key === 'rank');
    if (rank) lines.push(rank.text);
  }
  return lines.map(clip).filter(Boolean);
}

/** How long one thought stays up: long enough to read it (about 15 characters a second). */
export function thoughtDwellMs(text: string): number {
  return Math.min(6500, Math.max(2600, 1400 + text.length * 65));
}
