// The thrift story (src/shared/seed/thrift.ts): Leah's closet clean-out listing and Feed post,
// the linked "🧥 Closet sale + try-ons" plan at Willow Court Apartments, the general area before
// you are confirmed and Muse's exact-spot note after, and the Alex -> Jordan intro.
import { beforeAll, describe, expect, it } from 'vitest';
import {
  DEMO_CENTER, formatDemoTime, listingTag, profileId, seedId, THRIFT_AREA, THRIFT_LISTING_ID, THRIFT_MEET_SPOT, THRIFT_QUEST_ID,
  THRIFT_QUEST_KEY, THRIFT_VENUE, walkingMinutesExact,
} from '@/shared';
import { createMemoryStore } from '@/features/data/server';
import { listIntros, pickIntro, requestIntro, respondIntro, runIntroRound } from '@/features/intros/server/service';
import { trustPathOf } from '@/features/intros/server/rules';
import { buildSeed, loadContent, loadPlaces } from '../../scripts/seed';

const alex = profileId('alex');
const jordan = profileId('jordan');
const leah = profileId('leah');
const maya = profileId('maya');
const questId = THRIFT_QUEST_ID;
const ASK = 'someone into thrifting to go with';

beforeAll(() => { process.env.MUSE_MOCK = '1'; process.env.MUSE_QUIET = '1'; });

/** Alex's ask for the closet sale, then pick Jordan: both say yes, so both join the plan. */
async function askPickAccept(store = createMemoryStore()) {
  const r = await requestIntro(store, alex, 'friendship', ASK, questId);
  const pick = r.choices!.find((c) => c.other.handle === 'jordan')!;
  await pickIntro(store, alex, pick.introId, []);
  await respondIntro(store, jordan, pick.introId, true);
  return { store, introId: pick.introId };
}

