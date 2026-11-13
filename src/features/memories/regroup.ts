// "Get this group together again": the context Muse sees, the prompt, the strict schema, a
// deterministic mock, and the code check that keeps Muse to real quest ids. Pure logic (no store),
// so Vitest covers it; the route in src/app/api/muse/regroup builds the context from the store.
import { z } from 'zod';

export type RegroupMember = {
  id: string;
  firstName: string;
  interests: string[];
  /** Their active "I'm free" text and window, when the viewer may see it. */
  free: { text: string; startsAt: string; endsAt: string } | null;
  /** Their Find My status bubble, when they share it with the viewer. */
  bubble: string | null;
};

export type RegroupCandidate = {
  questId: string;
  title: string;
  emoji: string;
  venueName: string;
  startsAt: string;
  whenText: string;
  seatsLeft: number;
  priceMax: number;
  tags: string[];
  /** Crew prefs and shared interests this quest matches, computed by code. */
  matches: string[];
};

export type RegroupContext = {
  crewId: string;
  crewName: string;
  originTitle: string | null;
  lastHangoutText: string;
  viewerFirstName: string;
  sharedPrefs: string[];
  /** Interests at least two members list. */
  sharedInterests: string[];
  members: RegroupMember[];
  candidates: RegroupCandidate[];
  /** Positive chips from hangouts the viewer rated "Loved it", most picked first. */
  likedBefore?: string[];
};

export type RegroupSuggestion = { questId: string | null; title: string; whenText: string; reason: string };
export type RegroupResult = { suggestion: RegroupSuggestion; message: string };

export const RegroupZ = z.object({
  suggestion: z.object({
    questId: z.string().nullable(),
    title: z.string().trim().min(1).max(120),
    whenText: z.string().trim().min(1).max(80),
    reason: z.string().trim().min(1).max(400),
  }),
  message: z.string().trim().min(1).max(500),
});

export const REGROUP_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['suggestion', 'message'],
  properties: {
    suggestion: {
      type: 'object',
      additionalProperties: false,
      required: ['questId', 'title', 'whenText', 'reason'],
      properties: {
        questId: { type: ['string', 'null'] },
        title: { type: 'string' },
        whenText: { type: 'string' },
        reason: { type: 'string' },
      },
    },
    message: { type: 'string' },
  },
};

const norm = (s: string) => s.trim().toLowerCase();

/** Interests listed by at least two of the people given, most common first. */
export function commonInterests(lists: string[][]): string[] {
  const count = new Map<string, { label: string; n: number }>();
  for (const list of lists) {
    for (const label of new Set(list.map((x) => x.trim()).filter(Boolean))) {
      const k = norm(label);
      const cur = count.get(k);
      if (cur) cur.n++;
      else count.set(k, { label, n: 1 });
    }
  }
  return [...count.values()].filter((x) => x.n >= 2).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label)).map((x) => x.label);
}

/** Which of the crew's prefs and shared interests a quest's title, category and tags match. */
export function questMatches(q: { title: string; category: string; tags: string[] }, wanted: string[]): string[] {
  const hay = [q.title, q.category, ...q.tags].map(norm).join(' ');
  return wanted.filter((w) => {
    const words = norm(w).split(/[\s/,+-]+/).filter((x) => x.length >= 3);
    return words.some((word) => hay.includes(word.replace(/s$/, '')));
  });
}

