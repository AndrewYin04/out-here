// "Click": two Muse agents vet a match before any human hears about it.
// Agent A represents the viewer and sees only the viewer's own profile and Intro settings plus
// public facts about B; Agent B is the mirror. They trade 2 short turns each (A pitches, B
// responds with fit and a question, A answers it, B gives a verdict). A judge call then scores
// the pair from the transcript and the code-found shared facts and picks which facts hold up;
// the reasons each person reads are those facts as code wrote them for that side, never model
// text, so the other side's private looking-for words cannot reach them. Code enforces the bar.
// Each side stores its own turns in full and the other agent's turns as one-line outcomes only.
import { z } from 'zod';
import { museJSON, MuseTimeoutError, type MuseJSONOptions, type MuseResult } from '@/features/muse';
import type { AgentTurn, FirstStep, ID, IntroKind, IntroProfile, Profile } from '@/shared';
import type { View } from '@/features/data/server';
import {
  codeScore, distinctTopics, factsFor, firstName, introProfileOf, kindsOn, trustLabels, type Candidate, type SharedFact,
} from './rules';

const ROUTE = 'intros/click';
/** Per-attempt cap for one agent turn or the judge (a live Ember turn is about 1-2 s). */
export const INTRO_ATTEMPT_MS = 8_000;
/** A retry starts only with at least this much of the round left. */
export const MIN_RETRY_MS = 2_500;

/** Timeouts and 5xx replies are worth one more try; bad input (4xx) is not. */
export function isTransient(err: unknown): boolean {
  if (err instanceof MuseTimeoutError) return true;
  const s = (err as { status?: unknown })?.status;
  return typeof s === 'number' && s >= 500;
}

/**
 * One Muse call for an agent turn or the judge: on a timeout or a 5xx it tries once more, but
 * only while the round deadline leaves MIN_RETRY_MS. The retry gets the time that is left.
 */
export async function museWithRetry<T>(opts: MuseJSONOptions<T>, deadline: number): Promise<MuseResult<T>> {
  const call = () => museJSON({ ...opts, deadline, timeoutMs: opts.timeoutMs ?? INTRO_ATTEMPT_MS });
  try {
    return await call();
  } catch (err) {
    if (!isTransient(err) || deadline - Date.now() < MIN_RETRY_MS) throw err;
    console.warn(`[intros] ${opts.schemaName} retrying after: ${String((err as Error)?.message ?? err).slice(0, 120)}`);
    return call();
  }
}
const KIND_LABEL: Record<IntroKind, string> = { friendship: 'a new friend', networking: 'a coffee chat', dating: 'a date' };

// ---------- what each agent may see ----------
type OwnBrief = { firstName: string; bio: string; interests: string[]; job: string | null; lookingFor: string[] };
type PublicBrief = { firstName: string; interests: string[]; job: string | null; sharedGroups: string[]; mutualFriends: string[] };

function ownBrief(p: Profile, ip: IntroProfile): OwnBrief {
  return {
    firstName: firstName(p), bio: p.bio, interests: p.interests, job: p.job,
    lookingFor: kindsOn(ip).map((k) => `${k}: ${ip.kinds[k].lookingFor}`).filter((s) => !s.endsWith(': ')),
  };
}
function publicBrief(v: View, viewerId: ID, other: Profile, c: Candidate): PublicBrief {
  const seen = v.profileFor(viewerId, other);
  return {
    firstName: firstName(other), interests: other.interests, job: seen.job,
    sharedGroups: c.trust.groupIds.map((g) => v.groupById.get(g)?.name ?? '').filter(Boolean),
    mutualFriends: c.trust.mutualIds.map((m) => firstName(v.profileById.get(m))),
  };
}

