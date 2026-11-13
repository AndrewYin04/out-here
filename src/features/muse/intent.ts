// Step 1: free text + now -> MuseIntent. The fast model (Ember, effort "minimal") fills
// RawIntent; code resolves its time fields against now in DEMO_TZ. Mock mode fills the same
// RawIntent with regexes, so both paths share resolveWindow.
import { z } from 'zod';
import type { MuseIntent, Profile } from '../../shared';
import { museJSON, reportFallback } from './client';
import { parsePrompt } from './prompts/parse';
import { localLabel, resolveWindow, type TimeExpression } from './time';

const PARTS = ['now', 'afternoon', 'evening', 'tonight'] as const;
const clockZ = z.string().regex(/^\d{1,2}:\d{2}$/).nullable();

export const RawIntentZ = z.object({
  understood: z.boolean(),
  activities: z.array(z.string()),
  budgetMax: z.number().min(0).nullable(),
  durationMinutes: z.number().min(0).nullable(),
  startsInMinutes: z.number().min(0).nullable(),
  startClock: clockZ,
  endClock: clockZ,
  // Free string on the wire (no enum in the strict schema); unknown values read as null.
  partOfDay: z.string().nullable().transform((v): (typeof PARTS)[number] | null => {
    const t = v?.trim().toLowerCase() ?? '';
    return (PARTS as readonly string[]).includes(t) ? (t as (typeof PARTS)[number]) : null;
  }),
  maxWalkMinutes: z.number().min(0).nullable(),
  wantsFriends: z.boolean(),
  openToNewPeople: z.boolean(),
  vibe: z.string().nullable(),
});
export type RawIntent = z.output<typeof RawIntentZ>;

const num = { type: ['number', 'null'] };
const str = { type: ['string', 'null'] };
export const RAW_INTENT_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    understood: { type: 'boolean' },
    activities: { type: 'array', items: { type: 'string' } },
    budgetMax: num,
    durationMinutes: num,
    startsInMinutes: num,
    startClock: str,
    endClock: str,
    // No enum here: enum-with-null under strict mode is unverified on Muse (docs/muse-api.md).
    partOfDay: str,
    maxWalkMinutes: num,
    wantsFriends: { type: 'boolean' },
    openToNewPeople: { type: 'boolean' },
    vibe: str,
  },
  required: [
    'understood', 'activities', 'budgetMax', 'durationMinutes', 'startsInMinutes', 'startClock',
    'endClock', 'partOfDay', 'maxWalkMinutes', 'wantsFriends', 'openToNewPeople', 'vibe',
  ],
};

export type ParsedIntent = {
  intent: MuseIntent;
  understood: boolean;
  /** Model id, "mock", or "heuristic" when the live call failed and code parsed the text. */
  model: string;
  latencyMs: number;
  /** Why the live call failed (only when model is "heuristic"). */
  error: string | null;
};

/** RawIntent -> MuseIntent with the window resolved against `now`. */
export function toMuseIntent(raw: RawIntent, now: Date): MuseIntent {
  const time: TimeExpression = {
    durationMinutes: raw.durationMinutes,
    startsInMinutes: raw.startsInMinutes,
    startClock: raw.startClock,
    endClock: raw.endClock,
    partOfDay: raw.partOfDay,
  };
  const { windowStart, windowEnd } = resolveWindow(time, now);
  const activities = [...new Set(raw.activities.map((a) => a.trim().toLowerCase()).filter(Boolean))];
  return {
    activities,
    budgetMax: raw.budgetMax,
    windowStart,
    windowEnd,
    maxWalkMinutes: raw.maxWalkMinutes,
    wantsFriends: raw.wantsFriends,
    openToNewPeople: raw.openToNewPeople,
    vibe: raw.vibe,
  };
}

