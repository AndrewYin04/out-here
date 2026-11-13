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
  /** Set when it is a short walk: say the walk, not the drive. */
  walkMin: number | null;
  maxDriveMin: number | null;
  availableUntil: string;
  listedMinAgo: number;
  sellerFirstName: string;
  wanted: string;
};

export function findLineMessages(f: FindLineFacts): MuseMessage[] {
  return [
    {
      role: 'system',
      content: [
        'You are Muse, a friendly assistant inside Facebook. Earlier the user told you what they wanted; a nearby listing now matches.',
        'Write one or two short sentences (under 30 words) telling them about it, like a friend would.',
        'Use only these facts: the item title, the price, the trip time in minutes, when the seller is available until, how recently it was listed.',
        'The trip: when walkMin is a number it is walkable, so say "a N-minute walk" with walkMin; otherwise say "a N-minute drive" with driveMin.',
        'Write numbers exactly as given ("$35", "12-minute drive", "until 5:00 PM"). Do not mention anything else: no condition, no colors, no other people, no promises.',
        'No emojis, no hype words.',
        'Example: "That $35 desk chair was just listed. It\'s a 12-minute drive, and the seller is around until 5:00 PM."',
      ].join('\n'),
    },
    { role: 'user', content: JSON.stringify(f) },
  ];
}
