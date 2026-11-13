// Prompts for Marketplace pickup on the map (fast model).
// 1. wantMessages: "I need a desk chair under $40, ideally within a 15-minute drive" -> item,
//    keywords, max price, max drive minutes. Code checks and clamps the numbers.
// 2. findLineMessages: one line telling the buyer why a listing code already matched is worth a
//    look. Only the facts given; code replaces a line that cites anything else.
import type { MuseMessage } from '../client';

export function wantMessages(text: string): MuseMessage[] {
  return [
    {
      role: 'system',
      content: [
        'You are Muse inside Facebook Marketplace. A young adult tells you something they want to buy nearby.',
        'Return JSON:',
        '- item: the thing they want in 1-3 plain words, lowercase ("desk chair").',
        '- keywords: 2-5 lowercase words or short phrases a listing title for that item would use, including the item and close synonyms ("desk chair", "office chair", "chair"). No colors, prices or places.',
        '- maxPrice: the most they will pay in US dollars, or null if they did not say.',
        '- maxDriveMin: the longest drive in minutes they mentioned, or null if they did not say.',
        'Never invent a price or a distance.',
      ].join('\n'),
    },
    { role: 'user', content: text },
  ];
}

export type FindLineFacts = {
  title: string;
  price: string;
  budget: string | null;
  driveMin: number;
  maxDriveMin: number | null;
  availableUntil: string;
  listedMinAgo: number;
  sellerFirstName: string;
  /** The watch the user set ("track jacket under $25"); null for a Reel find. */
  wanted: string | null;
  via: 'want' | 'reel';
  /** The pop-up sale the item is part of, or null. */
  sale: string | null;
  reelTitle: string | null;
  /** What in the Reel it is like ("the shoulder bag"). */
  reelLook: string | null;
};

export function findLineMessages(f: FindLineFacts): MuseMessage[] {
  if (f.sale || f.via === 'reel') return saleLineMessages(f);
  return [
    {
      role: 'system',
      content: [
        'You are Muse, a friendly assistant inside Facebook. Earlier the user told you what they wanted; a nearby listing now matches.',
        'Write one or two short sentences (under 30 words) telling them about it, like a friend would.',
        'Use only these facts: the item title, the price, the drive time in minutes, when the seller is available until, how recently it was listed.',
        'Write numbers exactly as given ("$35", "12-minute drive", "until 5:00 PM"). Do not mention anything else: no condition, no colors, no other people, no promises.',
        'No emojis, no hype words.',
        'Example: "That $35 desk chair was just listed. It\'s a 12-minute drive, and the seller is around until 5:00 PM."',
      ].join('\n'),
    },
    { role: 'user', content: JSON.stringify(f) },
  ];
}

/** A pop-up sale or a Reel find: name the sale and the real reason (the watch, or the Reel). */
function saleLineMessages(f: FindLineFacts): MuseMessage[] {
  const why = f.via === 'reel'
    ? 'The reason: it is like something in a Reel they watched (reelTitle, reelLook). Say "like <reelLook> in the Reel you watched".'
    : 'The reason: it fits the watch they set with you earlier (wanted). Say "It fits the watch you set".';
  const example = f.via === 'reel'
    ? '"There’s a $18 Y2K denim purse at the Campus Thrift Pop-Up, like the shoulder bag in the Reel you watched."'
    : '"There’s a $20 track jacket at the Campus Thrift Pop-Up. It fits the watch you set."';
  return [
    {
      role: 'system',
      content: [
        'You are Muse, a friendly assistant inside Facebook. A nearby pop-up sale just went live and one item matches this person.',
        'Write one or two short sentences (under 30 words), like a friend would.',
        'Use only these facts: the item title, the price, the sale name, and the reason.',
        why,
        'Write the price exactly as given. Do not mention anything else: no condition, colors, sizes, times, distances, other people or promises.',
        'No emojis, no hype words.',
        `Example: ${example}`,
      ].join('\n'),
    },
    {
      role: 'user',
      content: JSON.stringify({
        title: f.title, price: f.price, sale: f.sale, budget: f.budget,
        ...(f.via === 'reel' ? { reelTitle: f.reelTitle, reelLook: f.reelLook } : { wanted: f.wanted }),
      }),
    },
  ];
}