export async function parseIntent(
  text: string,
  now: Date,
  viewer: Pick<Profile, 'id' | 'interests'> | null,
  opts: { route?: string; deadline?: number; timeoutMs?: number } = {},
): Promise<ParsedIntent> {
  const started = Date.now();
  let res: { data: RawIntent; model: string; latencyMs: number };
  let error: string | null = null;
  try {
    res = await callParse(text, now, viewer, opts);
  } catch (err) {
    // live model failed: the heuristic parse keeps the plan working, and the fallback is reported
    error = String((err as Error)?.message ?? err).slice(0, 200);
    reportFallback({ route: opts.route ?? 'muse/plan', step: 'intent', error, userId: viewer?.id ?? null });
    res = { data: mockParse(text, now), model: 'heuristic', latencyMs: Date.now() - started };
  }
  return { intent: toMuseIntent(res.data, now), understood: res.data.understood, model: res.model, latencyMs: res.latencyMs, error };
}

function callParse(
  text: string,
  now: Date,
  viewer: Pick<Profile, 'id' | 'interests'> | null,
  opts: { route?: string; deadline?: number; timeoutMs?: number },
) {
  return museJSON({
    schemaName: 'intent',
    schema: RawIntentZ,
    jsonSchema: RAW_INTENT_JSON_SCHEMA,
    messages: parsePrompt({ text, nowLabel: localLabel(now) }),
    model: 'fast',
    effort: 'minimal',
    mock: () => mockParse(text, now),
    route: opts.route ?? 'muse/plan',
    userId: viewer?.id ?? null,
    deadline: opts.deadline,
    timeoutMs: opts.timeoutMs,
  });
}

// ---------- mock parse (deterministic heuristics) ----------

const ACTIVITY_RULES: [RegExp, string[]][] = [
  [/\b(hungry|starving|eat|eating|food|lunch|dinner|brunch|breakfast|snack|bite|munch)\b/, ['food']],
  [/\bdumplings?\b/, ['food', 'dumplings']],
  [/\bramen\b/, ['food', 'ramen']],
  [/\bpho\b/, ['food', 'pho']],
  [/\bnoodles?\b/, ['food', 'noodles']],
  [/\btacos?\b/, ['food', 'tacos']],
  [/\bsushi\b/, ['food', 'sushi']],
  [/\bk-?food|korean\b/, ['food', 'k-food']],
  [/\bboba\b/, ['boba']],
  [/\b(music|bands?|show|shows|concert|gig|live music)\b/, ['music']],
  [/\b(climb\w*|boulder\w*)\b/, ['climbing']],
  [/\bvolleyball\b/, ['volleyball']],
  [/\bboard ?games?\b/, ['board games']],
  [/\b(video games?|gaming|smash)\b/, ['games']],
  [/\b(thrift\w*|vintage|closet sales?|clothing swaps?|flea markets?|denim|secondhand|try[- ]?ons?)\b/, ['thrifting']],
  [/\b(study|studying|focus|homework)\b/, ['study']],
  [/\b(art|gallery|sketch\w*|museum)\b/, ['art']],
  [/\b(outside|outdoors?|hike|hiking|sunset|walk)\b/, ['outdoors']],
  [/\b(run|running|jog\w*|5k)\b/, ['running']],
  [/\b(film|photo\w*)\b/, ['film photography']],
];

const SOCIAL_WORDS = /\b(free|bored|hang|hangout|people|anything|something|plans?|down|meet|friends?|rn|tonight|today|later)\b/;