// ---------- first step: an upcoming quest that matches a shared fact ----------
export function pickFirstStep(v: View, a: Profile, b: Profile, facts: SharedFact[], nowMs: number): FirstStep {
  const keys = facts.map((f) => f.keyword).filter(Boolean);
  const words = [...new Set([...keys, ...a.interests, ...b.interests].map((k) => k.toLowerCase()))];
  const upcoming = v.db.quests.filter((q) => q.isPublic && (q.status === 'open' || q.status === 'live') && Date.parse(q.endsAt) > nowMs);
  const scored = upcoming.map((q) => {
    const hay = `${q.title} ${q.tags.join(' ')} ${q.description}`.toLowerCase();
    return { q, s: words.filter((w) => hay.includes(w)).length + (keys.some((k) => hay.includes(k)) ? 2 : 0) };
  }).filter((x) => x.s > 0).sort((x, y) => y.s - x.s || x.q.startsAt.localeCompare(y.q.startsAt));
  const best = scored[0]?.q;
  if (best) return { text: `${best.emoji} ${best.title} at ${best.venueName}`, questId: best.id, placeId: null };
  return { text: '☕ A 20-minute coffee somewhere halfway', questId: null, placeId: null };
}

/** "worth going to the local band show pregame together", tied to the kind and the first step. */
export function stepVerb(kind: IntroKind, questTitle: string | null): string {
  if (questTitle) return `worth going to the ${questTitle.toLowerCase().replace(/^the /, '')} together`;
  if (kind === 'dating') return 'worth a first date';
  if (kind === 'networking') return 'worth a 20-minute coffee chat';
  return 'worth a 20-minute coffee';
}

/** The facts the judge accepted, by 1-based number, in its order, each once, at most 3. */
export function pickFacts(facts: string[], picks: number[]): string[] {
  const out: string[] = [];
  for (const n of picks) {
    const f = facts[n - 1];
    if (f && !out.includes(f)) out.push(f);
  }
  return out.slice(0, 3);
}

/** One side's private copy: its own turns in full, the other agent's turns as outcomes only. */
export function sideLog(log: AgentTurn[], side: 'a' | 'b'): AgentTurn[] {
  return log.map((t) => (t.agent === side ? { ...t } : { agent: t.agent, text: '', outcome: t.outcome || 'replied' }));
}

// ---------- schemas ----------
const TurnZ = z.object({ message: z.string().min(1).max(600), outcome: z.string().min(1).max(120) });
const TURN_JSON = {
  type: 'object', additionalProperties: false, required: ['message', 'outcome'],
  properties: {
    message: { type: 'string', description: '1-3 short sentences, plain language' },
    outcome: {
      type: 'string',
      description: 'Under 12 words, lowercase: what this turn did, safe for the other side to see, no private details. Example: "sees a real fit, asked about timing"',
    },
  },
};
const JudgeZ = z.object({
  score: z.number().int().min(0).max(100),
  /** Numbers (1-based) of the factsForA / factsForB lines the judge accepts as real reasons. */
  factsA: z.array(z.number().int()).max(6),
  factsB: z.array(z.number().int()).max(6),
  summary: z.string().min(1).max(280),
  noteA: z.string().min(1).max(400),
  noteB: z.string().min(1).max(400),
});
type Judge = z.infer<typeof JudgeZ>;
const JUDGE_JSON = {
  type: 'object', additionalProperties: false,
  required: ['score', 'factsA', 'factsB', 'summary', 'noteA', 'noteB'],
  properties: {
    score: { type: 'integer', minimum: 0, maximum: 100 },
    factsA: { type: 'array', maxItems: 6, items: { type: 'integer' } },
    factsB: { type: 'array', maxItems: 6, items: { type: 'integer' } },
    summary: { type: 'string' },
    noteA: { type: 'string' },
    noteB: { type: 'string' },
  },
};

export type ClickResult = {
  score: number; reasonsA: string[]; reasonsB: string[]; summary: string; noteA: string; noteB: string;
  firstStep: FirstStep; logA: AgentTurn[]; logB: AgentTurn[];
};

const AGENT_RULES = [
  'You are a Muse agent on Facebook who represents exactly one person in a private agent-to-agent chat about a possible warm intro.',
  'Speak for your person only. Use only the facts you were given; never invent interests, plans or history.',
  'Never reveal private details beyond what helps judge fit. Be honest about weak fit: a no is fine.',
  'If the other agent asked a question, answer it directly.',
  'Reply as JSON {"message": "...", "outcome": "..."}: message is 1-3 short sentences; outcome is under 12 words and safe for the other side to see.',
].join(' ');

