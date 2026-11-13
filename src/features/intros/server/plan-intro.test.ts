// Plan-anchored intros ("find someone to go to THIS plan with", issue #44): who can be a
// candidate for a plan, the interest-to-plan reason, and both people joining on double accept.
import { beforeAll, describe, expect, it } from 'vitest';
import { offsetPoint, profileId, THRIFT_AREA, THRIFT_MEET_SPOT, type ID } from '@/shared';
import { createMemoryStore, type DataStore } from '@/features/data/server';
import { candidatesFor, factsFor, freeForPlan, planFacts } from './rules';
import { requestIntro, respondIntro } from './service';

const alex = profileId('alex');
const jordan = profileId('jordan');
const SALE = 'Closet sale + try-ons';
const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

beforeAll(() => { process.env.MUSE_MOCK = '1'; });

async function questByTitle(store: DataStore, title: string) {
  const { view } = await store.museContext();
  const q = view.db.quests.find((x) => x.title === title && Date.parse(x.endsAt) > Date.now());
  if (!q) throw new Error(`no upcoming quest "${title}" in the seed`);
  return q;
}

/** Jordan says "I'm free" for a window around the plan, `meters` from it. */
async function jordanFree(store: DataStore, q: { startsAt: string; endsAt: string; location: { lat: number; lng: number } }, opts: { meters?: number; startsAt?: string; endsAt?: string } = {}) {
  await store.createAvailability(jordan, {
    text: 'free tonight', startsAt: opts.startsAt ?? new Date().toISOString(), endsAt: opts.endsAt ?? q.endsAt,
    location: offsetPoint(q.location, opts.meters ?? 300, 90),
  });
}

const handlesFor = async (store: DataStore, questTitle: string) => {
  const { view } = await store.museContext();
  const q = await questByTitle(store, questTitle);
  return candidatesFor(view, alex, { kinds: ['networking'], nowMs: Date.now(), quest: q }).map((c) => c.profile.handle);
};

describe('plan-anchored candidates', () => {
  it('are free for the plan\'s window', async () => {
    const store = createMemoryStore();
    expect(await handlesFor(store, 'Bouldering intro')).not.toContain('jordan');
    const q = await questByTitle(store, 'Bouldering intro');
    // A window that ends before the plan starts does not count.
    await jordanFree(store, q, { endsAt: new Date(Date.parse(q.startsAt) - 5 * 60_000).toISOString() });
    expect(await handlesFor(store, 'Bouldering intro')).not.toContain('jordan');
    await jordanFree(store, q);
    expect(await handlesFor(store, 'Bouldering intro')).toContain('jordan');
  });

  it('are within the 25 min walk of the plan', async () => {
    const store = createMemoryStore();
    const q = await questByTitle(store, 'Bouldering intro');
    await jordanFree(store, q, { meters: 3000 });   // ~49 min on foot
    const { view } = await store.museContext();
    expect(freeForPlan(view, jordan, q, Date.now())).toBeNull();
    expect(await handlesFor(store, 'Bouldering intro')).not.toContain('jordan');
    await jordanFree(store, q, { meters: 800 });     // ~13 min
    expect(await handlesFor(store, 'Bouldering intro')).toContain('jordan');
  });

  it('are not already on the plan', async () => {
    const store = createMemoryStore();
    const q = await questByTitle(store, 'Bouldering intro');
    await jordanFree(store, q);
    await store.joinQuest(jordan, q.id);
    expect(await handlesFor(store, 'Bouldering intro')).not.toContain('jordan');
  });
});

describe('plan reasons', () => {
  it('a shared interest that matches the plan\'s tags is a reason, named with the plan', async () => {
    const store = createMemoryStore();
    const { view } = await store.museContext();
    const q = await questByTitle(store, 'Local-band show pregame');
    const facts = planFacts(view, view.profileById.get(alex)!, view.profileById.get(jordan)!, q);
    expect(facts.map((f) => f.forA)).toContain('You both love local bands, and that\'s what 🎸 Local-band show pregame is about');
  });

  it('the other person\'s interest alone counts too, written to each side', async () => {
    const store = createMemoryStore();
    const { view } = await store.museContext();
    // Alex runs and Jordan does not: Jordan asks for company to the 5K.
    const q = await questByTitle(store, 'Easy 5K along the bay trail');
    const [f] = planFacts(view, view.profileById.get(jordan)!, view.profileById.get(alex)!, q);
    expect(f.forA).toBe('Alex is into running, a fit for 🏃 Easy 5K along the bay trail');
    expect(f.forB).toBe('Jordan wants company for 🏃 Easy 5K along the bay trail, and you\'re into running');
  });

  it('replaces the generic shared-interest reason instead of repeating it', async () => {
    const store = createMemoryStore();
    const q = await questByTitle(store, 'Local-band show pregame');
    // Jordan is seeded on this plan; take him off so he can be a candidate.
    await store.leaveQuest(jordan, q.id);
    await jordanFree(store, q);
    const after = (await store.museContext()).view;
    const c = candidatesFor(after, alex, { kinds: ['networking'], nowMs: Date.now(), quest: q }).find((x) => x.profile.id === jordan)!;
    const texts = factsFor(c.facts, 'a');
    expect(texts).toContain('You both love local bands, and that\'s what 🎸 Local-band show pregame is about');
    expect(texts).not.toContain('You both love local bands');
  });
});

