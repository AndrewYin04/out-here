// Prompt for "Want to hang?" on a Find My friend card. Code has already picked the quest or place
// from the friend's bubble, free window and walking times; Muse only writes the reason (shown to
// the sender) and the invite draft (sent to the friend), from these checked facts.
import type { MuseMessage } from '../client';

export type HangPromptInput = {
  senderName: string;
  friendName: string;
  /** The friend's status bubble, as they wrote it. */
  friendSays: { thought: string | null; doing: string | null; wantsTo: string | null };
  friendFreeNote: string | null;
  friendFreeUntil: string | null;
  /** The bubble words the pick matched, or null when it is only near and soon. */
  matched: string | null;
  kind: 'quest' | 'place';
  title: string;
  venue: string;
  /** "at 10:32 AM", "now", or null for a place (meet now). */
  when: string | null;
  senderWalkMin: number;
  friendWalkMin: number;
  seatsLeft: number | null;
};

export const HANG_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reason', 'draft'],
  properties: {
    reason: { type: 'string' },
    draft: { type: 'string' },
  },
} as const;

export function hangPrompt(input: HangPromptInput): MuseMessage[] {
  return [
    {
      role: 'system',
      content: [
        'You are Muse inside Facebook\'s Out Here map. The sender tapped "Want to hang?" on a friend\'s live location.',
        'Code already picked the plan. Write two strings, using only the facts in the user message:',
        '- "reason": one sentence (max 140 characters) for the sender saying why this plan fits the friend right now. Quote the friend\'s own words from "matched" when it is not null.',
        '- "draft": the invite the sender will send, first person, casual, addressed to the friend by first name, max 2 sentences and 200 characters. Name the venue exactly as given and the time ("when") when it is not null, and give the friend\'s walk minutes. Mention seats left when given.',
        'Quote every number exactly as given. Never invent people, prices, times, places or plans. No hashtags, no emoji, no exclamation marks in a row.',
        'Reply with JSON only: {"reason": string, "draft": string}.',
      ].join('\n'),
    },
    { role: 'user', content: JSON.stringify(input) },
  ];
}
