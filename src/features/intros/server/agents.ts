// "Click": two Muse agents vet a match before any human hears about it.
// Agent A represents the viewer and sees only the viewer's own profile and Intro settings plus
// public facts about B; Agent B is the mirror. They trade 2 short turns each (A pitches, B
// responds with fit and a question, A answers it, B gives a verdict). A judge call then scores
// the pair from the transcript and the code-found shared facts. Code enforces the bar afterwards.
// Each side stores its own turns in full and the other agent's turns as one-line outcomes only.
import { z } from 'zod';
import { museJSON } from '@/features/muse';
import type { AgentTurn, FirstStep, ID, IntroKind, IntroProfile, Profile } from '@/shared';
import type { View } from '@/features/data/server';
import { codeScore, factsFor, firstName, introProfileOf, kindsOn, trustLabels, type Candidate, type SharedFact } from './rules';

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
  reasonsA: z.array(z.string().min(1).max(220)).max(3),
  reasonsB: z.array(z.string().min(1).max(220)).max(3),
  summary: z.string().min(1).max(280),
  noteA: z.string().min(1).max(400),
  noteB: z.string().min(1).max(400),
});
type Judge = z.infer<typeof JudgeZ>;
const JUDGE_JSON = {
  type: 'object', additionalProperties: false,
  required: ['score', 'reasonsA', 'reasonsB', 'summary', 'noteA', 'noteB'],
  properties: {
    score: { type: 'integer', minimum: 0, maximum: 100 },
    reasonsA: { type: 'array', maxItems: 3, items: { type: 'string' } },
    reasonsB: { type: 'array', maxItems: 3, items: { type: 'string' } },
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
const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

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
  const common = { model: 'fast' as const, effort: 'minimal' as const, route: ROUTE, userId: a.id, deadline };

  const say = async (who: 'a' | 'b', instruction: string, mock: { message: string; outcome: string }) => {
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
      mock: () => mock,
    });
    log.push({ agent: who, text: res.data.message.trim(), outcome: res.data.outcome.trim() });
  };

  const fit = c.facts.length;
  const aLooking = aOwn.lookingFor.map((l) => l.split(': ')[1]).join(' and ') || KIND_LABEL[c.kind];
  const bLooking = bOwn.lookingFor.map((l) => l.split(': ')[1]).join(' and ') || KIND_LABEL[c.kind];
  await say('a', `Pitch what ${aName} wants and why ${bName} might fit.`, {
    message: `Hi, I'm ${aName}'s agent. ${aName} is new around here and looking for ${aLooking}, and is into ${a.interests.slice(0, 3).join(', ')}. Is ${bName} looking for anything like that?`,
    outcome: `pitched what ${aName} is looking for`,
  });
  await say('b', `Respond for ${bName}: say what ${bName} is looking for, where the fit is real, and ask one question or raise one concern.`, fit >= 2
    ? {
      message: `${bName}'s agent here. ${bName} wants ${bLooking}. Real overlap: ${lower(c.facts[0].judge)}. One question: when could they actually meet?`,
      outcome: 'sees a real fit, asked about timing',
    }
    : {
      message: `${bName}'s agent here. ${bName} wants ${bLooking}. Honestly I'm not seeing much overlap with ${aName} yet${fit === 1 ? ` beyond one thing: ${lower(c.facts[0].judge)}` : ''}.`,
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
  const kindNoun = c.kind === 'dating' ? 'date' : c.kind === 'networking' ? 'coffee chat' : 'friend match';
  const mockJudge = (): Judge => ({
    score: codeScore(fit),
    reasonsA: factsA.slice(0, 3),
    reasonsB: factsB.slice(0, 3),
    summary: fit >= 2
      ? `${trust[0] ?? 'You share a connection'}, and ${lower(c.facts[0].forA)}. Your agents think it's ${verb}.`
      : "Your agents talked it through and didn't find enough in common.",
    noteA: fit >= 2
      ? `Your agents agree ${bName} is a strong ${kindNoun}: ${lower(factsA[0])}. They think it's ${verb}.`
      : "Your agents didn't find enough in common.",
    noteB: fit >= 2
      ? `Your agents agree ${aName} is a strong ${kindNoun}: ${lower(factsB[0])}. They think it's ${verb}.`
      : "Your agents didn't find enough in common.",
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
          'Score fit 0-100. 85+ only when you would bet on this intro. Never invent facts.',
          'reasonsA: up to 3 reasons written to A as "you", naming B by first name, each restating one fact from factsForA. reasonsB: the mirror, from factsForB.',
          'Never quote one person\'s private "looking for" text to the other person; keep the wording given for each side.',
          'summary: one sentence to both ("you both ..."). noteA: 1-2 sentences to A on why your agents think A and B would click; noteB: the mirror.',
          `End noteA and noteB with what the first step is worth, tied to the kind, e.g. "${verb}".`,
        ].join(' '),
      },
      {
        role: 'user',
        content: [
          `Kind: ${c.kind}. A: ${aName}. B: ${bName}.`,
          `Trust path: ${trust.join('; ')}`,
          `factsForA: ${JSON.stringify(factsA)}`,
          `factsForB: ${JSON.stringify(factsB)}`,
          `First step: ${step.text}`,
          `Agent transcript:\n${log.map((t) => `${t.agent === 'a' ? `${aName}'s agent` : `${bName}'s agent`}: ${t.text}`).join('\n')}`,
        ].join('\n'),
      },
    ],
    mock: mockJudge,
  });
  const j = judged.data;
  const clean = (rs: string[]) => rs.map((r) => r.trim()).filter(Boolean);
  return {
    score: j.score,
    reasonsA: clean(j.reasonsA),
    reasonsB: clean(j.reasonsB),
    summary: j.summary.trim(),
    noteA: j.noteA.trim(),
    noteB: j.noteB.trim(),
    // The first step comes from code (a real quest id or none); the model cannot invent one.
    firstStep: step,
    logA: sideLog(log, 'a'),
    logB: sideLog(log, 'b'),
  };
}
