// Event creation in Out Here: who can see a plan, the daily cap, check-ins, reports,
// attendee privacy, and posts on a plan's page.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  canSeeQuest, profileId, seedId, setNow,
  type QuestVisibility, type QuestVisibilityContext,
} from '@/shared';
import { createMemoryStore } from '@/features/data/memory-store';
import { subscribe, type RealtimeMessage } from '@/features/data/realtime-server';
import { EVENTS_PER_DAY, type CoreStore } from '@/features/data/core';
import type { View } from '@/features/data/view';

const alex = profileId('alex');
const maya = profileId('maya');
const frisbee = seedId('quest', 'new-grads-frisbee');
const newGrads = seedId('group', 'menlo-park-new-grads');
const NOW = new Date('2026-11-12T18:07:00Z');
const SPOT = { lat: 37.4855, lng: -122.149 };

let store: CoreStore;
beforeEach(() => { setNow(NOW); store = createMemoryStore(NOW); });
afterAll(() => setNow(null));

const base = (over: Partial<Parameters<CoreStore['createQuest']>[1]> = {}) => ({
  title: 'Boba after class', emoji: '🧋', category: 'food' as const, description: '', venueName: 'Dropped pin',
  location: SPOT, startsAt: new Date(NOW.getTime() + 30 * 60_000).toISOString(),
  endsAt: new Date(NOW.getTime() + 90 * 60_000).toISOString(), capacity: 6, priceMax: 8, tags: [],
  groupId: null, placeId: null, ...over,
});

/** A person who is not the host, not a friend of the host, and shares no friend with them. */
function strangerTo(v: View, hostId: string): string {
  return v.db.profiles.map((p) => p.id).find((id) => id !== hostId && !v.areFriends(id, hostId) && v.mutualIds(id, hostId).length === 0)!;
}
/** A friend of a friend of the host who is not the host's friend. */
function friendOfFriend(v: View, hostId: string): string {
  return v.db.profiles.map((p) => p.id).find((id) => id !== hostId && !v.areFriends(id, hostId) && v.mutualIds(id, hostId).length > 0)!;
}

describe('canSeeQuest (shared rule)', () => {
  const ctx = (over: Partial<QuestVisibilityContext> = {}): QuestVisibilityContext => ({
    isMemberOrHost: false, isGroupMember: false, areFriendsWithHost: false, hasMutualWithHost: false,
    isInvited: false, hasReported: false, ...over,
  });
  const q = (visibility: QuestVisibility) => ({ visibility, groupId: visibility === 'group' ? 'g' : null });
  const cases: [string, Partial<QuestVisibilityContext>, Record<QuestVisibility, boolean>][] = [
    ['stranger', {}, { community: true, group: false, open: false, friends: false }],
    ['friend of host', { areFriendsWithHost: true }, { community: true, group: false, open: true, friends: false }],
    ['friend of a friend', { hasMutualWithHost: true }, { community: true, group: false, open: true, friends: false }],
    ['group member', { isGroupMember: true }, { community: true, group: true, open: false, friends: false }],
    ['invited friend', { areFriendsWithHost: true, isInvited: true }, { community: true, group: false, open: true, friends: true }],
    ['member', { isMemberOrHost: true }, { community: true, group: true, open: true, friends: true }],
    ['reporter', { hasReported: true, areFriendsWithHost: true, isGroupMember: true, isInvited: true },
      { community: false, group: false, open: false, friends: false }],
  ];
  for (const [who, over, want] of cases) {
    it(`${who}`, () => {
      for (const v of ['community', 'group', 'open', 'friends'] as const) expect([v, canSeeQuest(q(v), ctx(over))]).toEqual([v, want[v]]);
    });
  }
  it('a group plan without a group is hidden', () => {
    expect(canSeeQuest({ visibility: 'group', groupId: null }, ctx({ isGroupMember: true }))).toBe(false);
  });
});

