// The comic open house story (src/shared/seed/comics.ts): Theo's listing and Feed post, the
// linked Out Here plan at Inkwell Comics Café, and the Alex -> Jordan friendship intro.
import { beforeAll, describe, expect, it } from 'vitest';
import {
  COMIC_LISTING_ID, COMIC_QUEST_KEY, COMIC_VENUE, DEMO_CENTER, listingTag, profileId, seedId, walkingMinutesExact,
} from '@/shared';
import { createMemoryStore } from '@/features/data/server';
import { runIntroRound } from '@/features/intros/server/service';
import { trustPathOf } from '@/features/intros/server/rules';
import { buildSeed, loadContent, loadPlaces } from '../../scripts/seed';

const alex = profileId('alex');
const jordan = profileId('jordan');
const theo = profileId('theo');
const maya = profileId('maya');
const questId = seedId('quest', COMIC_QUEST_KEY);

beforeAll(() => { process.env.MUSE_MOCK = '1'; });

describe('comic open house seed rows', () => {
  const demoNow = new Date('2026-11-13T14:00:00Z'); // 6:00 AM PT, the morning reseed
  const { tables, warnings } = buildSeed(loadContent(false), loadPlaces(), { refDate: new Date('2026-11-13T14:00:00Z'), demoNow });
  const quest = tables.quests.find((q) => q.id === questId)!;
  const listing = tables.listings.find((l) => l.id === COMIC_LISTING_ID)!;

  it('builds without warnings about the story', () => {
    expect(warnings.filter((w) => /theo|comics|zines|sage/i.test(w))).toEqual([]);
  });

  it('has the listing by Theo and the plan he hosts, linked by a listing tag', () => {
    expect(listing.seller_id).toBe(theo);
    expect(listing.title).toBe('Box of indie comics: Night Courier #1–12 + 30 more');
    expect(listing.price_usd).toBe(60);
    expect(listing.description).toContain('Open house today at Inkwell Comics Café, come flip through');
    expect(quest.host_id).toBe(theo);
    expect(quest.title).toBe('Comics open house');
    expect(quest.venue_name).toBe(COMIC_VENUE);
    expect(quest.tags).toContain(listingTag(COMIC_LISTING_ID));
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

  it('Theo is a stranger to Alex and Jordan (no friendship or request rows)', () => {
    expect(tables.friendships.filter((f) => f.user_a === theo || f.user_b === theo)).toEqual([]);
  });

  it('Jordan has a past hangout with a crew and a memory photo', () => {
    const id = seedId('quest', 'past-jordan-zines');
    expect(tables.quest_members.filter((m) => m.quest_id === id).map((m) => m.user_id)).toContain(jordan);
    const crew = tables.crews.find((c) => c.origin_quest_id === id)!;
    expect(tables.crew_members.filter((m) => m.crew_id === crew.id)).toHaveLength(2);
    expect(tables.memories.find((m) => m.crew_id === crew.id)!.photo_url).toMatch(/^\/seed\//);
  });
});

describe('comic open house in the MemoryStore', () => {
  it("Alex sees Theo's post near the top of his Feed", async () => {
    const store = createMemoryStore();
    const { posts } = await store.feed(alex);
    const i = posts.findIndex((p) => p.id === seedId('post', 'p301'));
    expect(i).toBeGreaterThanOrEqual(0);
    expect(i).toBeLessThan(3);
    expect(posts[i].audience).toBe('public');
  });

  it('Alex sees the plan on the Out Here map', async () => {
    const store = createMemoryStore();
    const quests = await store.questsNear(alex, DEMO_CENTER);
    expect(quests.map((q) => q.id)).toContain(questId);
  });

  it('a friendship intro round for Alex picks Jordan via Maya, with a comics reason (mock)', async () => {
    const store = createMemoryStore();
    const { view } = await store.museContext();
    expect(view.areFriends(alex, jordan)).toBe(false);
    expect(trustPathOf(view, alex, jordan)!.label).toBe('You both know Maya');
    const r = await runIntroRound(store, alex, 'friendship');
    const intro = r.intro!;
    expect(intro.other.handle).toBe('jordan');
    expect(intro.kind).toBe('friendship');
    expect(intro.score).toBeGreaterThanOrEqual(85);
    expect(new Set(intro.reasons).size).toBeGreaterThanOrEqual(2);
    expect(intro.reasons.some((x) => /comic/i.test(x))).toBe(true);
    expect(intro.trustPath[0]).toBe('You both know Maya');
  });
});
