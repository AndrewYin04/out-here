import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { profileId, seedId, setNow } from '@/shared';
import { createMemoryStore } from '@/features/data/memory-store';
import { subscribe, type RealtimeMessage } from '@/features/data/realtime-server';
import type { CoreStore } from '@/features/data/core';

const alex = profileId('alex');
const maya = profileId('maya');
const dumplings = seedId('quest', 'dumplings');

let store: CoreStore;
const NOW = new Date('2026-11-12T18:07:00Z');
beforeEach(() => { setNow(NOW); store = createMemoryStore(NOW); });
afterAll(() => setNow(null));

describe('MemoryStore: visibility', () => {
  it('a friends-only post is invisible to a non-friend and visible to a friend', async () => {
    const v = await store.view();
    const post = v.db.posts.find((p) => p.targetType === 'profile' && p.audience === 'friends'
      && v.db.profiles.some((x) => x.id !== p.authorId && !v.areFriends(x.id, p.authorId)))!;
    expect(post).toBeTruthy();
    const stranger = v.db.profiles.find((x) => x.id !== post.authorId && !v.areFriends(x.id, post.authorId))!;
    const friend = [...v.friendIds(post.authorId)][0];
    expect(v.canSeePost(stranger.id, post)).toBe(false);
    expect(v.canSeePost(friend, post)).toBe(true);
    await expect(store.post(stranger.id, post.id)).rejects.toMatchObject({ status: 404 });
    const author = v.profileById.get(post.authorId)!;
    const timeline = await store.profilePosts(stranger.id, author.handle);
    expect(timeline.posts.map((p) => p.id)).not.toContain(post.id);
  });

  it('profile fields follow fieldVisibility (Maya\'s job is friends-only)', async () => {
    const v = await store.view();
    const mayaJob = v.profileById.get(maya)!.job;
    expect(mayaJob).toBeTruthy();
    const stranger = v.db.profiles.find((p) => p.id !== maya && !v.areFriends(p.id, maya))!;
    expect((await store.profile(alex, 'maya')).profile.job).toBe(mayaJob);
    expect((await store.profile(stranger.id, 'maya')).profile.job).toBeNull();
  });

  it('the feed only holds posts the viewer may see', async () => {
    const v = await store.view();
    let cursor: string | null = null;
    let seen = 0;
    do {
      const page = await store.feed(alex, cursor);
      for (const p of page.posts) expect(v.canSeePost(alex, v.postById.get(p.id)!)).toBe(true);
      seen += page.posts.length;
      cursor = page.nextCursor;
    } while (cursor && seen < 200);
    expect(seen).toBeGreaterThan(0);
  });
});

describe('MemoryStore: friends', () => {
  it('mutual friends are symmetric', async () => {
    const ab = (await store.mutualFriends(alex, 'maya')).map((p) => p.id).sort();
    const ba = (await store.mutualFriends(maya, 'alex')).map((p) => p.id).sort();
    expect(ab).toEqual(ba);
    const v = await store.view();
    for (const id of ab) expect(v.areFriends(alex, id) && v.areFriends(maya, id)).toBe(true);
  });

  it('suggestions are ranked by mutual friend count and exclude friends', async () => {
    const s = await store.suggestions(alex);
    for (let i = 1; i < s.length; i++) expect(s[i - 1].mutualFriendCount).toBeGreaterThanOrEqual(s[i].mutualFriendCount);
    expect(s.some((p) => p.isFriend || p.id === alex)).toBe(false);
  });
});

