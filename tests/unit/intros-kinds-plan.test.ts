// Muse Intros review round P1-P3:
//  P1  a reason the privacy guard rewrites reads as one of the kind's known templates, never
//      "You're both looking for people into coffee chats";
//  P2  an intro of one kind uses only that kind's looking-for text: a dating want never shows on a
//      coffee-chat card, in its agent logs, or in any prompt sent to Muse;
//  P3  a connected pair's chat is "Alex, Jordan + Muse" and Muse's ask has working quick replies
//      (Hold seats joins both people to the quest; Pick another time moves the plan and Muse reposts).
import { afterEach, describe, expect, it } from 'vitest';
import { INTRO_KINDS, profileId, type IntroKind } from '@/shared';
import { onRun, setMuseTransport, type MuseTransport } from '@/features/muse';
import { createMemoryStore, type DataStore } from '@/features/data/server';
import { privacyGuard } from '@/features/intros/server/privacy';
import { introProfileOf, MUTUAL_LINE } from '@/features/intros/server/rules';
import { listIntros, planIntro, putIntroProfile, requestIntro, respondIntro, runIntroRound } from '@/features/intros/server/service';

const alex = profileId('alex');
const jordan = profileId('jordan');
const saved = { ...process.env };
afterEach(() => { process.env = { ...saved }; setMuseTransport(null); onRun(() => {}); });
const mock = () => { process.env.MUSE_MOCK = '1'; process.env.MUSE_QUIET = '1'; };

/** Every reason a card may show, as code writes it. */
const TEMPLATES = [
  /^You both love [a-z0-9 ,'-]+$/i,
  /^You're both looking for new friends into (.+)$/,
  /^You're both open to coffee chats about (.+)$/,
  /^You're both hoping to meet someone into (.+)$/,
  /^You're looking for .+, and [A-Z][a-z]+ (works as|is into|'s bio mentions) .+$/,
];
const KIND_FILLER = /\b(coffee|chats?|friends?|dat(e|ing)|people|someone)\b/i;

function checkReason(r: string) {
  const t = TEMPLATES.find((x) => x.test(r));
  expect(t, `not a known template: "${r}"`).toBeTruthy();
  const m = /^You're both (?:looking for new friends into|open to coffee chats about|hoping to meet someone into) (.+)$/.exec(r);
  if (m) expect(m[1], `kind words in the filler: "${r}"`).not.toMatch(KIND_FILLER);
}

async function setKinds(store: DataStore, id: string, on: IntroKind[], dating: string) {
  const { view } = await store.museContext();
  const cur = introProfileOf(view, id);
  await putIntroProfile(store, id, {
    kinds: Object.fromEntries(INTRO_KINDS.map((k) => [k, { on: on.includes(k), lookingFor: k === 'dating' ? dating : cur.kinds[k].lookingFor }])),
  });
}

/** Runs one intro of `kind` for Alex -> Jordan and returns both cards (Jordan's after Alex accepts). */
async function pair(store: DataStore, kind: IntroKind) {
  const r = await requestIntro(store, alex, kind, '');
  if (!r.intro) return null;
  await respondIntro(store, alex, r.intro.id, true);
  const a = (await listIntros(store, alex)).intros.find((x) => x.id === r.intro!.id)!;
  const b = (await listIntros(store, jordan)).intros.find((x) => x.id === r.intro!.id)!;
  return { a, b };
}

// All non-empty subsets of the three kinds.
const SUBSETS: IntroKind[][] = [1, 2, 3, 4, 5, 6, 7].map((m) => INTRO_KINDS.filter((_, i) => m & (1 << i)));