describe('double accept joins the plan', () => {
  async function anchored(store: DataStore, title: string) {
    const q = await questByTitle(store, title);
    await jordanFree(store, q);
    await onlyJordan(store, q.id);
    const r = await requestIntro(store, alex, 'networking', '', q.id);
    expect(r.intro?.other.handle).toBe('jordan');
    expect(r.intro?.step.anchored).toBe(true);
    expect(r.intro?.step.label).toContain(q.title);
    return { q, id: r.intro!.id };
  }
  const membersOf = async (store: DataStore, questId: ID) => (await store.museContext()).view.questMemberIds(questId);
  const seatsOf = async (store: DataStore, questId: ID) => {
    const { view } = await store.museContext();
    return view.seatsLeft(view.db.quests.find((x) => x.id === questId)!);
  };

  it('both people join exactly once, and Muse names the plan, the time and the walk', async () => {
    const store = createMemoryStore();
    const { q, id } = await anchored(store, SALE);
    const before = await seatsOf(store, q.id);
    await respondIntro(store, alex, id, true);
    expect(await membersOf(store, q.id)).not.toContain(alex);   // nothing happens on one yes
    // Jordan double-taps: two requests at once, one makes the change.
    const [one, two] = await Promise.all([respondIntro(store, jordan, id, true), respondIntro(store, jordan, id, true)]);
    expect(one.intro.state).toBe('connected');
    expect(two.intro.state).toBe('connected');
    const members = await membersOf(store, q.id);
    expect(members.filter((m) => m === alex)).toHaveLength(1);
    expect(members.filter((m) => m === jordan)).toHaveLength(1);
    expect(await seatsOf(store, q.id)).toBe(before - 2);
    const threadId = one.intro.threadId ?? two.intro.threadId!;
    const notes = (await store.messages(alex, threadId)).filter((m) => m.kind === 'muse');
    // Muse's note, then the exact spot now that both are on the plan.
    expect(notes).toHaveLength(2);
    expect(notes[0].text).toContain(`You're both going to ${q.emoji} ${q.title} at ${q.venueName}`);
    expect(notes[0].text).toMatch(/about a \d+ min walk for Alex and \d+ min for Jordan/);
    expect(notes[1].text).toContain(`Exact spot: ${THRIFT_MEET_SPOT}`);
    const card = (await respondIntro(store, alex, id, true)).intro;
    expect(card.plan?.held).toBe(true);
    expect(card.step.href).toContain(q.id);
  });

  it('a plan that filled up still connects, and Muse suggests the next one', async () => {
    const store = createMemoryStore();
    const { q, id } = await anchored(store, SALE);
    // Other people take the last seats before Jordan says yes.
    const { view } = await store.museContext();
    const members = view.questMemberIds(q.id);
    const others = view.db.profiles.filter((p) => ![alex, jordan, ...members].includes(p.id)).slice(0, await seatsOf(store, q.id));
    for (const p of others) await store.joinQuest(p.id, q.id);
    expect(await seatsOf(store, q.id)).toBe(0);
    await respondIntro(store, alex, id, true);
    const done = (await respondIntro(store, jordan, id, true)).intro;
    expect(done.state).toBe('connected');
    const after = await membersOf(store, q.id);
    expect(after).not.toContain(alex);
    expect(after).not.toContain(jordan);
    const notes = (await store.messages(alex, done.threadId!)).filter((m) => m.kind === 'muse');
    expect(notes).toHaveLength(1);
    // Neither of them got on, so the note names only the general area.
    expect(notes[0].text).toContain(`${q.emoji} ${q.title} at ${THRIFT_AREA} filled up before you both said yes.`);
    expect(notes[0].text).toMatch(/Next one that fits you both|Want me to find another plan/);
  });

  it('a plan that already ended cannot anchor a request', async () => {
    const store = createMemoryStore();
    const { view } = await store.museContext();
    const past = view.db.quests.find((x) => Date.parse(x.endsAt) < Date.now() && view.canSeeQuest(alex, x));
    if (!past) return;
    await expect(requestIntro(store, alex, 'networking', '', past.id)).rejects.toThrow();
  });
});