const dialog = (log: AgentTurn[], me: 'a' | 'b') =>
  log.map((t) => (t.agent === me ? `You: ${t.text}` : `Their agent: ${t.text}`)).join('\n') || '(nothing yet)';

/** Runs one agent-to-agent exchange plus the judge for viewer A and candidate B. */
export async function runClick(
  v: View, a: Profile, aIntro: IntroProfile, c: Candidate, nowMs: number, deadline: number,
): Promise<ClickResult> {
  const b = c.profile;
  const bIntro = introProfileOf(v, b.id);
  const aOwn = ownBrief(a, aIntro);
  const bOwn = ownBrief(b, bIntro);
  const aSeesB = publicBrief(v, a.id, b, c);
  const bSeesA = publicBrief(v, b.id, a, c);
  const trust = trustLabels(v, c.trust);
  const step = pickFirstStep(v, a, b, c.facts, nowMs);
  const quest = step.questId ? v.db.quests.find((q) => q.id === step.questId) ?? null : null;
  const verb = stepVerb(c.kind, quest?.title ?? null);
  const aName = firstName(a); const bName = firstName(b);
  const log: AgentTurn[] = [];
  const common = { model: 'fast' as const, effort: 'minimal' as const, route: ROUTE, userId: a.id };

  const say = async (who: 'a' | 'b', instruction: string, mock: { message: string; outcome: string }) => {
    const own = who === 'a' ? aOwn : bOwn;
    const other = who === 'a' ? aSeesB : bSeesA;
    const res = await museWithRetry({
      ...common,
      schemaName: `intro_agent_${who}`,
      schema: TurnZ,
      jsonSchema: TURN_JSON,
      messages: [
        { role: 'system', content: AGENT_RULES },
        {
          role: 'user',
          content: [
            `Intro kind: ${c.kind} (${KIND_LABEL[c.kind]}).`,
            `Your person (private to you): ${JSON.stringify(own)}`,
            `Public facts about the other person: ${JSON.stringify(other)}`,
            `How they are connected: ${trust.join('; ')}`,
            `A possible first step nearby: ${step.text}`,
            `Conversation so far:\n${dialog(log, who)}`,
            `Your turn: ${instruction}`,
          ].join('\n'),
        },
      ],
      mock: () => mock,
    }, deadline);
    log.push({ agent: who, text: res.data.message.trim(), outcome: res.data.outcome.trim() });
  };

  const fit = distinctTopics(c.facts);
  // B's agent sees only public facts about A, so its own turns never restate A's looking-for text.
  const sharedInterest = c.facts.find((f) => f.looker === null)?.keyword;
  const overlap = sharedInterest ? `they both love ${sharedInterest}` : `${bName}'s profile fits what ${aName} is looking for`;
  const aLooking = aOwn.lookingFor.map((l) => l.split(': ')[1]).join(' and ') || KIND_LABEL[c.kind];
  const bLooking = bOwn.lookingFor.map((l) => l.split(': ')[1]).join(' and ') || KIND_LABEL[c.kind];
  await say('a', `Pitch what ${aName} wants and why ${bName} might fit.`, {
    message: `Hi, I'm ${aName}'s agent. ${aName} is new around here and looking for ${aLooking}, and is into ${a.interests.slice(0, 3).join(', ')}. Is ${bName} looking for anything like that?`,
    outcome: `pitched what ${aName} is looking for`,
  });
  await say('b', `Respond for ${bName}: say what ${bName} is looking for, where the fit is real, and ask one question or raise one concern.`, fit >= 2
    ? {
      message: `${bName}'s agent here. ${bName} wants ${bLooking}. Real overlap: ${overlap}. One question: when could they actually meet?`,
      outcome: 'sees a real fit, asked about timing',
    }
    : {
      message: `${bName}'s agent here. ${bName} wants ${bLooking}. Honestly I'm not seeing much overlap with ${aName} yet${fit === 1 ? ` beyond one thing: ${overlap}` : ''}.`,
      outcome: "isn't seeing much overlap",
    });
  await say('a', "Answer the other agent's question or concern, and propose the first step.", fit >= 2
    ? {
      message: `On timing: ${step.text} works for ${aName}. ${trust[0] ?? 'They have a mutual connection'}, so it's a warm intro, not a cold one.`,
      outcome: 'answered on timing and suggested a first step',
    }
    : {
      message: `Fair. ${trust[0] ?? 'They have a mutual connection'}, but I wouldn't push it without more in common.`,
      outcome: 'agreed the fit is thin',
    });
  await say('b', `Give ${bName}'s verdict: would ${bName} want this intro? Say yes or no and why.`, fit >= 2
    ? { message: `Yes, ${bName} would be glad to meet ${aName}. That first step sounds right.`, outcome: 'said yes, the first step works' }
    : { message: `I'd pass for now. Not enough in common to make it worth ${bName}'s time.`, outcome: 'passed for now' });

  const factsA = factsFor(c.facts, 'a');
  const factsB = factsFor(c.facts, 'b');
  const numbered = (fs: string[]) => fs.map((f, n) => `${n + 1}. ${f}`).join('\n') || '(none)';
  const kindNoun = c.kind === 'dating' ? 'date' : c.kind === 'networking' ? 'coffee chat' : 'friend match';
  const mockJudge = (): Judge => ({
    score: codeScore(fit),
    factsA: factsA.map((_, n) => n + 1),
    factsB: factsB.map((_, n) => n + 1),
    // The summary and notes name the trust path, the kind and the first step; the shared facts
    // live only in the reasons, so the card never says the same fact twice.
    summary: fit >= 2
      ? `${trust[0] ?? 'You share a connection'}, and both of your agents said yes to a ${kindNoun}. They think it's ${verb}.`
      : "Your agents talked it through and didn't find enough in common.",
    noteA: fit >= 2
      ? `Your agents agree ${bName} is a strong ${kindNoun} for you, and they think it's ${verb}.`
      : "Your agents didn't find enough in common.",
    noteB: fit >= 2
      ? `Your agents agree ${aName} is a strong ${kindNoun} for you, and they think it's ${verb}.`
      : "Your agents didn't find enough in common.",
  });
  const judged = await museWithRetry({
    ...common,
    model: 'fast',
    schemaName: 'intro_judge',
    schema: JudgeZ,
    jsonSchema: JUDGE_JSON,
    messages: [
      {
        role: 'system',
        content: [
          'You are Muse, judging whether two people on Facebook should get a warm one-to-one intro, like a trusted friend would.',
          'Score fit 0-100. 85+ only when you would bet on this intro. Never invent facts.',
          'factsA: the numbers of the factsForA lines that are real, concrete reasons for this intro, best first; factsB: the same for factsForB. Leave out any line the transcript contradicts.',
          'Never quote or paraphrase one person\'s private "looking for" text, or what their agent said they want, to the other person.',
          'summary: one sentence to both people naming the trust path and the kind. noteA: 1-2 sentences to A on why your agents think A and B would click; noteB: the mirror.',
          'summary, noteA and noteB must not repeat any fact used in the reasons; name the kind and the first step instead.',
          `End noteA and noteB with what the first step is worth, tied to the kind, e.g. "${verb}".`,
        ].join(' '),
      },
      {
        role: 'user',
        content: [
          `Kind: ${c.kind}. A: ${aName}. B: ${bName}.`,
          `Trust path: ${trust.join('; ')}`,
          `factsForA:\n${numbered(factsA)}`,
          `factsForB:\n${numbered(factsB)}`,
          `First step: ${step.text}`,
          `Agent transcript:\n${log.map((t) => `${t.agent === 'a' ? `${aName}'s agent` : `${bName}'s agent`}: ${t.text}`).join('\n')}`,
        ].join('\n'),
      },
    ],
    mock: mockJudge,
  }, deadline);
  const j = judged.data;
  return {
    score: j.score,
    // The reasons are the accepted facts in code's wording for that side; unknown numbers are dropped.
    reasonsA: pickFacts(factsA, j.factsA),
    reasonsB: pickFacts(factsB, j.factsB),
    summary: j.summary.trim(),
    noteA: j.noteA.trim(),
    noteB: j.noteB.trim(),
    // The first step comes from code (a real quest id or none); the model cannot invent one.
    firstStep: step,
    logA: sideLog(log, 'a'),
    logB: sideLog(log, 'b'),
  };
}