describe('P1: scrubbed reasons are real sentences', () => {
  it('the review repro: Jordan\'s coffee-chat card never reads "looking for people into coffee chats"', async () => {
    mock();
    const store = createMemoryStore();
    await setKinds(store, alex, ['networking', 'dating'], 'someone into local shows');
    await setKinds(store, jordan, ['networking', 'dating'], 'someone into local shows and dumplings');
    const r = await runIntroRound(store, alex, 'networking');
    expect(r.intro?.kind).toBe('networking');
    await respondIntro(store, alex, r.intro!.id, true);
    const j = (await listIntros(store, jordan)).intros[0];
    expect(j.reasons.join(' | ')).not.toMatch(/into coffee chats/);
    j.reasons.forEach(checkReason);
  });

  it('every reason for the alex/jordan pair, in every kind combination, matches a known template', async () => {
    mock();
    let made = 0;
    for (const on of SUBSETS) {
      for (const kind of on) {
        const store = createMemoryStore();
        await setKinds(store, alex, on, 'someone into local shows');
        await setKinds(store, jordan, on, 'someone into local shows and dumplings');
        const cards = await pair(store, kind);
        if (!cards) continue;
        made++;
        for (const r of [...cards.a.reasons, ...cards.b.reasons]) checkReason(r);
      }
    }
    expect(made).toBeGreaterThanOrEqual(4);
  }, 20_000); // 1.6 s alone; 18 fresh stores, slow under a full parallel run

  it('guard unit: a leaking reason becomes the kind\'s template, or is dropped when nothing is shared', () => {
    const viewer = { interests: ['vinyl'], bio: '', job: null } as never;
    const other = { interests: ['local bands'], bio: '', job: null } as never;
    const viewerIntro = {
      userId: 'x', datingPrefs: null, maxKm: 25, paused: false,
      kinds: { friendship: { on: false, lookingFor: '' }, networking: { on: true, lookingFor: 'coffee chats with product people about design work' }, dating: { on: false, lookingFor: '' } },
    };
    const g = privacyGuard({
      viewer, seenOther: other, viewerIntro, secrets: ['product/design coffee chats'],
      kind: 'networking', otherKindText: 'product/design coffee chats',
    });
    expect(g.reasons(['Alex wants product/design coffee chats'])).toEqual(["You're both open to coffee chats about product and design"]);
    const none = privacyGuard({ viewer, seenOther: other, viewerIntro, secrets: ['pottery wheel classes'], kind: 'networking', otherKindText: 'pottery wheel classes' });
    expect(none.reasons(['Alex wants pottery wheel classes'])).toEqual([]);
    expect(MUTUAL_LINE.networking('design')).toBe("You're both open to coffee chats about design");
  });
});

describe('P2: one kind\'s text only', () => {
  const DATING_WORDS = /salsa|dancing|pottery/i;

  it('a coffee-chat intro never shows either side\'s dating text (mock Muse)', async () => {
    mock();
    const store = createMemoryStore();
    await setKinds(store, alex, ['networking', 'dating'], 'someone who loves salsa dancing');
    await setKinds(store, jordan, ['networking', 'dating'], 'someone into salsa dancing and pottery');
    const cards = await pair(store, 'networking');
    expect(cards).not.toBeNull();
    for (const c of [cards!.a, cards!.b]) {
      expect(c.kind).toBe('networking');
      const all = [...c.reasons, c.summary, ...c.myAgentLog.map((t) => t.text)].join(' | ');
      expect(all).not.toMatch(DATING_WORDS);
    }
    const { view } = await store.museContext();
    const row = view.db.intros[0];
    expect([...row.agentLogA, ...row.agentLogB].map((t) => `${t.text} ${t.outcome}`).join(' ')).not.toMatch(DATING_WORDS);
  });

  it('no prompt sent to Muse for a coffee-chat intro carries dating text (live Muse, fake transport)', async () => {
    delete process.env.MUSE_MOCK;
    Object.assign(process.env, { MUSE_API_KEY: 'test-key-not-real', MUSE_BASE_URL: 'http://127.0.0.1:9', MUSE_CACHE: '0', MUSE_QUIET: '1' });
    const prompts: string[] = [];
    const t: MuseTransport = async (req) => {
      prompts.push(req.messages.map((m) => m.content).join('\n'));
      if (req.schemaName === 'intro_judge') {
        return { content: JSON.stringify({ score: 91, factsA: [1, 2, 3], factsB: [1, 2, 3], summary: 'You both know Maya.', noteA: 'Worth a coffee chat.', noteB: 'Worth a coffee chat.' }), usage: { promptTokens: 1, completionTokens: 1 } };
      }
      return { content: JSON.stringify({ message: 'Sounds like a fit.', outcome: 'sees a fit' }), usage: { promptTokens: 1, completionTokens: 1 } };
    };
    setMuseTransport(t);
    const store = createMemoryStore();
    await setKinds(store, alex, ['networking', 'dating'], 'someone who loves salsa dancing');
    await setKinds(store, jordan, ['networking', 'dating'], 'someone into salsa dancing and pottery');
    const r = await runIntroRound(store, alex, 'networking');
    expect(r.intro?.kind).toBe('networking');
    expect(prompts.length).toBeGreaterThan(0);
    for (const p of prompts) expect(p).not.toMatch(DATING_WORDS);
  });
});

