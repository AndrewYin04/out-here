// "Click": two Muse agents vet a match before any human hears about it.
// Agent A represents the viewer and sees only the viewer's own profile and Intro settings plus
// public facts about B; Agent B is the mirror. They trade 2 short turns each (A pitches, B
// responds with fit and concerns, A answers, B gives a verdict). A judge call then scores the
// pair from the transcript and the code-found shared facts. Code enforces the bar afterwards.
import { z } from 'zod';
import { museJSON } from '@/features/muse';
import type { AgentTurn, FirstStep, ID, IntroKind, IntroProfile, Profile } from '@/shared';
import type { View } from '@/features/data/server';
import { codeScore, firstName, introProfileOf, kindsOn, trustLabels, type Candidate, type SharedFact } from './rules';

const ROUTE = 'intros/click';
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
  if (best) {
    const when = new Date(best.startsAt).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', hour: 'numeric', minute: '2-digit' });
    return { text: `${best.emoji} ${best.title} at ${best.venueName}, ${when}`, questId: best.id, placeId: null };
  }
  return { text: '☕ A 20-minute coffee somewhere halfway', questId: null, placeId: null };
}

// ---------- schemas ----------
const TurnZ = z.object({ message: z.string().min(1).max(600) });
const TURN_JSON = {
  type: 'object', additionalProperties: false, required: ['message'],
  properties: { message: { type: 'string', description: '1-3 short sentences, plain language' } },
};
const JudgeZ = z.object({
  score: z.number().int().min(0).max(100),
  reasons: z.array(z.string().min(1).max(220)).max(3),
  summary: z.string().min(1).max(280),
  firstStepQuestId: z.string().nullable(),
  noteA: z.string().min(1).max(400),
  noteB: z.string().min(1).max(400),
});
type Judge = z.infer<typeof JudgeZ>;
const JUDGE_JSON = {
  type: 'object', additionalProperties: false,
  required: ['score', 'reasons', 'summary', 'firstStepQuestId', 'noteA', 'noteB'],
  properties: {
    score: { type: 'integer', minimum: 0, maximum: 100 },
    reasons: { type: 'array', maxItems: 3, items: { type: 'string' } },
    summary: { type: 'string' },
    firstStepQuestId: { type: ['string', 'null'] },
    noteA: { type: 'string' },
    noteB: { type: 'string' },
  },
};

export type ClickResult = {
  score: number; reasons: string[]; summary: string; noteA: string; noteB: string;
  firstStep: FirstStep; logA: AgentTurn[]; logB: AgentTurn[];
};

const AGENT_RULES = [
  'You are a Muse agent on Facebook who represents exactly one person in a private agent-to-agent chat about a possible warm intro.',
  'Speak for your person only. Use only the facts you were given; never invent interests, plans or history.',
  'Never reveal private details beyond what helps judge fit. Be honest about weak fit: a no is fine.',
  'Reply as JSON {"message": "..."} with 1-3 short sentences.',
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
  const factsText = c.facts.map((f) => f.text);
  const aName = firstName(a); const bName = firstName(b);
  const log: AgentTurn[] = [];
  const common = { model: 'fast' as const, effort: 'minimal' as const, route: ROUTE, userId: a.id, deadline };

  const say = async (who: 'a' | 'b', instruction: string, mockText: string) => {
    const own = who === 'a' ? aOwn : bOwn;
    const other = who === 'a' ? aSeesB : bSeesA;
    const res = await museJSON({
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
      mock: () => ({ message: mockText }),
    });
    log.push({ agent: who, text: res.data.message.trim() });
  };

  const fit = c.facts.length;
  const aLooking = aOwn.lookingFor.map((l) => l.split(': ')[1]).join(' and ') || KIND_LABEL[c.kind];
  const bLooking = bOwn.lookingFor.map((l) => l.split(': ')[1]).join(' and ') || KIND_LABEL[c.kind];
  await say('a', `Pitch what ${aName} wants and why ${bName} might fit.`,
    `Hi, I'm ${aName}'s agent. ${aName} is new around here and looking for ${aLooking}, and is into ${a.interests.slice(0, 3).join(', ')}. Is ${bName} looking for anything like that?`);
  await say('b', `Respond for ${bName}: say what ${bName} is looking for, where the fit is real, and any concern.`,
    fit >= 2
      ? `${bName}'s agent here. ${bName} wants ${bLooking}. Real overlap: ${factsText[0].charAt(0).toLowerCase()}${factsText[0].slice(1)}. My only question is timing.`
      : `${bName}'s agent here. ${bName} wants ${bLooking}. Honestly I'm not seeing much overlap with ${aName} yet${fit === 1 ? ` beyond one thing: ${factsText[0].charAt(0).toLowerCase()}${factsText[0].slice(1)}` : ''}.`);
  await say('a', `Answer the concern and propose the first step.`,
    fit >= 2
      ? `${trust[0] ?? 'They have a mutual connection'}, so it's a warm intro. Timing works: ${step.text}.`
      : `Fair. ${trust[0] ?? 'They have a mutual connection'}, but I wouldn't push it without more in common.`);
  await say('b', `Give ${bName}'s verdict: would ${bName} want this intro? Say yes or no and why.`,
    fit >= 2 ? `Yes, ${bName} would be glad to meet ${aName}. That first step sounds right.` : `I'd pass for now. Not enough in common to make it worth ${bName}'s time.`);

  const mockJudge = (): Judge => ({
    score: codeScore(fit),
    reasons: factsText.slice(0, 3),
    summary: fit >= 2
      ? `${trust[0] ?? 'You share a connection'}, and you both want the same thing: ${c.facts[0].keyword}. Your agents agreed this one is worth a coffee.`
      : `Your agents talked it through and didn't find enough in common.`,
    firstStepQuestId: step.questId,
    noteA: `${aName}, meet ${bName}! ${trust[0] ?? ''}. ${factsText[0] ?? ''}. Try this: ${step.text}.`,
    noteB: `${bName}, meet ${aName}! ${trust[0] ?? ''}. ${factsText[0] ?? ''}. Try this: ${step.text}.`,
  });
  const judged = await museJSON({
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
          'Score fit 0-100. 85+ only when you would bet on this intro. Each reason must cite one concrete shared fact from the list given (interests, what they are looking for, jobs).',
          'Never invent facts. summary is "why your agents think you\'d click", addressed to both, one or two sentences.',
          'noteA is a warm 1-2 sentence intro note to A about B; noteB the mirror. firstStepQuestId is the given quest id or null.',
        ].join(' '),
      },
      {
        role: 'user',
        content: [
          `Kind: ${c.kind}. A: ${aName}. B: ${bName}.`,
          `Trust path: ${trust.join('; ')}`,
          `Shared facts found by code: ${JSON.stringify(factsText)}`,
          `First step option: ${JSON.stringify(step)}`,
          `Agent transcript:\n${log.map((t) => `${t.agent === 'a' ? `${aName}'s agent` : `${bName}'s agent`}: ${t.text}`).join('\n')}`,
        ].join('\n'),
      },
    ],
    mock: mockJudge,
  });
  const j = judged.data;
  return {
    score: j.score,
    reasons: j.reasons.map((r) => r.trim()).filter(Boolean),
    summary: j.summary.trim(),
    noteA: j.noteA.trim(),
    noteB: j.noteB.trim(),
    // The first step comes from code (a real quest id or none); the model cannot invent one.
    firstStep: step,
    logA: log.filter((t) => t.agent === 'a'),
    logB: log.filter((t) => t.agent === 'b'),
  };
}