/**
 * Bea and Grace are also free for the closet sale and clear the bar (the scene 5 choices); for
 * tests about one intro, they are already on the plan, so Jordan is the only candidate.
 */
async function onlyJordan(store: DataStore, questId: ID) {
  for (const h of ['bea', 'grace']) await store.joinQuest(profileId(h), questId).catch(() => undefined);
}

// Scene 5 of docs/DEMO_FLOW.md: "find me someone into thrifting to go to THIS closet sale with".
describe('scene 5: someone for the closet sale', () => {
  async function saleWithOnlyJordan() {
    const store = createMemoryStore();
    const q = await questByTitle(store, SALE);
    await onlyJordan(store, q.id);
    return { store, q };
  }

  it('the scripted line finds Jordan above the bar, and the first reason ties him to the plan', async () => {
    for (const kind of ['friendship', 'networking', null] as const) {
      const { store, q } = await saleWithOnlyJordan();
      const r = await requestIntro(store, alex, kind, 'someone into thrifting', q.id);
      expect(r.intro?.other.handle).toBe('jordan');
      expect(r.intro!.score).toBeGreaterThanOrEqual(85);
      // The first reason is why Jordan fits a closet sale, quoting what he posted; the step is the sale.
      expect(r.intro!.reasons[0]).toMatch(/^You both love .*thrifting/);
      expect(r.intro!.step.label).toContain(`${q.emoji} ${q.title}`);
    }
  });

  it('with no kind, a plan request is a Friendship intro', async () => {
    const { store, q } = await saleWithOnlyJordan();
    expect((await requestIntro(store, alex, null, '', q.id)).intro?.kind).toBe('friendship');
  });

  it('the typed ask adds a reason and keeps the saved looking-for', async () => {
    // A plan intro gives one reason of each kind (plan, Group, timing), so this is a plain ask.
    const store = createMemoryStore();
    const r = await requestIntro(store, alex, 'friendship', 'someone into vinyl');
    expect(r.intro?.reasons).toContain('You asked for someone into vinyl, and Jordan is into vinyl');
    expect(r.intro!.score).toBeGreaterThanOrEqual(85);
  });

  it('Jordan never reads what Alex typed', async () => {
    const { store, q } = await saleWithOnlyJordan();
    const r = await requestIntro(store, alex, 'friendship', 'someone into vinyl', q.id);
    await respondIntro(store, alex, r.intro!.id, true);
    const { listIntros } = await import('./service');
    const card = (await listIntros(store, jordan)).intros.find((i) => i.id === r.intro!.id)!;
    expect([...card.reasons, card.summary].join(' ')).not.toMatch(/asked for/i);
  });

  it('nobody with a reason to go to the plan means no intro', async () => {
    const store = createMemoryStore();
    const q = await questByTitle(store, 'Bouldering intro');
    await jordanFree(store, q);
    const r = await requestIntro(store, alex, 'networking', '', q.id);
    expect(r.intro).toBeNull();
    expect(r.message).toContain("nothing on their profile says they'd want to go to this plan");
  });

  it('Jordan\'s card says that yes puts him on the plan, with the time and the walk', async () => {
    const { store, q } = await saleWithOnlyJordan();
    const r = await requestIntro(store, alex, 'friendship', '', q.id);
    expect(r.intro?.joinLine).toMatch(new RegExp(`^Saying yes adds you to ${esc(`${q.emoji} ${q.title}`)} · .+ · [0-9]+ min walk$`));
    await respondIntro(store, alex, r.intro!.id, true);
    const { listIntros } = await import('./service');
    const card = (await listIntros(store, jordan)).intros.find((i) => i.id === r.intro!.id)!;
    expect(card.state).toBe('new');
    expect(card.joinLine).toMatch(new RegExp(`^Saying yes adds you to ${esc(`${q.emoji} ${q.title}`)} · `));
    const done = (await respondIntro(store, jordan, r.intro!.id, true)).intro;
    expect(done.joinLine).toBeNull();
  });

  it('picking one choice asks only that person and removes the other choices', async () => {
    const { store, q } = await saleWithOnlyJordan();
    const r = await requestIntro(store, alex, 'friendship', '', q.id);
    const { view } = await store.museContext();
    const first = view.db.intros.find((i) => i.id === r.intro!.id)!;
    const other = view.db.profiles.find((p) => ![alex, jordan].includes(p.id))!;
    const second = { ...first, id: crypto.randomUUID(), bId: other.id };
    await store.insertIntro(second);
    const { pickIntro } = await import('./service');
    const picked = (await pickIntro(store, alex, first.id, [second.id])).intro;
    expect(picked.state).toBe('waiting');
    const after = (await store.museContext()).view.db.intros;
    expect(after.find((i) => i.id === second.id)).toBeUndefined();
    expect(after.find((i) => i.id === first.id)?.status).toBe('a_accepted');
  });
});