export function regroupMessages(ctx: RegroupContext): { role: 'system' | 'user'; content: string }[] {
  const system = [
    'You are Muse, the planning assistant inside Facebook\'s Out Here tab.',
    'A crew of friends hung out before. Propose ONE next hangout that gets them together again.',
    'Rules:',
    '- questId must be one of the candidate questIds given, or null if none fits (then suggest a simple plan at a place named in the data).',
    '- Never invent people, quests, venues, prices or times. Use only the data given.',
    '- reason: 1-2 sentences that cite concrete shared facts from the data: a shared pref or interest, and someone\'s free window or status bubble when present. Use first names only.',
    '- whenText: short, like "today 5:30 PM" or "this weekend", taken from the candidate whenText or a member\'s free window.',
    '- message: a casual 1-2 sentence text from the viewer to the crew, inviting them. No hashtags.',
    '- likedBefore lists what the viewer enjoyed at past hangouts they loved. Prefer a candidate that fits it, and you may say so ("you liked the food last time").',
  ].join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: JSON.stringify({
      viewer: ctx.viewerFirstName,
      likedBefore: ctx.likedBefore ?? [],
      crew: { name: ctx.crewName, lastHangout: ctx.originTitle, lastHangoutWhen: ctx.lastHangoutText, sharedPrefs: ctx.sharedPrefs, sharedInterests: ctx.sharedInterests },
      members: ctx.members.map((m) => ({ firstName: m.firstName, interests: m.interests.slice(0, 6), free: m.free?.text ?? null, bubble: m.bubble })),
      candidates: ctx.candidates.map((c) => ({
        questId: c.questId, title: c.title, venue: c.venueName, whenText: c.whenText, seatsLeft: c.seatsLeft, priceMax: c.priceMax, matches: c.matches,
      })),
    }) },
  ];
}

/** Deterministic stand-in used in mock mode (and by tests). */
export function mockRegroup(ctx: RegroupContext): RegroupResult {
  const best = [...ctx.candidates].sort((a, b) => b.matches.length - a.matches.length || a.startsAt.localeCompare(b.startsAt))[0];
  const freeMember = ctx.members.find((m) => m.free) ?? null;
  const bubbleMember = ctx.members.find((m) => m.bubble) ?? null;
  const shared = best?.matches[0] ?? ctx.sharedPrefs[0] ?? ctx.sharedInterests[0] ?? null;
  const parts: string[] = [];
  const crewLabel = /crew$/i.test(ctx.crewName) ? ctx.crewName : `${ctx.crewName} crew`;
  if (shared) parts.push(`The ${crewLabel} bonded over ${shared.toLowerCase()} last time`);
  if (freeMember) parts.push(`${freeMember.firstName} is "${freeMember.free!.text}"`);
  else if (bubbleMember) parts.push(`${bubbleMember.firstName}'s status says "${bubbleMember.bubble}"`);
  if (best) parts.push(`${best.title} has ${best.seatsLeft} ${best.seatsLeft === 1 ? 'seat' : 'seats'} left`);
  const reason = `[mock] ${parts.join('; ') || 'You hung out recently and nothing is planned yet'}.`;
  const title = best ? `${best.emoji} ${best.title}` : `${ctx.originTitle ?? 'Hang out'} again`;
  const whenText = best?.whenText ?? (freeMember ? 'when everyone is free' : 'this weekend');
  return {
    suggestion: { questId: best?.questId ?? null, title, whenText, reason },
    message: best
      ? `${ctx.crewName} reunion? ${best.title} at ${best.venueName}, ${best.whenText}. Who's in?`
      : `${ctx.crewName} reunion? Same crew, ${whenText}. Who's in?`,
  };
}

export class RegroupValidationError extends Error {}

/** Keeps Muse to real data: the quest id must be a candidate, and seat-free text stays as written. */
export function validateRegroup(out: RegroupResult, ctx: RegroupContext): RegroupResult {
  const { questId } = out.suggestion;
  if (questId !== null && !ctx.candidates.some((c) => c.questId === questId)) {
    throw new RegroupValidationError(`unknown questId ${questId}`);
  }
  return out;
}

/** Crew members who would still need a seat on this quest (the ones not already on it). */
export function seatsNeeded(crewMemberIds: string[], questMemberIds: string[]): number {
  const on = new Set(questMemberIds);
  return crewMemberIds.filter((id) => !on.has(id)).length;
}

/** True when the whole crew fits: every member not already on the quest can take a seat. */
export function crewFits(seatsLeft: number, crewMemberIds: string[], questMemberIds: string[]): boolean {
  return seatsLeft >= seatsNeeded(crewMemberIds, questMemberIds);
}

/** Drops a leading emoji (and the space after it) so surfaces that add the quest emoji do not show it twice. */
export function stripLeadingEmoji(title: string): string {
  return title.replace(/^(?:\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}\u200d\ufe0f])+\s*/u, '').trim() || title;
}