describe('P3: Muse is in the chat and its ask works', () => {
  async function connected() {
    mock();
    const store = createMemoryStore();
    const r = await runIntroRound(store, alex);
    await respondIntro(store, alex, r.intro!.id, true);
    const done = await respondIntro(store, jordan, r.intro!.id, true);
    return { store, id: r.intro!.id, threadId: done.intro.threadId! };
  }

  it('the chat is named for the pair plus Muse, and the card carries Muse\'s ask', async () => {
    const { store, id, threadId } = await connected();
    const t = (await store.threads(alex)).find((x) => x.id === threadId)!;
    expect(t.name).toBe('Alex, Jordan + Muse');
    const card = (await listIntros(store, alex)).intros.find((x) => x.id === id)!;
    expect(card.plan?.held).toBe(false);
    expect(card.plan?.canHold).toBe(true);
    expect(card.plan?.ask).toMatch(/^Want me to hold (2 seats|a seat for \w+ \(\w+ is already going\)) at /);
  });

  it('Hold seats joins both people to the quest once, and Muse confirms in the chat', async () => {
    const { store, id, threadId } = await connected();
    const before = (await listIntros(store, jordan)).intros.find((x) => x.id === id)!;
    const questId = before.plan!.questId!;
    const held = await planIntro(store, jordan, id, { action: 'hold' });
    expect(held.intro.plan?.held).toBe(true);
    const { view } = await store.museContext();
    expect(view.questMemberIds(questId)).toEqual(expect.arrayContaining([alex, jordan]));
    await planIntro(store, alex, id, { action: 'hold' });   // a repeat is a no-op
    const muse = (await store.messages(alex, threadId)).filter((m) => m.kind === 'muse');
    expect(muse).toHaveLength(2);
    expect(muse[1].text).toMatch(/^✨ Muse: Done, Jordan asked me to hold it: Alex and Jordan are both going to /);
    expect((await listIntros(store, alex)).intros.find((x) => x.id === id)!.plan?.held).toBe(true);
  });

  it('Pick another time moves the plan and Muse reposts its ask; unknown plans and unconnected intros are refused', async () => {
    const { store, id, threadId } = await connected();
    const card = (await listIntros(store, alex)).intros.find((x) => x.id === id)!;
    const opt = card.plan!.options[0];
    expect(opt).toBeTruthy();
    const moved = await planIntro(store, alex, id, { action: 'pick', questId: opt.questId });
    expect(moved.intro.plan?.questId).toBe(opt.questId);
    expect(moved.intro.step.label).toBe(opt.label);
    const last = (await store.messages(jordan, threadId)).at(-1)!;
    expect(last.kind).toBe('muse');
    expect(last.text).toMatch(/^✨ Muse: Alex picked another time\. Want me to hold (2 seats|a seat for \w+ \(\w+ is already going\)) at /);
    await expect(planIntro(store, alex, id, { action: 'pick', questId: 'nope' })).rejects.toMatchObject({ status: 400 });
    const fresh = createMemoryStore();
    mock();
    const r = await runIntroRound(fresh, alex);
    await expect(planIntro(fresh, alex, r.intro!.id, { action: 'hold' })).rejects.toMatchObject({ status: 409 });
  });
});
