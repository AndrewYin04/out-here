// Prompt for step 3 (rankAndExplain, smart model). Only facts code already checked go in:
// short candidate ids, times, walk minutes, prices, seats, and interests people chose to share.
import type { MuseMessage } from '../client';

export type RankPromptCandidate = {
  id: string;
  title: string;
  venue: string;
  category: string;
  tags: string[];
  startsAt: string;
  startsInMin: number;
  walkMin: number;
  priceMax: number;
  seatsLeft: number;
  matches: string[];
  youLike: string[];
  friendsWhoCanCome: { id: string; name: string; freeUntil: string; likes: string[]; says?: string }[];
  friendsAlreadyGoing: string[];
};

export type RankPromptInput = {
  userName: string;
  text: string;
  windowLabel: string;
  budget: string;
  wantsFriends: boolean;
  openToNewPeople: boolean;
  vibe: string | null;
  candidates: RankPromptCandidate[];
};

/** Every reason must cite a fact from the candidate data; code replaces reasons that do not. */
export const REASON_FACT_RULE =
  'Every reason must cite at least one concrete fact from that candidate\'s data: a shared interest by name (from "matches", "youLike" or a friend\'s "likes"), a friend\'s free window ("freeUntil") or what they "say" in their status, the price ("priceMax"), or the walk minutes ("walkMin"). Quote numbers exactly as given. Never use generic phrases such as "fits your time best", "great option" or "perfect fit".';

export function rankPrompt(input: RankPromptInput): MuseMessage[] {
  return [
    {
      role: 'system',
      content: [
        'You are Muse inside Out Here, a live map of nearby plans. Pick the best 2-3 plans for the user from the candidate list and explain them.',
        'Every candidate already fits their time window (walking time included), budget and walking limit. Do not re-check or invent anything.',
        'Rules:',
        '- picks: best first, 1 to 3 items, each "candidate" must be an id from the list. Use fewer picks when fewer candidates exist.',
        '- When the user wants friends and a friend can come to a candidate, prefer that candidate and put the friend id(s) in "friends". Only use friend ids listed under that same candidate.',
        `- reason: 1-2 plain sentences on why this plan suits this user and this friend. ${REASON_FACT_RULE} No hype words, no emojis.`,
        '- bridge: one short line about a listed friend for that candidate ("Maya\'s free till 4:50 PM and likes dumplings too"), or null. Never mention anyone not listed for that candidate.',
        '- inviteDraft: a short casual text from the user to the chosen friend(s) with the plan, time and place; null when "friends" is empty.',
        '- summary: one sentence for the whole set.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: JSON.stringify({
        user: {
          name: input.userName, said: input.text, window: input.windowLabel, budget: input.budget,
          wantsFriends: input.wantsFriends, openToNewPeople: input.openToNewPeople, vibe: input.vibe,
        },
        candidates: input.candidates,
      }),
    },
  ];
}