function clockFrom(h: string, m: string | undefined, ampm: string | undefined): string | null {
  let hour = Number(h);
  const minute = m ? Number(m) : 0;
  if (!Number.isFinite(hour) || hour > 23 || minute > 59) return null;
  if (ampm === 'pm' && hour < 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function mockParse(input: string, now: Date): RawIntent {
  void now;
  let text = ` ${input.toLowerCase().replace(/\s+/g, ' ')} `;
  const take = (re: RegExp): RegExpExecArray | null => {
    const m = re.exec(text);
    if (m) text = text.replace(m[0], ' ');
    return m;
  };
  let recognized = false;

  // walking limit first, so "ok walking 30 min" is not read as a 30 min window
  let maxWalkMinutes: number | null = null;
  const walk = take(/\bwalk(?:ing)?\s*(?:up to|like|about|max|under)?\s*(\d+)\s*(?:min|mins|minutes)?\b/) ??
    take(/\b(\d+)\s*(?:min|mins|minute|minutes)\s*walk\b/);
  if (walk) { maxWalkMinutes = Number(walk[1]); recognized = true; }
  if (take(/\bnothing far\b|\bclose by\b|\bnearby\b/)) { maxWalkMinutes ??= 10; recognized = true; }

  let budgetMax: number | null = null;
  const money = take(/\$\s?(\d+)/) ?? take(/\bunder (\d+)\b/) ?? take(/\b(\d+)\s*(?:bucks|dollars)\b/);
  if (money) { budgetMax = Number(money[1]); recognized = true; }
  if (budgetMax === null && /\b(something|anything|stuff|things?) free\b|\bfor free\b|\bno money\b|\bbroke\b/.test(text)) {
    budgetMax = 0; recognized = true;
  }
  if (budgetMax === null && /\bcheap\b/.test(text)) { budgetMax = 15; recognized = true; }

  let startsInMinutes: number | null = null;
  let startClock: string | null = null;
  let endClock: string | null = null;
  let durationMinutes: number | null = null;
  let partOfDay: RawIntent['partOfDay'] = null;

  const inMin = take(/\bin (\d+)\s*(?:min|mins|minutes)\b/);
  if (inMin) { startsInMinutes = Number(inMin[1]); recognized = true; }
  if (take(/\bafter class\b/)) { startsInMinutes = 60; recognized = true; }
  if (take(/\bafter work\b/)) { startClock = '17:00'; recognized = true; }
  const before = take(/\b(?:before|by)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  if (before) { endClock = clockFrom(before[1], before[2], before[3]); recognized = true; }
  const until = take(/\b(?:till|til|until|to)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  if (until) { endClock = clockFrom(until[1], until[2], until[3]); recognized = true; }
  const after = take(/\bafter\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  if (after) { startClock = clockFrom(after[1], after[2], after[3]); recognized = true; }

  const hours = take(/\b(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/);
  if (hours) { durationMinutes = Math.round(Number(hours[1]) * 60); recognized = true; }
  if (durationMinutes === null && take(/\bhalf an? hour\b/)) { durationMinutes = 30; recognized = true; }
  if (durationMinutes === null && take(/\b(?:an|one|the next) hour\b/)) { durationMinutes = 60; recognized = true; }
  if (durationMinutes === null && take(/\bcouple (?:of )?hours\b/)) { durationMinutes = 120; recognized = true; }
  const mins = durationMinutes === null ? take(/\b(\d+)\s*(?:m|min|mins|minute|minutes)\b/) : null;
  if (mins) { durationMinutes = Number(mins[1]); recognized = true; }

  if (/\b(tonight|tonite)\b/.test(text)) partOfDay = 'tonight';
  else if (/\bthis evening\b/.test(text)) partOfDay = 'evening';
  else if (/\bthis afternoon\b/.test(text)) partOfDay = 'afternoon';
  else if (/\b(rn|right now|now)\b/.test(text)) partOfDay = 'now';
  if (partOfDay) recognized = true;
  if (partOfDay === 'now' && durationMinutes === null && endClock === null) durationMinutes = 60;

  const activities: string[] = [];
  for (const [re, acts] of ACTIVITY_RULES) {
    if (re.test(text)) { activities.push(...acts); recognized = true; }
  }
  if (SOCIAL_WORDS.test(text)) recognized = true;

  const vibeMatch = /\b(chill|low-key|lowkey|loud|quiet|lively|cozy)\b/.exec(text);
  const friendsOnly = /\b(just friends|only friends|friends only)\b/.test(text);
  const alone = /\b(alone|solo|by myself)\b/.test(text);

  return {
    understood: recognized,
    activities: [...new Set(activities)],
    budgetMax,
    durationMinutes,
    startsInMinutes,
    startClock,
    endClock,
    partOfDay,
    maxWalkMinutes,
    wantsFriends: !alone,
    openToNewPeople: !friendsOnly,
    vibe: vibeMatch ? vibeMatch[1].replace('lowkey', 'low-key') : null,
  };
}