describe('closet sale seed rows', () => {
  const demoNow = new Date('2026-11-13T14:00:00Z'); // 6:00 AM PT, the morning reseed
  const { tables, warnings } = buildSeed(loadContent(false), loadPlaces(), { refDate: new Date('2026-11-13T14:00:00Z'), demoNow });
  const quest = tables.quests.find((q) => q.id === questId)!;
  const listing = tables.listings.find((l) => l.id === THRIFT_LISTING_ID)!;

  it('builds without warnings about the story', () => {
    expect(warnings.filter((w) => /leah|closet|thrift|bea|grace/i.test(w))).toEqual([]);
  });

  it("has Leah's pickup listing and the plan she hosts, linked by a listing tag", () => {
    expect(listing.seller_id).toBe(leah);
    expect(listing.title).toBe('Closet clean-out: vintage denim jackets, band tees, sneakers, $5–25 each');
    expect(listing).toMatchObject({ pickup_label: THRIFT_AREA, pickup_spot: THRIFT_MEET_SPOT });
    expect(new Date(listing.pickup_until as string).getTime() - demoNow.getTime()).toBe(120 * 60_000);
    expect(quest.host_id).toBe(leah);
    expect(quest.title).toBe('Closet sale + try-ons');
    expect(quest.emoji).toBe('🧥');
    expect(quest.venue_name).toBe(THRIFT_VENUE);
    expect(quest.tags).toContain(listingTag(THRIFT_LISTING_ID));
    expect(quest).toMatchObject({ price_max: 0, capacity: 8, is_public: true, visibility: 'community', status: 'open' });
    const members = tables.quest_members.filter((m) => m.quest_id === questId).map((m) => m.user_id);
    expect(members).toHaveLength(3);
    for (const id of [alex, jordan, maya]) expect(members).not.toContain(id);
  });

  it('starts 30 min after seed time, lasts 2 h, and is an 8-11 min walk from Alex', () => {
    const starts = new Date(quest.starts_at as string).getTime();
    expect(starts - demoNow.getTime()).toBe(30 * 60_000);
    expect(new Date(quest.ends_at as string).getTime() - starts).toBe(120 * 60_000);
    const walk = walkingMinutesExact(DEMO_CENTER, { lat: quest.lat as number, lng: quest.lng as number });
    expect(walk).toBeGreaterThanOrEqual(8);
    expect(walk).toBeLessThanOrEqual(11);
  });

  it('Leah is a stranger to Alex and Jordan (no friendship or request rows)', () => {
    expect(tables.friendships.filter((f) => f.user_a === leah || f.user_b === leah)).toEqual([]);
  });

  it("Alex and Jordan never pre-react to the story's posts", () => {
    const posts = [seedId('post', 'p301'), seedId('post', 'p302')];
    const reactors = tables.reactions.filter((r) => posts.includes(r.post_id as string)).map((r) => r.user_id);
    expect(reactors.length).toBeGreaterThan(0);
    expect(reactors).not.toContain(alex);
    expect(reactors).not.toContain(jordan);
  });

  it("Leah's post has no relative time words that go stale", () => {
    const text = loadContent(false).posts.find((p) => p.id === 'p301')!.text;
    expect(text).toMatch(/^Closet sale today, come try stuff on 🧥/);
    expect(text).not.toMatch(/\bin (about )?(half an hour|\d+ min)|\btonight\b/i);
  });

  it("Jordan's past hangout is a thrift walk with a crew and a memory photo", () => {
    const id = seedId('quest', 'past-jordan-thrift-walk');
    expect(tables.quests.find((q) => q.id === id)!.title).toBe('Thrift walk');
    expect(tables.quest_members.filter((m) => m.quest_id === id).map((m) => m.user_id)).toContain(jordan);
    const crew = tables.crews.find((c) => c.origin_quest_id === id)!;
    expect(tables.crew_members.filter((m) => m.crew_id === crew.id)).toHaveLength(2);
    expect(tables.memories.find((m) => m.crew_id === crew.id)!.photo_url).toMatch(/^\/seed\//);
  });

  it('the quest key is stable', () => { expect(THRIFT_QUEST_KEY).toBe('closet-sale'); });
});

describe('closet sale in the MemoryStore', () => {
  it("Alex sees Leah's post near the top of his Feed, sharing the listing, not liked by him", async () => {
    const store = createMemoryStore();
    const { posts } = await store.feed(alex);
    const i = posts.findIndex((p) => p.id === seedId('post', 'p301'));
    expect(i).toBeGreaterThanOrEqual(0);
    expect(i).toBeLessThan(3);
    expect(posts[i].audience).toBe('public');
    expect(posts[i].viewerReaction ?? null).toBeNull();
    expect(posts[i].listing).toMatchObject({ id: THRIFT_LISTING_ID, priceUsd: 5 });
  });

  it('the listing page names the linked plan by its general area only', async () => {
    const store = createMemoryStore();
    const r = await store.listing(alex, THRIFT_LISTING_ID);
    expect(r.seller.handle).toBe('leah');
    expect(r.listing.pickupSpot).toBeNull();
    expect(r.plan).toMatchObject({ questId, title: 'Closet sale + try-ons', venueName: THRIFT_AREA });
  });
});

describe('exact spot: the general area until you are confirmed', () => {
  it('a non-member sees the fuzzed point and the area, never the exact spot', async () => {
    const store = createMemoryStore();
    const q = (await store.questsNear(alex, DEMO_CENTER)).find((x) => x.id === questId)!;
    const d = await store.quest(alex, questId);
    expect(d.meetSpot).toBeNull();
    expect(d.areaLabel).toBe(THRIFT_AREA);
    expect(q.location).toEqual(q.approxLocation);
    expect(JSON.stringify(d)).not.toContain(THRIFT_MEET_SPOT);
  });

  it('after joining, the pin is exact and Muse messages the exact spot in the chat with Leah', async () => {
    const store = createMemoryStore();
    const walkBefore = (await store.quest(alex, questId)).walkMinutes;
    await store.joinQuest(alex, questId);
    const d = await store.quest(alex, questId);
    expect(d.meetSpot).toBe(THRIFT_MEET_SPOT);
    // The walk is measured to the area before and after, so the number never changes.
    expect(d.walkMinutes).toBe(walkBefore);
    expect(d.quest.location).not.toEqual(d.quest.approxLocation);
    const thread = (await store.threads(alex)).find((t) => t.members.some((m) => m.id === leah) && t.members.length === 2)!;
    const msgs = await store.messages(alex, thread.id);
    const note = msgs.filter((m) => m.kind === 'muse');
    expect(note).toHaveLength(1);
    expect(note[0].text).toBe(
      `✨ Muse: You're confirmed for Leah's closet sale + try-ons at ${formatDemoTime(d.quest.startsAt)}. `
      + `Exact spot: ${THRIFT_MEET_SPOT}. Text Leah when you're here.`,
    );
    // Leaving and joining again does not send it twice.
    await store.leaveQuest(alex, questId);
    await store.joinQuest(alex, questId);
    expect((await store.messages(alex, thread.id)).filter((m) => m.kind === 'muse')).toHaveLength(1);
  });

  it("Leah accepting a hold on the listing shares the pickup spot with that buyer only", async () => {
    const store = createMemoryStore();
    const before = (await store.mapListings(alex)).find((m) => m.listing.id === THRIFT_LISTING_ID)!;
    expect(before.exact).toBe(false);
    expect(before.listing.pickupSpot).toBeNull();
    const held = await store.requestHold(alex, THRIFT_LISTING_ID, { offerUsd: 8, etaMin: 15, message: 'the M denim jacket?' });
    await store.respondHold(leah, held.listing.myHold!.id, true);
    const after = (await store.mapListings(alex)).find((m) => m.listing.id === THRIFT_LISTING_ID)!;
    expect(after.listing.pickupSpot).toBe(THRIFT_MEET_SPOT);
    const thread = (await store.threads(alex)).find((t) => t.members.some((m) => m.id === leah) && t.members.length === 2)!;
    const note = (await store.messages(alex, thread.id)).find((m) => m.kind === 'muse')!;
    expect(note.text).toContain(`Exact spot: ${THRIFT_MEET_SPOT}`);
    const other = (await store.mapListings(jordan)).find((m) => m.listing.id === THRIFT_LISTING_ID)!;
    expect(other.listing.pickupSpot).toBeNull();
  });
});

describe('the Alex -> Jordan intro', () => {
  it('a friendship round picks Jordan via Maya at 85+, with 3 reasons including thrifting, first step the closet sale', async () => {
    const store = createMemoryStore();
    const { view } = await store.museContext();
    expect(view.areFriends(alex, jordan)).toBe(false);
    expect(trustPathOf(view, alex, jordan)!.label).toBe('You both know Maya');
    const r = await runIntroRound(store, alex, 'friendship');
    const intro = r.intro!;
    expect(intro.other.handle).toBe('jordan');
    expect(intro.kind).toBe('friendship');
    expect(intro.score).toBeGreaterThanOrEqual(85);
    expect(new Set(intro.reasons).size).toBe(3);
    expect(intro.reasons.some((x) => /thrifting/i.test(x))).toBe(true);
    expect(intro.trustPath[0]).toBe('You both know Maya');
    expect(intro.step.href).toContain(questId);
    expect(intro.step.label).toBe(`🧥 Closet sale + try-ons at ${THRIFT_AREA}`);
  });

  it('a plan ask on a fresh seed offers 2-3 people, all 85+, Jordan first, each with a why', async () => {
    const store = createMemoryStore();
    const r = await requestIntro(store, alex, 'friendship', ASK, questId);
    expect(r.intro).toBeNull();
    const cs = r.choices!;
    expect(cs.length).toBeGreaterThanOrEqual(2);
    expect(cs.length).toBeLessThanOrEqual(3);
    expect(cs[0].other.handle).toBe('jordan');
    expect(cs[0].trustPath).toBe('You both know Maya');
    expect(cs[0].why).toMatch(/thrifting/);
    for (const c of cs) {
      expect(c.score).toBeGreaterThanOrEqual(85);
      expect(c.trustPath).not.toBe('');
      expect(c.why.length).toBeGreaterThan(10);
    }
    for (const c of cs.slice(1)) expect(c.score).toBeLessThan(cs[0].score);
    expect(new Set(cs.map((c) => c.other.id)).size).toBe(cs.length);
  });

  it('asking again or reloading never duplicates choices, and choices stay out of the inbox', async () => {
    const store = createMemoryStore();
    const first = await requestIntro(store, alex, 'friendship', ASK, questId);
    const second = await requestIntro(store, alex, 'friendship', ASK, questId);
    expect(second.choices!.map((c) => c.other.handle)).toEqual(first.choices!.map((c) => c.other.handle));
    const listed = await listIntros(store, alex);
    expect(listed.intros).toHaveLength(0);
    expect(listed.choices.map((c) => c.introId).sort()).toEqual(second.choices!.map((c) => c.introId).sort());
    const { view } = await store.museContext();
    const rows = view.db.intros.filter((i) => i.aId === alex && i.firstStep.questId === questId);
    expect(rows).toHaveLength(second.choices!.length);
    // Nobody is asked before Alex picks, and a choice cannot be answered except by picking it.
    expect((await listIntros(store, jordan)).intros).toHaveLength(0);
    await expect(respondIntro(store, alex, second.choices![0].introId, true)).rejects.toMatchObject({ status: 409 });
  });

  it('picking Jordan asks only Jordan; after both say yes both are on the plan and Muse reveals the exact spot', async () => {
    const { store, introId } = await askPickAccept();
    const { view } = await store.museContext();
    expect(view.db.intros.filter((i) => i.aId === alex && i.firstStep.questId === questId).map((i) => i.id)).toEqual([introId]);
    const members = view.questMemberIds(questId);
    expect(members).toContain(alex);
    expect(members).toContain(jordan);
    const a = (await listIntros(store, alex)).intros[0];
    expect(a.state).toBe('connected');
    expect(a.step.href).toContain(questId);
    expect(a.plan!.held).toBe(true);
    expect(a.plan!.reveal).toContain(`Exact spot: ${THRIFT_MEET_SPOT}`);
    expect(a.plan!.walkMinutes).toBeGreaterThan(0);
    expect(a.plan!.reveal).toContain(`${a.plan!.walkMinutes} min walk for you`);
    const chat = await store.messages(alex, a.threadId!);
    expect(chat.some((m) => m.kind === 'muse' && m.text.includes(`Exact spot: ${THRIFT_MEET_SPOT}`))).toBe(true);
    // Each of them also gets Leah's confirmation with the spot.
    for (const who of [alex, jordan]) {
      const t = (await store.threads(who)).find((x) => x.members.some((m) => m.id === leah) && x.members.length === 2)!;
      expect((await store.messages(who, t.id)).some((m) => m.kind === 'muse' && m.text.includes(THRIFT_MEET_SPOT))).toBe(true);
    }
  });

  it('the start time on the intro card, the plan page and the Muse notes is the same, to the minute', async () => {
    const { store } = await askPickAccept();
    const d = await store.quest(alex, questId);
    const clock = formatDemoTime(d.quest.startsAt);
    const a = (await listIntros(store, alex)).intros[0];
    expect(a.step.when).toBe(`Today ${clock}`);
    expect(a.plan!.reveal).toContain(clock);
    const notes = (await store.messages(alex, a.threadId!)).filter((m) => m.kind === 'muse');
    for (const n of notes) {
      const times = n.text.match(/\d{1,2}:\d{2} [AP]M/g) ?? [];
      for (const t of times) expect(t).toBe(clock);
    }
    const leahThread = (await store.threads(alex)).find((x) => x.members.some((m) => m.id === leah) && x.members.length === 2)!;
    expect((await store.messages(alex, leahThread.id)).find((m) => m.kind === 'muse')!.text).toContain(`at ${clock}.`);
  });

  it("the walk on the intro card is the plan sheet's walk", async () => {
    const { store } = await askPickAccept();
    const a = (await listIntros(store, alex)).intros[0];
    const d = await store.quest(alex, questId);
    expect(a.plan!.walkMinutes).toBe(d.walkMinutes);
  });
});

describe('the mock Muse plan for a thrifting ask', () => {
  it('"free for an hour, want someone into thrifting to go with" ranks the closet sale first', async () => {
    const { plan } = await import('@/features/muse');
    const { buildStorePlanContext } = await import('@/features/outhere/server/plan-context');
    const store = createMemoryStore();
    const now = new Date();
    const context = await buildStorePlanContext({ userId: alex, location: null, now }, store);
    const { plan: out } = await plan({ text: 'free for an hour, want someone into thrifting to go with', userId: alex, location: null, now, context });
    expect(out.intent.activities).toContain('thrifting');
    expect(out.suggestions[0]?.questId).toBe(questId);
  });
});