describe('creating plans', () => {
  it('a community plan: host takes the first seat, everyone sees it, quests:new carries the id only', async () => {
    const got: RealtimeMessage[] = [];
    const off = subscribe((m) => got.push(m));
    let id = '';
    try {
      const quest = await store.createQuest(alex, { ...base(), visibility: 'community', bubbleText: '  come thru  ' });
      id = quest.id;
      expect(quest.memberIds).toEqual([alex]);
      expect(quest.visibility).toBe('community');
      expect(quest.isPublic).toBe(true);
      expect(quest.bubbleText).toBe('come thru');
    } finally { off(); }
    expect(got.find((m) => m.channel === 'quests:new')?.payload).toEqual({ questId: id });
    const v = await store.view();
    const near = await store.questsNear(strangerTo(v, alex), SPOT, 2000);
    expect(near.map((q) => q.id)).toContain(id);
  });

  it('a group plan needs a group, and membership to post it', async () => {
    await expect(store.createQuest(alex, { ...base(), visibility: 'group' })).rejects.toMatchObject({ status: 400 });
    const v = await store.view();
    const notIn = v.db.groups.find((g) => !v.groupRole(g.id, alex))!;
    await expect(store.createQuest(alex, { ...base(), visibility: 'group', groupId: notIn.id })).rejects.toMatchObject({ status: 403 });
  });

  it('a group plan reaches group members only', async () => {
    const quest = await store.createQuest(alex, { ...base(), visibility: 'group', groupId: newGrads });
    const v = await store.view();
    const member = v.groupMemberIds(newGrads).find((id) => id !== alex)!;
    const outsider = v.db.profiles.map((p) => p.id).find((id) => !v.groupRole(newGrads, id))!;
    expect((await store.questsNear(member, SPOT, 2000)).map((q) => q.id)).toContain(quest.id);
    expect((await store.questsNear(outsider, SPOT, 2000)).map((q) => q.id)).not.toContain(quest.id);
    await expect(store.quest(outsider, quest.id)).rejects.toMatchObject({ status: 404 });
  });

  it('an open hangout reaches friends and friends of friends, not strangers', async () => {
    const quest = await store.createQuest(alex, { ...base(), visibility: 'open' });
    const v = await store.view();
    const ids = async (who: string) => (await store.questsNear(who, SPOT, 2000)).map((q) => q.id);
    expect(await ids(maya)).toContain(quest.id);
    expect(await ids(friendOfFriend(v, alex))).toContain(quest.id);
    expect(await ids(strangerTo(v, alex))).not.toContain(quest.id);
  });

  it('a friends plan is invite only, and the invite goes out', async () => {
    await expect(store.createQuest(alex, { ...base(), visibility: 'friends' })).rejects.toMatchObject({ status: 400 });
    const v = await store.view();
    const otherFriend = [...v.friendIds(alex)].find((id) => id !== maya)!;
    const quest = await store.createQuest(alex, { ...base(), visibility: 'friends', inviteIds: [maya] });
    expect((await store.questsNear(maya, SPOT, 2000)).map((q) => q.id)).toContain(quest.id);
    expect((await store.questsNear(otherFriend, SPOT, 2000)).map((q) => q.id)).not.toContain(quest.id);
    const invites = (await store.view()).db.invites.filter((i) => i.questId === quest.id);
    expect(invites.map((i) => i.toId)).toEqual([maya]);
  });

  it('invites go to friends only', async () => {
    const v = await store.view();
    await expect(store.createQuest(alex, { ...base(), visibility: 'friends', inviteIds: [strangerTo(v, alex)] }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('seeded plans never count toward the cap (Sam hosts several and can still post)', async () => {
    const sam = profileId('sam');
    const v = await store.view();
    expect(v.db.quests.filter((q) => q.hostId === sam).length).toBeGreaterThanOrEqual(EVENTS_PER_DAY);
    await expect(store.createQuest(sam, { ...base(), visibility: 'community' })).resolves.toMatchObject({ hostId: sam });
  });

  it(`caps posting at ${EVENTS_PER_DAY} plans a day (429)`, async () => {
    for (let i = 0; i < EVENTS_PER_DAY; i++) await store.createQuest(maya, { ...base(), title: `plan ${i}`, visibility: 'community' });
    await expect(store.createQuest(maya, { ...base(), visibility: 'community' })).rejects.toMatchObject({ status: 429 });
  });
});

describe('plan page details', () => {
  it('strangers see the count, never who is going', async () => {
    const quest = await store.createQuest(alex, { ...base(), visibility: 'community' });
    await store.joinQuest(maya, quest.id);
    const v = await store.view();
    const stranger = strangerTo(v, alex);
    const seen = await store.quest(stranger, quest.id);
    expect(seen.canSeeGuests).toBe(false);
    expect(seen.members).toEqual([]);
    expect(seen.memberCount).toBe(2);
    expect(seen.quest.memberIds).toHaveLength(2);
    expect(seen.quest.memberIds).not.toContain(maya);
    const friend = await store.quest(maya, quest.id);
    expect(friend.canSeeGuests).toBe(true);
    expect(friend.members.map((m) => m.id).sort()).toEqual([alex, maya].sort());
  });

  it('the seeded frisbee plan is live with check-ins, and Group-only', async () => {
    const d = await store.quest(alex, frisbee);
    expect(d.isLive).toBe(true);
    expect(d.hereCount).toBe(4);
    expect(d.group?.slug).toBe('menlo-park-new-grads');
    await expect(store.quest(maya, frisbee)).rejects.toMatchObject({ status: 404 });
  });

  it('check-in: members only, at the spot, while live', async () => {
    const v = await store.view();
    const exact = v.questById.get(frisbee)!.location;
    await expect(store.checkIn(alex, frisbee, exact)).rejects.toMatchObject({ status: 403 });
    await store.joinQuest(alex, frisbee);
    await expect(store.checkIn(alex, frisbee, { lat: exact.lat + 0.01, lng: exact.lng })).rejects.toMatchObject({ status: 400 });
    const got: RealtimeMessage[] = [];
    const off = subscribe((m) => got.push(m));
    try {
      expect(await store.checkIn(alex, frisbee, exact)).toEqual({ hereCount: 5 });
      expect(await store.checkIn(alex, frisbee, exact)).toEqual({ hereCount: 5 });
    } finally { off(); }
    expect(got.find((m) => m.channel === `quest:${frisbee}`)?.payload).toMatchObject({ hereCount: 5 });
    expect((await store.quest(alex, frisbee)).viewerCheckedIn).toBe(true);
  });

  it('check-in is closed until 15 min before the start', async () => {
    const quest = await store.createQuest(alex, { ...base(), visibility: 'community' });
    await expect(store.checkIn(alex, quest.id, SPOT)).rejects.toMatchObject({ status: 400 });
    setNow(new Date(NOW.getTime() + 20 * 60_000));
    expect(await store.checkIn(alex, quest.id, SPOT)).toEqual({ hereCount: 1 });
  });

  it('reporting hides the plan from the reporter only', async () => {
    const quest = await store.createQuest(alex, { ...base(), visibility: 'community' });
    await expect(store.reportQuest(alex, quest.id, 'mine')).rejects.toMatchObject({ status: 400 });
    await store.reportQuest(maya, quest.id, 'spam');
    await store.reportQuest(maya, quest.id, 'spam again');
    expect((await store.view()).db.questReports.filter((r) => r.questId === quest.id)).toHaveLength(1);
    expect((await store.questsNear(maya, SPOT, 2000)).map((q) => q.id)).not.toContain(quest.id);
    const v = await store.view();
    expect((await store.questsNear(strangerTo(v, alex), SPOT, 2000)).map((q) => q.id)).toContain(quest.id);
  });

  it('posts on a plan follow the plan\'s visibility', async () => {
    const quest = await store.createQuest(alex, { ...base(), visibility: 'group', groupId: newGrads });
    const post = await store.createPost(alex, { text: 'Bringing cards', audience: 'public', target: { type: 'quest', id: quest.id } });
    const v = await store.view();
    const member = v.groupMemberIds(newGrads).find((id) => id !== alex)!;
    const outsider = v.db.profiles.map((p) => p.id).find((id) => !v.groupRole(newGrads, id))!;
    expect((await store.questPosts(member, quest.id)).map((p) => p.id)).toEqual([post.id]);
    await expect(store.questPosts(outsider, quest.id)).rejects.toMatchObject({ status: 404 });
    await expect(store.post(outsider, post.id)).rejects.toMatchObject({ status: 404 });
    await expect(store.createPost(outsider, { text: 'hi', audience: 'public', target: { type: 'quest', id: quest.id } }))
      .rejects.toMatchObject({ status: 404 });
    expect((await store.quest(member, quest.id)).postCount).toBe(1);
  });
});