describe('MemoryStore: join_quest semantics', () => {
  it('joining twice is idempotent', async () => {
    const before = await store.quest(alex, dumplings);
    expect(before.seatsLeft).toBe(2);
    const first = await store.joinQuest(alex, dumplings);
    const second = await store.joinQuest(alex, dumplings);
    expect(first.seatsLeft).toBe(1);
    expect(second.seatsLeft).toBe(1);
    expect(second.quest.memberIds.filter((m) => m === alex)).toHaveLength(1);
  });

  it('exact location only for members', async () => {
    const before = await store.quest(alex, dumplings);
    const v = await store.view();
    const exact = v.questById.get(dumplings)!.location;
    expect(before.quest.location).not.toEqual(exact);
    const after = await store.joinQuest(alex, dumplings);
    expect(after.quest.location).toEqual(exact);
  });

  it('joining a full quest fails with 409 quest_full, and leaving reopens it', async () => {
    const v = await store.view();
    const outsiders = v.db.profiles.map((p) => p.id).filter((id) => !v.questMemberIds(dumplings).includes(id));
    await store.joinQuest(outsiders[0], dumplings);
    const full = await store.joinQuest(outsiders[1], dumplings);
    expect(full.seatsLeft).toBe(0);
    expect(full.quest.status).toBe('full');
    await expect(store.joinQuest(outsiders[2], dumplings)).rejects.toMatchObject({ status: 409, message: 'quest_full' });
    const left = await store.leaveQuest(outsiders[1], dumplings);
    expect(left.seatsLeft).toBe(1);
    expect(left.quest.status).toBe('open');
  });

  it('join with a friend takes both seats or none', async () => {
    const v = await store.view();
    const outsider = v.db.profiles.map((p) => p.id).find((id) => !v.questMemberIds(dumplings).includes(id) && id !== alex && id !== maya)!;
    await store.joinQuest(outsider, dumplings);           // 1 seat left
    await expect(store.joinQuest(alex, dumplings, maya)).rejects.toMatchObject({ status: 409 });
    const q = await store.quest(alex, dumplings);
    expect(q.quest.memberIds).not.toContain(alex);
    expect(q.quest.memberIds).not.toContain(maya);
  });

  it('publishes quest:<id> with seatsLeft and memberCount after a join', async () => {
    const got: RealtimeMessage[] = [];
    const off = subscribe((m) => got.push(m));
    try {
      await store.joinQuest(alex, dumplings);
    } finally { off(); }
    const m = got.find((x) => x.channel === `quest:${dumplings}`);
    expect(m?.payload).toEqual({ seatsLeft: 1, memberCount: 3 });
  });
});

describe('MemoryStore: invites and availability', () => {
  it('accepting an invite joins the quest (invitee and inviter)', async () => {
    const invite = await store.createInvite(alex, { toId: maya, questId: dumplings, suggestionTitle: 'Dumplings?', message: 'Dumplings in 25?' });
    expect((await store.invites(maya)).incoming.map((i) => i.id)).toContain(invite.id);
    const res = await store.respondInvite(maya, invite.id, 'accepted');
    expect(res.invite.status).toBe('accepted');
    expect(res.quest?.memberIds).toEqual(expect.arrayContaining([alex, maya]));
    expect((await store.quest(maya, dumplings)).seatsLeft).toBe(0);
    const thread = (await store.threads(maya)).find((t) => t.memberIds.includes(alex) && !t.isGroup)!;
    expect(thread.lastMessage?.kind).toBe('invite');
  });

  it('only the invitee can respond', async () => {
    const invite = await store.createInvite(alex, { toId: maya, questId: dumplings, suggestionTitle: 'x', message: '' });
    await expect(store.respondInvite(alex, invite.id, 'accepted')).rejects.toMatchObject({ status: 403 });
  });

  it('availability is friends-only', async () => {
    const v = await store.view();
    const stranger = v.db.profiles.find((p) => p.id !== alex && !v.areFriends(p.id, alex))!;
    const a = await store.createAvailability(alex, {
      text: 'free for food', startsAt: '2026-11-12T18:10:00Z', endsAt: '2026-11-12T19:00:00Z', location: { lat: 37.4847, lng: -122.1477 },
    });
    expect((await store.friendAvailability(maya)).map((x) => x.id)).toContain(a.id);
    expect((await store.friendAvailability(stranger.id)).map((x) => x.id)).not.toContain(a.id);
  });
});

describe('MemoryStore: posts, comments, friend requests', () => {
  it('reactions set and clear one of 7 per viewer', async () => {
    const post = (await store.feed(alex)).posts[0];
    const r1 = await store.react(alex, post.id, 'love');
    expect(r1.viewerReaction).toBe('love');
    const r2 = await store.react(alex, post.id, 'haha');
    expect(r2.reactionCounts.haha).toBe(r1.reactionCounts.haha + 1);
    expect(r2.reactionCounts.love).toBe(r1.reactionCounts.love - 1);
    const r3 = await store.react(alex, post.id, null);
    expect(r3.viewerReaction).toBeNull();
  });

  it('a reply to a reply attaches to the top-level comment', async () => {
    const post = (await store.feed(alex)).posts[0];
    const top = await store.addComment(alex, post.id, 'top');
    const reply = await store.addComment(maya, post.id, 'reply', top.id);
    const nested = await store.addComment(alex, post.id, 'nested', reply.id);
    expect(nested.parentId).toBe(top.id);
    const tree = await store.comments(alex, post.id);
    expect(tree.find((c) => c.id === top.id)?.replies.map((r) => r.id)).toEqual([reply.id, nested.id]);
  });

  it('friend request send and confirm makes friends', async () => {
    const s = (await store.suggestions(alex))[0];
    await store.sendFriendRequest(alex, s.id);
    expect((await store.friendRequests(s.id)).incoming.map((r) => r.person.id)).toContain(alex);
    await store.respondFriendRequest(s.id, alex, 'confirm');
    expect((await store.friends(alex)).map((f) => f.id)).toContain(s.id);
  });
});
