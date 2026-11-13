// Prompts for Muse's Marketplace picks from what someone watches.
// 1. tasteMessages (fast model): the videos they watched (title, topics, minutes) -> up to 4
//    things they are into, each naming the videos that show it. Code checks every video key.
// 2. pickMessages (fast model; Spark timed out on 30 listings, see docs/DECISIONS.md): those topics + nearby listings -> only the listings that fit a
//    topic, each with one plain reason. Code checks ids, topics and every number in the reason.
import type { MuseMessage } from '../client';

export type TastePromptInput = {
  watched: { key: string; title: string; topics: string[]; minutes: number; justNow: boolean }[];
  interests: string[];
};

export function tasteMessages(input: TastePromptInput): MuseMessage[] {
  return [
    {
      role: 'system',
      content: [
        'You are Muse inside Facebook. From the videos a person watched this week, say what they are really into.',
        'Return JSON "topics": up to 4 items, strongest first. Each item:',
        '- name: 1-3 lowercase words, the interest itself ("comics", "local music", "film photography"). Merge close videos into one topic.',
        '- why: one short plain sentence about what they watched, no numbers.',
        '- evidence: the keys of the videos that show this interest, only keys from the list.',
        'Skip anything they barely watched (a minute or less), unless justNow is true: something they watched just now counts. Never invent videos or interests.',
      ].join('\n'),
    },
    { role: 'user', content: JSON.stringify(input) },
  ];
}

export type PickPromptInput = {
  topics: { name: string; minutes: number; justWatched: boolean; videos: { title: string; minutes: number }[] }[];
  candidates: { id: string; title: string; category: string; description: string; price: string; openHouse: string | null }[];
};

export function pickMessages(input: PickPromptInput): MuseMessage[] {
  return [
    {
      role: 'system',
      content: [
        'You are Muse inside Facebook Marketplace. Show this person only the listings that fit what they watch.',
        'Return JSON "picks": 0 to 5 items, best first. Each item:',
        '- candidate: a listing id from the list.',
        '- topic: the topic name it fits, exactly as given.',
        '- reason: one or two short sentences a friend would say, linking what they watched to the item. If justWatched is true, say they just watched it (no minutes). You may quote a video title, the minutes watched for that topic, the price, and the open house if there is one, exactly as given. No other numbers, no hype words, no emojis.',
        'Only pick a listing if someone into that topic would clearly want it. Skip everything else, even if it is cheap or popular. It is fine to return few picks.',
      ].join('\n'),
    },
    { role: 'user', content: JSON.stringify(input) },
  ];
}
