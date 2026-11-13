// "Want to hang?" copy: Muse writes the reason and the invite draft for a hang that code picked
// (src/features/data/locations.ts hangSuggestion). Code checks the text: it must name the venue
// and may only use numbers from the facts. Anything else, a timeout or an error, keeps the
// code template, which the card shows without the Muse label.
import { z } from 'zod';
import { formatDemoTime } from '../../shared/demo';
import { museJSON, reportFallback } from './client';
import { HANG_JSON_SCHEMA, hangPrompt, type HangPromptInput } from './prompts/hang';

/** The hang fields this step reads and rewrites (structurally the data area's HangSuggestion). */
export type HangCopyInput = {
  kind: 'quest' | 'place';
  title: string; venueName: string;
  seatsLeft: number | null; walkMinutes: number;
  reason: string; draft: string;
  facts: {
    friendFirstName: string;
    bubble: { thought: string | null; doing: string | null; wantsTo: string | null };
    freeText: string | null; freeUntil: string | null;
    matched: { source: 'thought' | 'wantsTo' | 'free' | 'doing'; text: string } | null;
    when: string | null;
    theirWalkMinutes: number;
  };
};

export type HangCopy = { reason: string; draft: string; writtenBy: 'muse' | 'template'; mock: boolean };

/** Whole-call budget: the composer shows a skeleton until this returns. */
export const HANG_BUDGET_MS = 3_500;

const HangCopyZ = z.object({ reason: z.string().trim().min(8).max(160), draft: z.string().trim().min(8).max(240) });

const seats = (n: number) => `${n} ${n === 1 ? 'seat' : 'seats'} left`;

function quote(name: string, m: NonNullable<HangCopyInput['facts']['matched']>): string {
  const q = `“${m.text}”`;
  if (m.source === 'thought') return `${name}'s status: ${q}`;
  if (m.source === 'wantsTo') return `${name} wants to: ${q}`;
  if (m.source === 'free') return `${name}'s free note: ${q}`;
  return `${name} right now: ${q}`;
}

/** Deterministic stand-in for mock mode, built from the same facts the model gets. */
export function mockHangCopy(s: HangCopyInput): { reason: string; draft: string } {
  const f = s.facts;
  const name = f.friendFirstName;
  const lead = f.matched ? quote(name, f.matched) : `${name} is ${f.theirWalkMinutes} min away`;
  const said = f.matched && f.matched.source !== 'doing' ? ` Saw your “${f.matched.text.trim().replace(/[.?!]+$/, '')}”.` : '';
  if (s.kind === 'quest') {
    const when = f.when ?? 'now';
    const seat = s.seatsLeft !== null ? `, ${seats(s.seatsLeft)}` : '';
    return {
      reason: `${lead}, and ${s.venueName} is ${f.theirWalkMinutes} min from ${name}.`,
      draft: `${name}, ${s.venueName} ${when}? ${f.theirWalkMinutes}-min walk for you${seat}.${said}`,
    };
  }
  return {
    reason: `${lead}, and ${s.venueName} is ${f.theirWalkMinutes} min from ${name}.`,
    draft: `${name}, meet at ${s.venueName}? ${f.theirWalkMinutes}-min walk for you, I can be there in ${s.walkMinutes}.${said}`,
  };
}

/** Numbers the text may use: walk minutes, seats, and the clock digits of the start and free-until times. */
function allowedNumbers(s: HangCopyInput): Set<string> {
  const out = new Set<string>([String(s.walkMinutes), String(s.facts.theirWalkMinutes)]);
  if (s.seatsLeft !== null) out.add(String(s.seatsLeft));
  const texts = [s.facts.when, s.facts.freeUntil ? formatDemoTime(s.facts.freeUntil) : null, s.title, s.venueName,
    s.facts.bubble.thought, s.facts.bubble.doing, s.facts.bubble.wantsTo, s.facts.freeText];
  for (const t of texts) for (const n of (t ?? '').match(/\d+/g) ?? []) out.add(String(Number(n)));
  return out;
}

/** Why Muse's text is rejected, or null when it passes. */
export function hangCopyIssue(s: HangCopyInput, copy: { reason: string; draft: string }): string | null {
  if (!copy.draft.toLowerCase().includes(s.venueName.toLowerCase())) return 'draft does not name the venue';
  const ok = allowedNumbers(s);
  for (const n of `${copy.reason} ${copy.draft}`.match(/\d+/g) ?? []) {
    if (!ok.has(String(Number(n)))) return `number ${n} is not in the facts`;
  }
  if (/https?:|www\.|@/.test(`${copy.reason} ${copy.draft}`)) return 'link or handle in the text';
  return null;
}

/** Muse's reason and draft for a picked hang; the code template on any failure. */
export async function writeHangCopy(s: HangCopyInput, opts: { senderName: string; userId?: string | null }): Promise<HangCopy> {
  const template: HangCopy = { reason: s.reason, draft: s.draft, writtenBy: 'template', mock: false };
  const f = s.facts;
  const input: HangPromptInput = {
    senderName: opts.senderName.split(' ')[0] ?? opts.senderName,
    friendName: f.friendFirstName,
    friendSays: { thought: f.bubble.thought, doing: f.bubble.doing, wantsTo: f.bubble.wantsTo },
    friendFreeNote: f.freeText,
    friendFreeUntil: f.freeUntil ? formatDemoTime(f.freeUntil) : null,
    matched: f.matched?.text ?? null,
    kind: s.kind, title: s.title, venue: s.venueName, when: f.when,
    senderWalkMin: s.walkMinutes, friendWalkMin: f.theirWalkMinutes, seatsLeft: s.seatsLeft,
  };
  try {
    const res = await museJSON({
      schemaName: 'hang_copy',
      schema: HangCopyZ,
      jsonSchema: HANG_JSON_SCHEMA as unknown as Record<string, unknown>,
      messages: hangPrompt(input),
      model: 'fast',
      effort: 'minimal',
      mock: () => mockHangCopy(s),
      route: 'locations/hang',
      userId: opts.userId ?? null,
      deadline: Date.now() + HANG_BUDGET_MS,
    });
    const issue = hangCopyIssue(s, res.data);
    if (issue) {
      reportFallback({ route: 'locations/hang', step: 'hang_copy', error: issue, userId: opts.userId ?? null });
      return template;
    }
    return { reason: res.data.reason, draft: res.data.draft, writtenBy: 'muse', mock: res.mock };
  } catch (e) {
    reportFallback({ route: 'locations/hang', step: 'hang_copy', error: e instanceof Error ? e.message : String(e), userId: opts.userId ?? null });
    return template;
  }
}
