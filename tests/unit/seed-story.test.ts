import { describe, expect, it } from 'vitest';
import { DEMO_CENTER, DEMO_QUESTS, MAX_WALK_MINUTES, PAST_HANGOUTS, profileId, seedId, walkingMinutes, walkingMinutesExact } from '@/shared';
import { buildSeed, loadContent, loadPlaces } from '../../scripts/seed';

const places = loadPlaces().places;
const place = (name: string) => {
  const p = places.find((x) => x.name === name);
  if (!p) throw new Error(`missing place ${name}`);
  return p;
};
const walk = (name: string) => walkingMinutes(DEMO_CENTER, place(name));
const quest = (key: string) => DEMO_QUESTS.find((q) => q.key === key)!;

describe('places', () => {
  it('has the 18 places, all within ~2.2 km walking range of DEMO_CENTER', () => {
    expect(places).toHaveLength(18);
    for (const p of places) expect(walkingMinutesExact(DEMO_CENTER, p)).toBeLessThan(36); // 2.2 km × 1.3 / 80
  });
  it('every quest uses a known place', () => {
    for (const q of [...DEMO_QUESTS, ...PAST_HANGOUTS]) expect(() => place(q.placeName)).not.toThrow();
  });
});

describe('demo story: "hungry, got like 40 min, under $15"', () => {
  const budget = 15;
  const inWindow = (mins: number) =>
    DEMO_QUESTS.filter((q) => q.category === 'food' && q.startsInMin >= 0 && q.startsInMin <= mins);

  it('has exactly three food quests starting in the 40 min window', () => {
    expect(inWindow(40).map((q) => q.placeName).sort()).toEqual(['Dumpling Den', 'Kaiten Bay', 'Noodle Theory']);
  });

  it('walking minutes (haversine × 1.3 / 80) are ~9, ~28 and sushi is $26', () => {
    expect(walk('Dumpling Den')).toBe(9);
    expect(walk('Noodle Theory')).toBe(28);
    expect(quest('sushi').priceMax).toBe(26);
    expect(walk('Kaiten Bay')).toBeLessThanOrEqual(MAX_WALK_MINUTES);
  });

  it('only Dumpling Den fits: 2 seats left, $12, starts in 25 min', () => {
    const fits = inWindow(40).filter((q) => walk(q.placeName) <= MAX_WALK_MINUTES && q.priceMax <= budget
      && walk(q.placeName) <= q.startsInMin);
    expect(fits.map((q) => q.key)).toEqual(['dumplings']);
    const d = quest('dumplings');
    expect(d.capacity - d.memberCount).toBe(2);
    expect(d.priceMax).toBe(12);
    expect(d.startsInMin).toBe(25);
    expect(d.groupSlug).toBe('cheap-eats-south-bay');
  });

  it('the boba quest is in the afternoon, so "45 minutes, boba" has no posted plan and Muse drafts one', () => {
    expect(inWindow(15)).toHaveLength(0);
    const b = quest('boba');
    expect(walk(b.placeName)).toBe(4);
    expect(b.priceMax).toBe(7);
    expect(b.startsInMin).toBe(150);
    const bobaIn45 = DEMO_QUESTS.filter((q) => q.startsInMin <= 45 && q.tags.includes('boba'));
    expect(bobaIn45).toEqual([]);
  });

  it('has the kit 15 quests plus the ramen and sushi decoys, and one live Group-only plan', () => {
    expect(DEMO_QUESTS).toHaveLength(18);
    const group = DEMO_QUESTS.filter((q) => q.visibility === 'group');
    expect(group.map((q) => q.key)).toEqual(['new-grads-frisbee']);
    expect(group[0].startsInMin).toBeLessThan(0);
  });
});

describe('buildSeed with the fixture content', () => {
  const now = new Date('2026-11-13T18:45:00Z');
  const { tables } = buildSeed(loadContent(true), loadPlaces(), { refDate: new Date('2026-11-13T18:00:00Z'), demoNow: now });

  it('dumpling quest: capacity 4, 2 members (not Alex or Maya), group set, starts in 25 min', () => {
    const id = seedId('quest', 'dumplings');
    const q = tables.quests.find((r) => r.id === id)!;
    expect(q.capacity).toBe(4);
    expect(new Date(q.starts_at as string).getTime() - now.getTime()).toBe(25 * 60_000);
    expect(q.group_id).toBe(seedId('group', 'cheap-eats-south-bay'));
    const members = tables.quest_members.filter((m) => m.quest_id === id).map((m) => m.user_id);
    expect(members).toHaveLength(2);
    expect(members).not.toContain(profileId('alex'));
    expect(members).not.toContain(profileId('maya'));
    // approximate location is fuzzed, not exact
    expect(q.approx_lat === q.lat && q.approx_lng === q.lng).toBe(false);
  });

  it("Maya's availability runs now to now+90 (free after class), friends-only", () => {
    const a = tables.availability.find((r) => r.user_id === profileId('maya'))!;
    expect(new Date(a.starts_at as string).getTime() - now.getTime()).toBe(0);
    expect(new Date(a.ends_at as string).getTime() - now.getTime()).toBe(90 * 60_000);
    expect(a.audience).toBe('friends');
  });

  it('Alex has 6 weekly past hangouts and 3 crews with memories', () => {
    const done = tables.quests.filter((q) => q.status === 'done').map((q) => q.id);
    const alexDone = tables.quest_members.filter((m) => done.includes(m.quest_id) && m.user_id === profileId('alex'));
    expect(alexDone).toHaveLength(6);
    expect(tables.crews).toHaveLength(3);
    expect(tables.memories.length).toBeGreaterThanOrEqual(3);
  });

  it('is deterministic for the same clock', () => {
    const again = buildSeed(loadContent(true), loadPlaces(), { refDate: new Date('2026-11-13T18:00:00Z'), demoNow: now });
    expect(again.tables).toEqual(tables);
  });

  it('friendships are normalized and no one is their own friend', () => {
    for (const f of tables.friendships) expect((f.user_a as string) < (f.user_b as string)).toBe(true);
  });
});
