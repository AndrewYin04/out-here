// Plan-anchored intros ("find someone to go to THIS plan with", issue #44): who can be a
// candidate for a plan, the interest-to-plan reason, and both people joining on double accept.
import { beforeAll, describe, expect, it } from 'vitest';
import { offsetPoint, profileId, type ID } from '@/shared';
import { createMemoryStore, type DataStore } from '@/features/data/server';
import { candidatesFor, factsFor, freeForPlan, planFacts } from './rules';
import { requestIntro, respondIntro } from './service';

const alex = profileId('alex');
const jordan = profileId('jordan');

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
    const q = await questByTitle(store, 'Thrift walk on Willow');
    const [f] = planFacts(view, view.profileById.get(alex)!, view.profileById.get(jordan)!, q);
    expect(f.forA).toBe('Jordan is into thrifting, a fit for 🧥 Thrift walk on Willow');
    expect(f.forB).toBe('Alex wants company for 🧥 Thrift walk on Willow, and you\'re into thrifting');
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
    const { q, id } = await anchored(store, 'Bouldering intro');
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
    expect(notes).toHaveLength(1);
    expect(notes[0].text).toContain(`You're both going to ${q.emoji} ${q.title} at ${q.venueName}`);
    expect(notes[0].text).toMatch(/about a \d+ min walk for Alex and \d+ min for Jordan/);
    const card = (await respondIntro(store, alex, id, true)).intro;
    expect(card.plan?.held).toBe(true);
    expect(card.step.href).toContain(q.id);
  });

  it('a plan that filled up still connects, and Muse suggests the next one', async () => {
    const store = createMemoryStore();
    const { q, id } = await anchored(store, 'Pho run');
    // Two other people take the last 2 seats before Jordan says yes.
    const { view } = await store.museContext();
    const members = view.questMemberIds(q.id);
    const others = view.db.profiles.filter((p) => ![alex, jordan, ...members].includes(p.id)).slice(0, 2);
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
    expect(notes[0].text).toContain(`${q.emoji} ${q.title} at ${q.venueName} filled up before you both said yes.`);
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
