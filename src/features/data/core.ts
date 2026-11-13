// The store logic, written once over a Backend. MemoryStore and SupabaseStore are this
// class over MemoryBackend and SupabaseBackend. Every method takes the viewer id first and
// applies visibility for that viewer. Mutations publish realtime messages after the write.
import {
  demoDate, fuzzLocation, haversineMeters, now, PERSONA_HANDLES, audienceListId, seedId, walkingMinutes,
  type Audience, type Availability, type Crew, type DailyEntry, type DailyQuest, type Friendship, type FriendList,
  type ID, type LatLng, type Listing, type Memory, type Message, type NotificationObjectType,
  type NotificationType, type Post, type Profile, type ProfileField, type Quest, type ReactionType, type Reel, type RsvpStatus,
  type Story, type Invite,
} from '@/shared';
import type {
  CommentView, CreatePostBody, CreateQuestBody, EventResponse, EventView, FeedResponse,
  FriendRequestView, GroupResponse, GroupView, NotificationView, PersonCard, PostView, ProfileResponse,
  ReactResponse, SearchResponse, SearchType, StoryGroup, ThreadView, YourPlan,
} from '@/shared/api';
import type { Backend } from './backend';
import type { AvailabilityRow, CrewRow, Db, InviteRow, QuestRow } from './db';
import { badRequest, conflict, forbidden, HttpError, notFound } from './errors';
import { onlineUserIds, publish } from './realtime-server';
import { View } from './view';
import { friendPins, hangInvite, hangSuggestion, myLocation, updateMyLocation, type HangBody, type LocationPatch } from './locations';
import {
  setSideQuestPrefs, sideQuestBoard, sideQuestHistory, sideQuestPhoto, sideQuestPrefs, sideQuestReport,
  sideQuestState, sideQuestSubmit, sideQuestTrigger, sideQuestUnshare, type SubmitInput,
} from './sidequest';
import type { SideQuestPrefs } from '@/shared/api';

const PAGE = 10;
const iso = () => now().toISOString();
const uuid = () => crypto.randomUUID();
const firstName = (p: Profile | undefined) => p?.name.split(' ')[0] ?? 'Someone';

export type QuestDetail = { quest: Quest; seatsLeft: number; host: PersonCard | null; members: PersonCard[]; viewerIsMember: boolean };
export type AvailabilityItem = Availability & { friend: Profile };
export type InviteView = Invite & { from: PersonCard | null; to: PersonCard | null; quest: Quest | null };
export type PostWithShared = PostView & { sharedPost: PostView | null };

type FeedCursor = { at: string; id: string };
const encodeCursor = (p: Post) => Buffer.from(JSON.stringify({ at: p.createdAt, id: p.id })).toString('base64url');
function decodeCursor(c: string | null | undefined): FeedCursor | null {
  if (!c) return null;
  try {
    const v = JSON.parse(Buffer.from(c, 'base64url').toString('utf8')) as FeedCursor;
    return typeof v.at === 'string' && typeof v.id === 'string' ? v : null;
  } catch { return null; }
}
const olderThan = (p: Post, c: FeedCursor | null) => !c || p.createdAt < c.at || (p.createdAt === c.at && p.id < c.id);
const postOrder = (a: Post, b: Post) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);

export class CoreStore {
  constructor(readonly backend: Backend) {}

  get kind() { return this.backend.kind; }

  async view(): Promise<View> {
    return new View(await this.backend.snapshot(), this.backend.kind === 'memory' ? onlineUserIds() : []);
  }

  // ---------- identity ----------
  async profileByHandle(handle: string): Promise<Profile | null> {
    return (await this.view()).profileByHandle.get(handle) ?? null;
  }

  /** Accepts a handle or an id; 404 when unknown. */
  private resolvePerson(v: View, ref: string): Profile {
    const p = v.profileById.get(ref) ?? v.profileByHandle.get(ref);
    if (!p) throw notFound('person_not_found');
    return p;
  }

  async users(viewerId: ID): Promise<Profile[]> {
    const v = await this.view();
    return PERSONA_HANDLES.map((h) => v.profileByHandle.get(h)).filter((p): p is Profile => !!p)
      .map((p) => v.profileFor(viewerId, p));
  }

  // ---------- notifications (internal) ----------
  private async notify(
    v: View, recipientId: ID, type: NotificationType, actorId: ID | null,
    objectType: NotificationObjectType, objectId: ID, text: string,
  ): Promise<void> {
    if (recipientId === actorId || !v.profileById.has(recipientId)) return;
    const id = uuid();
    await this.backend.insert('notifications', [{
      id, recipientId, type, actorId, objectType, objectId, text, createdAt: iso(), readAt: null,
    }]);
    await publish(`user:${recipientId}`, { type: 'notification', id });
  }

  // ---------- feed ----------
  async feed(viewerId: ID, cursor?: string | null): Promise<FeedResponse> {
    const v = await this.view();
    const friends = v.friendIds(viewerId);
    const groups = new Set(v.groupIdsOf(viewerId));
    const c = decodeCursor(cursor);
    const candidates = v.db.posts.filter((p) => {
      if (p.targetType === 'sidequest') return false; // lives on the Side Quest board only
      const relevant = p.targetType === 'group'
        ? groups.has(p.targetId)
        : p.authorId === viewerId || friends.has(p.authorId);
      return relevant && v.canSeePost(viewerId, p) && olderThan(p, c);
    }).sort(postOrder);
    const page = candidates.slice(0, PAGE);
    return {
      posts: page.map((p) => v.postView(viewerId, p)),
      nextCursor: candidates.length > PAGE ? encodeCursor(page[page.length - 1]) : null,
    };
  }

  async post(viewerId: ID, postId: ID): Promise<PostWithShared> {
    const v = await this.view();
    const p = v.postById.get(postId);
    if (!p || !v.canSeePost(viewerId, p)) throw notFound('post_not_found');
    return v.postView(viewerId, p);
  }

  async createPost(viewerId: ID, body: CreatePostBody): Promise<PostWithShared> {
    const v = await this.view();
    let targetType: Post['targetType'] = 'profile';
    let targetId: ID = viewerId;
    let groupMembers: ID[] = [];
    if (body.target?.type === 'group') {
      const g = v.groupBySlug.get(body.target.slug);
      if (!g) throw notFound('group_not_found');
      if (!v.groupRole(g.id, viewerId)) throw forbidden('join the group to post');
      targetType = 'group'; targetId = g.id; groupMembers = v.groupMemberIds(g.id);
    } else if (body.target?.type === 'event') {
      const e = v.eventBySlug.get(body.target.slug);
      if (!e) throw notFound('event_not_found');
      targetType = 'event'; targetId = e.id;
    }
    const listId = audienceListId(body.audience);
    if (listId) {
      const list = v.db.friendLists.find((l) => l.id === listId);
      if (!list || list.ownerId !== viewerId) throw badRequest('unknown friend list');
    }
    if (body.sharedPostId) {
      const orig = v.postById.get(body.sharedPostId);
      if (!orig || !v.canSeePost(viewerId, orig)) throw notFound('shared post not found');
    }
    if (!body.text.trim() && !(body.media?.length) && !body.sharedPostId) throw badRequest('post is empty');
    const post: Post = {
      id: uuid(), authorId: viewerId, targetType, targetId, audience: body.audience,
      text: body.text, media: body.media ?? [], sharedPostId: body.sharedPostId ?? null, createdAt: iso(),
    };
    await this.backend.insert('posts', [post]);
    const after = await this.view();
    if (targetType === 'group') {
      const g = after.groupById.get(targetId)!;
      for (const m of groupMembers) {
        await this.notify(after, m, 'group_post', viewerId, 'post', post.id,
          `${firstName(after.profileById.get(viewerId))} posted in ${g.name}.`);
      }
    }
    if (post.sharedPostId) {
      const orig = after.postById.get(post.sharedPostId)!;
      await publish(`post:${orig.id}`, { reactions: after.reactionTotal(orig.id), comments: after.commentTotal(orig.id) });
    }
    return after.postView(viewerId, post);
  }

  async react(viewerId: ID, postId: ID, type: ReactionType | null): Promise<ReactResponse> {
    const v = await this.view();
    const p = v.postById.get(postId);
    if (!p || !v.canSeePost(viewerId, p)) throw notFound('post_not_found');
    const previous = v.viewerReaction(postId, viewerId);
    if (type === null) {
      await this.backend.remove('reactions', { postId, userId: viewerId });
    } else if (type !== previous) {
      await this.backend.upsert('reactions', [{ postId, userId: viewerId, type, createdAt: iso() }]);
    }
    const after = await this.view();
    if (type !== null && previous === null) {
      await this.notify(after, p.authorId, 'reaction', viewerId, 'post', postId,
        `${firstName(after.profileById.get(viewerId))} reacted to your post.`);
    }
    await publish(`post:${postId}`, { reactions: after.reactionTotal(postId), comments: after.commentTotal(postId) });
    return { reactionCounts: after.reactionCounts(postId), viewerReaction: after.viewerReaction(postId, viewerId) };
  }

  async comments(viewerId: ID, postId: ID): Promise<CommentView[]> {
    const v = await this.view();
    const p = v.postById.get(postId);
    if (!p || !v.canSeePost(viewerId, p)) throw notFound('post_not_found');
    return v.commentTree(viewerId, postId);
  }

  async addComment(viewerId: ID, postId: ID, text: string, parentId?: ID | null): Promise<CommentView> {
    const v = await this.view();
    const p = v.postById.get(postId);
    if (!p || !v.canSeePost(viewerId, p)) throw notFound('post_not_found');
    let parent = null as Db['comments'][number] | null;
    if (parentId) {
      parent = v.db.comments.find((c) => c.id === parentId && c.postId === postId) ?? null;
      if (!parent) throw badRequest('parent comment not on this post');
      // one reply level: a reply to a reply attaches to the top-level comment
      if (parent.parentId) parent = v.db.comments.find((c) => c.id === parent!.parentId) ?? parent;
    }
    const comment = { id: uuid(), postId, authorId: viewerId, parentId: parent?.id ?? null, text, createdAt: iso() };
    await this.backend.insert('comments', [comment]);
    const after = await this.view();
    const name = firstName(after.profileById.get(viewerId));
    await this.notify(after, p.authorId, 'comment', viewerId, 'post', postId, `${name} commented on your post.`);
    if (parent && parent.authorId !== p.authorId) {
      await this.notify(after, parent.authorId, 'reply', viewerId, 'post', postId, `${name} replied to your comment.`);
    }
    await publish(`post:${postId}`, { reactions: after.reactionTotal(postId), comments: after.commentTotal(postId) });
    return { ...comment, author: after.person(viewerId, viewerId)!, replies: [] };
  }

  async stories(viewerId: ID): Promise<StoryGroup[]> {
    const v = await this.view();
    const t = now().toISOString();
    const friends = v.friendIds(viewerId);
    const active = v.db.stories.filter((s) => s.expiresAt > t && s.createdAt <= t
      && (s.authorId === viewerId || friends.has(s.authorId)) && v.canSee(viewerId, s.authorId, s.audience));
    const by = new Map<ID, Story[]>();
    for (const s of active) by.set(s.authorId, [...(by.get(s.authorId) ?? []), s]);
    const groups: StoryGroup[] = [];
    for (const [authorId, stories] of by) {
      const author = v.person(viewerId, authorId);
      if (!author) continue;
      groups.push({ author, stories: stories.sort((a, b) => a.createdAt.localeCompare(b.createdAt)), seen: false });
    }
    const latest = (g: StoryGroup) => g.stories[g.stories.length - 1].createdAt;
    return groups.sort((a, b) => Number(b.author.id === viewerId) - Number(a.author.id === viewerId) || latest(b).localeCompare(latest(a)));
  }

  // ---------- profiles ----------
  /** The viewer edits their own bio and per-field audiences (Edit profile). */
  async updateProfile(viewerId: ID, patch: { bio?: string; fieldVisibility?: Partial<Record<ProfileField, Audience>> }): Promise<void> {
    const v = await this.view();
    const me = v.profileById.get(viewerId);
    if (!me) throw notFound('profile not found');
    const next: Partial<Profile> = {};
    if (patch.bio !== undefined) next.bio = patch.bio.trim();
    if (patch.fieldVisibility) next.fieldVisibility = { ...me.fieldVisibility, ...patch.fieldVisibility };
    if (Object.keys(next).length) await this.backend.update('profiles', { id: viewerId }, next);
  }

  async profile(viewerId: ID, handle: string): Promise<ProfileResponse> {
    const v = await this.view();
    const p = this.resolvePerson(v, handle);
    const friendIds = [...v.friendIds(p.id)];
    const f = v.friendship(viewerId, p.id);
    const relationship: ProfileResponse['relationship'] = p.id === viewerId ? 'self'
      : f?.status === 'accepted' ? 'friends'
        : f?.status === 'pending' ? (f.requesterId === viewerId ? 'request_sent' : 'request_received') : 'none';
    return {
      profile: v.profileFor(viewerId, p),
      friendCount: friendIds.length,
      friendPreview: v.sortPeople(v.people(viewerId, friendIds)).slice(0, 9),
      mutualFriendCount: p.id === viewerId ? 0 : v.mutualIds(viewerId, p.id).length,
      relationship,
    };
  }

  async profilePosts(viewerId: ID, handle: string, cursor?: string | null): Promise<FeedResponse> {
    const v = await this.view();
    const p = this.resolvePerson(v, handle);
    const c = decodeCursor(cursor);
    const list = v.db.posts.filter((x) => x.targetType === 'profile' && x.targetId === p.id
      && v.canSeePost(viewerId, x) && olderThan(x, c)).sort(postOrder);
    const page = list.slice(0, PAGE);
    return { posts: page.map((x) => v.postView(viewerId, x)), nextCursor: list.length > PAGE ? encodeCursor(page[page.length - 1]) : null };
  }

  async profilePhotos(viewerId: ID, handle: string): Promise<string[]> {
    const v = await this.view();
    const p = this.resolvePerson(v, handle);
    return v.db.posts.filter((x) => x.authorId === p.id && x.media.length > 0 && x.targetType !== 'sidequest' && v.canSeePost(viewerId, x))
      .sort(postOrder).flatMap((x) => x.media);
  }

  async profileFriends(viewerId: ID, handle: string): Promise<PersonCard[]> {
    const v = await this.view();
    const p = this.resolvePerson(v, handle);
    return v.sortPeople(v.people(viewerId, v.friendIds(p.id)));
  }

  // ---------- friends ----------
  async friends(viewerId: ID): Promise<PersonCard[]> {
    const v = await this.view();
    return v.people(viewerId, v.friendIds(viewerId)).sort((a, b) => a.name.localeCompare(b.name));
  }

  async mutualFriends(viewerId: ID, other: string): Promise<PersonCard[]> {
    const v = await this.view();
    const p = this.resolvePerson(v, other);
    return v.people(viewerId, v.mutualIds(viewerId, p.id)).sort((a, b) => a.name.localeCompare(b.name));
  }

  async friendRequests(viewerId: ID): Promise<{ incoming: FriendRequestView[]; outgoing: FriendRequestView[] }> {
    const v = await this.view();
    const incoming: FriendRequestView[] = [];
    const outgoing: FriendRequestView[] = [];
    for (const f of v.db.friendships) {
      if (f.status !== 'pending' || (f.userA !== viewerId && f.userB !== viewerId)) continue;
      const other = f.userA === viewerId ? f.userB : f.userA;
      const person = v.person(viewerId, other);
      if (!person) continue;
      (f.requesterId === viewerId ? outgoing : incoming).push({ friendship: f, person });
    }
    const newest = (a: FriendRequestView, b: FriendRequestView) => b.friendship.createdAt.localeCompare(a.friendship.createdAt);
    return { incoming: incoming.sort(newest), outgoing: outgoing.sort(newest) };
  }

  async sendFriendRequest(viewerId: ID, to: string): Promise<Friendship> {
    const v = await this.view();
    const p = this.resolvePerson(v, to);
    if (p.id === viewerId) throw badRequest('cannot friend yourself');
    const existing = v.friendship(viewerId, p.id);
    if (existing?.status === 'accepted') throw conflict('already_friends');
    if (existing?.status === 'pending') {
      if (existing.requesterId === viewerId) return existing;
      return (await this.respondFriendRequest(viewerId, p.id, 'confirm'))!;
    }
    const [userA, userB] = viewerId < p.id ? [viewerId, p.id] : [p.id, viewerId];
    const f: Friendship = { userA, userB, requesterId: viewerId, status: 'pending', createdAt: iso(), acceptedAt: null };
    await this.backend.insert('friendships', [f]);
    await this.notify(await this.view(), p.id, 'friend_request', viewerId, 'profile', viewerId,
      `${firstName(v.profileById.get(viewerId))} sent you a friend request.`);
    return f;
  }

  async respondFriendRequest(viewerId: ID, from: string, action: 'confirm' | 'delete'): Promise<Friendship | null> {
    const v = await this.view();
    const p = this.resolvePerson(v, from);
    const f = v.friendship(viewerId, p.id);
    if (!f || f.status !== 'pending') throw notFound('no pending request');
    if (action === 'delete') {
      await this.backend.remove('friendships', { userA: f.userA, userB: f.userB });
      await publish(`user:${p.id}`, { type: 'friendship', id: viewerId });
      return null;
    }
    if (f.requesterId === viewerId) throw forbidden('only the recipient can confirm');
    const acceptedAt = iso();
    await this.backend.update('friendships', { userA: f.userA, userB: f.userB }, { status: 'accepted', acceptedAt });
    await this.notify(await this.view(), p.id, 'friend_accept', viewerId, 'profile', viewerId,
      `${firstName(v.profileById.get(viewerId))} accepted your friend request.`);
    return { ...f, status: 'accepted', acceptedAt };
  }

  async unfriend(viewerId: ID, other: string): Promise<void> {
    const v = await this.view();
    const p = this.resolvePerson(v, other);
    const f = v.friendship(viewerId, p.id);
    if (!f) return;
    await this.backend.remove('friendships', { userA: f.userA, userB: f.userB });
    const myLists = v.db.friendLists.filter((l) => l.ownerId === viewerId).map((l) => l.id);
    if (myLists.length) await this.backend.remove('friendListMembers', { listId: myLists, userId: p.id });
    // Ids only: the other person's request grid and profile header refetch through the API.
    await publish(`user:${p.id}`, { type: 'friendship', id: viewerId });
  }

  async suggestions(viewerId: ID, limit = 20): Promise<PersonCard[]> {
    const v = await this.view();
    const friends = v.friendIds(viewerId);
    const pending = new Set(v.db.friendships.filter((f) => f.userA === viewerId || f.userB === viewerId)
      .map((f) => (f.userA === viewerId ? f.userB : f.userA)));
    return v.db.profiles.filter((p) => p.id !== viewerId && !friends.has(p.id) && !pending.has(p.id))
      .map((p) => v.person(viewerId, p.id)!)
      .sort((a, b) => b.mutualFriendCount - a.mutualFriendCount || a.name.localeCompare(b.name))
      .slice(0, limit);
  }

  // ---------- friend lists ----------
  async friendLists(viewerId: ID): Promise<FriendList[]> {
    return (await this.view()).friendListsOf(viewerId);
  }

  private async ownList(v: View, viewerId: ID, listId: ID) {
    const l = v.db.friendLists.find((x) => x.id === listId);
    if (!l || l.ownerId !== viewerId) throw notFound('list_not_found');
    return l;
  }

  async createFriendList(viewerId: ID, name: string): Promise<FriendList> {
    const v = await this.view();
    if (v.db.friendLists.some((l) => l.ownerId === viewerId && l.name.toLowerCase() === name.toLowerCase())) {
      throw conflict('list_name_taken');
    }
    const row = { id: uuid(), ownerId: viewerId, name, createdAt: iso() };
    await this.backend.insert('friendLists', [row]);
    return { ...row, memberIds: [] };
  }

  async renameFriendList(viewerId: ID, listId: ID, name: string): Promise<FriendList> {
    const v = await this.view();
    await this.ownList(v, viewerId, listId);
    await this.backend.update('friendLists', { id: listId }, { name });
    return (await this.view()).friendListsOf(viewerId).find((l) => l.id === listId)!;
  }

  async deleteFriendList(viewerId: ID, listId: ID): Promise<void> {
    const v = await this.view();
    await this.ownList(v, viewerId, listId);
    await this.backend.remove('friendListMembers', { listId });
    await this.backend.remove('friendLists', { id: listId });
  }

  async addListMember(viewerId: ID, listId: ID, user: string): Promise<FriendList> {
    const v = await this.view();
    await this.ownList(v, viewerId, listId);
    const p = this.resolvePerson(v, user);
    if (!v.areFriends(viewerId, p.id)) throw badRequest('only friends can be added to a list');
    if (!v.listMemberIds(listId).includes(p.id)) {
      await this.backend.insert('friendListMembers', [{ listId, userId: p.id, addedAt: iso() }]);
    }
    return (await this.view()).friendListsOf(viewerId).find((l) => l.id === listId)!;
  }

  async removeListMember(viewerId: ID, listId: ID, user: string): Promise<FriendList> {
    const v = await this.view();
    await this.ownList(v, viewerId, listId);
    const p = this.resolvePerson(v, user);
    await this.backend.remove('friendListMembers', { listId, userId: p.id });
    return (await this.view()).friendListsOf(viewerId).find((l) => l.id === listId)!;
  }

  // ---------- groups ----------
  async groups(viewerId: ID, filter: 'all' | 'mine' | 'discover' = 'all'): Promise<GroupView[]> {
    const v = await this.view();
    return v.db.groups.map((g) => v.groupView(viewerId, g))
      .filter((g) => filter === 'all' || (filter === 'mine' ? g.viewerRole !== null : g.viewerRole === null))
      .sort((a, b) => b.friendMemberCount - a.friendMemberCount || b.memberCount - a.memberCount || a.name.localeCompare(b.name));
  }

  private groupOr404(v: View, slug: string) {
    const g = v.groupBySlug.get(slug) ?? v.groupById.get(slug);
    if (!g) throw notFound('group_not_found');
    return g;
  }

  async group(viewerId: ID, slug: string): Promise<GroupResponse> {
    const v = await this.view();
    const g = this.groupOr404(v, slug);
    const admins = v.db.groupMembers.filter((m) => m.groupId === g.id && m.role === 'admin').map((m) => m.userId);
    return { group: v.groupView(viewerId, g), admins: v.people(viewerId, admins) };
  }

  async groupPosts(viewerId: ID, slug: string, cursor?: string | null): Promise<FeedResponse> {
    const v = await this.view();
    const g = this.groupOr404(v, slug);
    if (g.privacy === 'private' && !v.groupRole(g.id, viewerId)) return { posts: [], nextCursor: null };
    const c = decodeCursor(cursor);
    const list = v.db.posts.filter((p) => p.targetType === 'group' && p.targetId === g.id && olderThan(p, c)).sort(postOrder);
    const page = list.slice(0, PAGE);
    return { posts: page.map((p) => v.postView(viewerId, p)), nextCursor: list.length > PAGE ? encodeCursor(page[page.length - 1]) : null };
  }

  async groupMembers(viewerId: ID, slug: string): Promise<{ members: PersonCard[]; friendCount: number }> {
    const v = await this.view();
    const g = this.groupOr404(v, slug);
    const members = v.sortPeople(v.people(viewerId, v.groupMemberIds(g.id)));
    return { members, friendCount: members.filter((m) => m.isFriend).length };
  }

  async groupHangouts(viewerId: ID, slug: string): Promise<Quest[]> {
    const v = await this.view();
    const g = this.groupOr404(v, slug);
    return v.db.quests.filter((q) => q.groupId === g.id && v.isActiveQuest(q) && v.canSeeQuest(viewerId, q))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt)).map((q) => v.questFor(viewerId, q));
  }

  async joinGroup(viewerId: ID, slug: string): Promise<GroupView> {
    const v = await this.view();
    const g = this.groupOr404(v, slug);
    if (!v.groupRole(g.id, viewerId)) {
      await this.backend.insert('groupMembers', [{ groupId: g.id, userId: viewerId, role: 'member', joinedAt: iso() }]);
    }
    return (await this.view()).groupView(viewerId, g);
  }

  async leaveGroup(viewerId: ID, slug: string): Promise<GroupView> {
    const v = await this.view();
    const g = this.groupOr404(v, slug);
    await this.backend.remove('groupMembers', { groupId: g.id, userId: viewerId });
    return (await this.view()).groupView(viewerId, g);
  }

  // ---------- events ----------
  async events(viewerId: ID, from?: string, to?: string): Promise<EventView[]> {
    const v = await this.view();
    const start = from ?? iso();
    return v.db.events.filter((e) => e.endsAt >= start && (!to || e.startsAt <= to))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt)).map((e) => v.eventView(viewerId, e));
  }

  async event(viewerId: ID, slug: string): Promise<EventResponse> {
    const v = await this.view();
    const e = v.eventBySlug.get(slug) ?? v.eventById.get(slug);
    if (!e) throw notFound('event_not_found');
    const friends = v.friendIds(viewerId);
    const guests = v.rsvps(e.id).filter((r) => r.status !== 'invited')
      .map((r) => ({ ...r, person: v.person(viewerId, r.userId)! })).filter((g) => g.person)
      .sort((a, b) => Number(friends.has(b.userId)) - Number(friends.has(a.userId)) || a.person.name.localeCompare(b.person.name));
    return { event: v.eventView(viewerId, e), host: v.person(viewerId, e.hostId)!, guests };
  }

  async rsvp(viewerId: ID, slug: string, status: RsvpStatus | null): Promise<EventView> {
    const v = await this.view();
    const e = v.eventBySlug.get(slug) ?? v.eventById.get(slug);
    if (!e) throw notFound('event_not_found');
    if (status === null) await this.backend.remove('eventRsvps', { eventId: e.id, userId: viewerId });
    else await this.backend.upsert('eventRsvps', [{ eventId: e.id, userId: viewerId, status, createdAt: iso() }]);
    const view = (await this.view()).eventView(viewerId, e);
    await publish(`event:${e.id}`, { goingCount: view.goingCount, interestedCount: view.interestedCount });
    return view;
  }

  // ---------- notifications ----------
  async notifications(viewerId: ID, limit = 50): Promise<{ notifications: NotificationView[]; unread: number }> {
    const v = await this.view();
    const mine = v.db.notifications.filter((n) => n.recipientId === viewerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { notifications: mine.slice(0, limit).map((n) => v.notificationView(viewerId, n)), unread: mine.filter((n) => !n.readAt).length };
  }

  async markNotificationsRead(viewerId: ID, ids?: ID[]): Promise<number> {
    const v = await this.view();
    const target = v.db.notifications.filter((n) => n.recipientId === viewerId && !n.readAt && (!ids || ids.includes(n.id))).map((n) => n.id);
    if (target.length) await this.backend.update('notifications', { id: target, recipientId: viewerId }, { readAt: iso() });
    return (await this.view()).db.notifications.filter((n) => n.recipientId === viewerId && !n.readAt).length;
  }

  // ---------- messenger ----------
  async threads(viewerId: ID): Promise<ThreadView[]> {
    const v = await this.view();
    return v.db.threads.filter((t) => v.threadMemberIds(t.id).includes(viewerId))
      .map((t) => v.threadView(viewerId, t))
      .sort((a, b) => (b.lastMessageAt ?? b.createdAt).localeCompare(a.lastMessageAt ?? a.createdAt));
  }

  async messages(viewerId: ID, threadId: ID, before?: string | null, limit = 50): Promise<Message[]> {
    const v = await this.view();
    if (!v.threadMember(threadId, viewerId)) throw notFound('thread_not_found');
    const all = v.messages(threadId).filter((m) => !before || m.createdAt < before);
    await this.backend.update('threadMembers', { threadId, userId: viewerId }, { lastReadAt: iso() });
    return all.slice(-limit);
  }

  async sendMessage(viewerId: ID, threadId: ID, text: string, kind: Message['kind'] = 'text', inviteId: ID | null = null): Promise<Message> {
    const v = await this.view();
    if (!v.threadMember(threadId, viewerId)) throw notFound('thread_not_found');
    const msg: Message = { id: uuid(), threadId, fromId: viewerId, text, kind, inviteId, createdAt: iso() };
    await this.backend.insert('messages', [msg]);
    await this.backend.update('threads', { id: threadId }, { lastMessageAt: msg.createdAt });
    await this.backend.update('threadMembers', { threadId, userId: viewerId }, { lastReadAt: msg.createdAt });
    await publish(`thread:${threadId}`, { messageId: msg.id });
    for (const m of v.threadMemberIds(threadId)) {
      if (m !== viewerId) await publish(`user:${m}`, { type: 'message', id: msg.id });
    }
    return msg;
  }

  async openThread(viewerId: ID, members: string[], name?: string | null): Promise<ThreadView> {
    const v = await this.view();
    const ids = [...new Set([viewerId, ...members.map((m) => this.resolvePerson(v, m).id)])];
    if (ids.length < 2) throw badRequest('a thread needs another person');
    if (ids.length === 2 && !name) {
      const existing = v.db.threads.find((t) => !t.isGroup && (() => {
        const ms = v.threadMemberIds(t.id);
        return ms.length === 2 && ids.every((i) => ms.includes(i));
      })());
      if (existing) return v.threadView(viewerId, existing);
    }
    const t = { id: uuid(), name: name ?? null, isGroup: ids.length > 2 || !!name, createdAt: iso(), lastMessageAt: null };
    await this.backend.insert('threads', [t]);
    await this.backend.insert('threadMembers', ids.map((userId) => ({ threadId: t.id, userId, lastReadAt: userId === viewerId ? t.createdAt : null })));
    return (await this.view()).threadView(viewerId, t);
  }

  // ---------- search ----------
  async search(viewerId: ID, q: string, type: SearchType = 'all'): Promise<SearchResponse> {
    const v = await this.view();
    const needle = q.trim().toLowerCase();
    const hit = (...fields: (string | null | undefined | string[])[]) => !needle || fields.some((f) =>
      Array.isArray(f) ? f.some((x) => x.toLowerCase().includes(needle)) : (f ?? '').toLowerCase().includes(needle));
    const want = (t: SearchType) => type === 'all' || type === t;
    const limit = type === 'all' ? 8 : 30;
    return {
      people: want('people') ? v.sortPeople(v.people(viewerId, v.db.profiles.filter((p) => p.id !== viewerId && hit(p.name, p.handle)).map((p) => p.id))).slice(0, limit) : [],
      groups: want('groups') ? v.db.groups.filter((g) => hit(g.name, g.description, g.tags)).map((g) => v.groupView(viewerId, g)).slice(0, limit) : [],
      events: want('events') ? v.db.events.filter((e) => e.endsAt >= iso() && hit(e.title, e.description, e.venueName))
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)).map((e) => v.eventView(viewerId, e)).slice(0, limit) : [],
      quests: want('quests') ? v.db.quests.filter((x) => v.isActiveQuest(x) && v.canSeeQuest(viewerId, x) && hit(x.title, x.description, x.venueName, x.tags))
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)).map((x) => v.questFor(viewerId, x)).slice(0, limit) : [],
    };
  }

  // ---------- Out Here: quests ----------
  async questsNear(viewerId: ID, center: LatLng, radiusM = 3000): Promise<Quest[]> {
    const v = await this.view();
    return v.db.quests.filter((q) => v.isActiveQuest(q) && v.canSeeQuest(viewerId, q)
      && haversineMeters(center, q.approxLocation) <= radiusM + 250)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt)).map((q) => v.questFor(viewerId, q));
  }

  async yourPlans(viewerId: ID): Promise<YourPlan[]> {
    const v = await this.view();
    const viewer = this.resolvePerson(v, viewerId);
    const joined = new Set(v.db.questMembers.filter((m) => m.userId === viewerId).map((m) => m.questId));
    const crews = new Map(v.db.crews.filter((c) => v.crewMemberIds(c.id).includes(viewerId))
      .map((c) => [c.originQuestId, c.id]));
    return v.db.quests.filter((q) => joined.has(q.id))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .map((q) => ({
        quest: v.questFor(viewerId, q), members: v.people(viewerId, v.questMemberIds(q.id)),
        walkMinutes: walkingMinutes(viewer.home, q.location), crewId: crews.get(q.id) ?? null,
      }));
  }

  async quest(viewerId: ID, questId: ID): Promise<QuestDetail> {
    const v = await this.view();
    const q = v.questById.get(questId);
    if (!q || !v.canSeeQuest(viewerId, q)) throw notFound('quest_not_found');
    const memberIds = v.questMemberIds(q.id);
    return {
      quest: v.questFor(viewerId, q), seatsLeft: v.seatsLeft(q), host: v.person(viewerId, q.hostId),
      members: v.people(viewerId, memberIds), viewerIsMember: memberIds.includes(viewerId),
    };
  }

  async createQuest(viewerId: ID, body: Omit<CreateQuestBody, 'hostId'> & { hostId?: ID }): Promise<Quest> {
    const v = await this.view();
    if (body.hostId && body.hostId !== viewerId) throw forbidden('hostId must be the viewer');
    if (body.groupId && !v.groupRole(body.groupId, viewerId)) throw forbidden('join the group to host a hangout there');
    if (new Date(body.endsAt) <= new Date(body.startsAt)) throw badRequest('endsAt must be after startsAt');
    const id = uuid();
    const row: QuestRow = {
      id, hostId: viewerId, title: body.title, emoji: body.emoji, category: body.category,
      description: body.description, venueName: body.venueName, location: body.location,
      approxLocation: fuzzLocation(body.location, id), startsAt: body.startsAt, endsAt: body.endsAt,
      capacity: body.capacity, priceMax: body.priceMax, tags: body.tags, status: 'open',
      isPublic: body.isPublic, createdAt: iso(), groupId: body.groupId ?? null, placeId: body.placeId ?? null,
    };
    await this.backend.insert('quests', [row]);
    await this.backend.joinQuest(id, viewerId, null);
    const after = await this.view();
    const q = after.questById.get(id)!;
    await publish(`quest:${id}`, { seatsLeft: after.seatsLeft(q), memberCount: after.questMemberIds(id).length });
    await publish(`user:${viewerId}`, { type: 'quest', id });
    return after.questFor(viewerId, q);
  }

  async joinQuest(viewerId: ID, questId: ID, withFriendId?: ID | null): Promise<{ quest: Quest; seatsLeft: number }> {
    const v = await this.view();
    const q = v.questById.get(questId);
    if (!q || !v.canSeeQuest(viewerId, q)) throw notFound('quest_not_found');
    if (withFriendId && withFriendId !== viewerId && !v.areFriends(viewerId, withFriendId)) throw badRequest('withFriendId is not a friend');
    const wasMember = v.questMemberIds(questId);
    const seatsLeft = await this.backend.joinQuest(questId, viewerId, withFriendId ?? null);
    const after = await this.view();
    const memberIds = after.questMemberIds(questId);
    await publish(`quest:${questId}`, { seatsLeft, memberCount: memberIds.length });
    const joined = memberIds.filter((m) => !wasMember.includes(m));
    for (const m of joined) {
      await publish(`user:${m}`, { type: 'quest', id: questId });
      await this.notify(after, q.hostId, 'quest_join', m, 'quest', questId,
        `${firstName(after.profileById.get(m))} joined ${q.title}.`);
    }
    return { quest: after.questFor(viewerId, after.questById.get(questId)!), seatsLeft };
  }

  async leaveQuest(viewerId: ID, questId: ID): Promise<{ quest: Quest; seatsLeft: number }> {
    const v = await this.view();
    const q = v.questById.get(questId);
    if (!q || !v.canSeeQuest(viewerId, q)) throw notFound('quest_not_found');
    const seatsLeft = await this.backend.leaveQuest(questId, viewerId);
    const after = await this.view();
    await publish(`quest:${questId}`, { seatsLeft, memberCount: after.questMemberIds(questId).length });
    await publish(`user:${viewerId}`, { type: 'quest', id: questId });
    return { quest: after.questFor(viewerId, after.questById.get(questId)!), seatsLeft };
  }

  async completeQuest(viewerId: ID, questId: ID): Promise<{ quest: Quest; crew: Crew }> {
    const v = await this.view();
    const q = v.questById.get(questId);
    if (!q) throw notFound('quest_not_found');
    const memberIds = v.questMemberIds(questId);
    if (!memberIds.includes(viewerId)) throw forbidden('only attendees can complete a hangout');
    if (q.status !== 'done' && new Date(q.startsAt) > now()) throw conflict('This hangout has not started yet.');
    const t = iso();
    // shared prefs: quest tags plus interests at least two members share
    const counts = new Map<string, number>();
    for (const m of memberIds) for (const i of new Set(v.profileById.get(m)?.interests ?? [])) counts.set(i, (counts.get(i) ?? 0) + 1);
    const shared = [...counts].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).map(([i]) => i);
    const sharedPrefs = [...new Set([...q.tags, ...shared])].slice(0, 8);
    const existingCrew = v.db.crews.find((c) => c.originQuestId === questId);
    const crew = existingCrew ?? {
      id: seedId('hangout-crew', questId), name: `${q.title} crew`, originQuestId: questId,
      sharedPrefs, lastHangoutAt: t, createdAt: t,
    } satisfies CrewRow;
    if (!existingCrew) {
      // A stable ID and upserts let two attendees complete at once or retry an interrupted write.
      await this.backend.upsert('crews', [crew]);
    }
    const existing = v.crewMemberIds(crew.id);
    const add = memberIds.filter((userId) => !existing.includes(userId));
    if (add.length) await this.backend.upsert('crewMembers', add.map((userId) => ({ crewId: crew.id, userId })));
    if (q.status !== 'done') await this.backend.update('quests', { id: questId }, { status: 'done' });
    const after = await this.view();
    await publish(`quest:${questId}`, { seatsLeft: after.seatsLeft(after.questById.get(questId)!), memberCount: memberIds.length });
    for (const m of memberIds) await publish(`user:${m}`, { type: 'quest', id: questId });
    return { quest: after.questFor(viewerId, after.questById.get(questId)!), crew: after.crew(crew) };
  }

  // ---------- Out Here: availability ----------
  async createAvailability(viewerId: ID, body: { text: string; startsAt: string; endsAt: string; location: LatLng; audience?: Audience }): Promise<Availability> {
    if (new Date(body.endsAt) <= new Date(body.startsAt)) throw badRequest('endsAt must be after startsAt');
    // One active signal per person: a new "I'm free" ends the viewer's earlier ones.
    const nowIso = iso();
    const prior = (await this.view()).db.availability.filter((a) => a.userId === viewerId && a.endsAt > nowIso);
    for (const a of prior) await this.backend.update('availability', { id: a.id }, { endsAt: nowIso });
    const row: AvailabilityRow = {
      id: uuid(), userId: viewerId, text: body.text, startsAt: body.startsAt, endsAt: body.endsAt,
      location: body.location, intent: null, createdAt: iso(), audience: body.audience ?? 'friends',
    };
    await this.backend.insert('availability', [row]);
    const v = await this.view();
    for (const f of v.friendIds(viewerId)) {
      if (v.canSee(f, viewerId, row.audience)) await publish(`user:${f}`, { type: 'availability', id: row.id });
    }
    const { audience: _a, ...availability } = row;
    void _a;
    return availability;
  }

  async myAvailability(viewerId: ID): Promise<Availability[]> {
    const v = await this.view();
    const t = iso();
    return v.db.availability.filter((a) => a.userId === viewerId && a.endsAt > t)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt)).map(({ audience: _a, ...a }) => { void _a; return a; });
  }

  /** Friends-only: the viewer's friends' current and upcoming availability. */
  async friendAvailability(viewerId: ID): Promise<AvailabilityItem[]> {
    const v = await this.view();
    const t = iso();
    const friends = v.friendIds(viewerId);
    return v.db.availability.filter((a) => friends.has(a.userId) && a.endsAt > t && v.canSee(viewerId, a.userId, a.audience))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .map(({ audience: _a, ...a }) => { void _a; return { ...a, friend: v.profileFor(viewerId, v.profileById.get(a.userId)!) }; });
  }

  // ---------- Out Here: invites ----------
  private inviteView(v: View, viewerId: ID, i: InviteRow): InviteView {
    const q = i.questId ? v.questById.get(i.questId) : undefined;
    const { respondedAt: _r, ...invite } = i;
    void _r;
    return { ...invite, from: v.person(viewerId, i.fromId), to: v.person(viewerId, i.toId), quest: q ? v.questFor(viewerId, q) : null };
  }

  async invites(viewerId: ID): Promise<{ incoming: InviteView[]; outgoing: InviteView[] }> {
    const v = await this.view();
    const newest = (a: InviteRow, b: InviteRow) => b.createdAt.localeCompare(a.createdAt);
    return {
      incoming: v.db.invites.filter((i) => i.toId === viewerId).sort(newest).map((i) => this.inviteView(v, viewerId, i)),
      outgoing: v.db.invites.filter((i) => i.fromId === viewerId).sort(newest).map((i) => this.inviteView(v, viewerId, i)),
    };
  }

  async invite(viewerId: ID, inviteId: ID): Promise<InviteView> {
    const v = await this.view();
    const i = v.db.invites.find((x) => x.id === inviteId);
    if (!i || (i.fromId !== viewerId && i.toId !== viewerId)) throw notFound('invite_not_found');
    return this.inviteView(v, viewerId, i);
  }

  /** Also returns the quest's seatsLeft (null without a quest), so the UI can warn when only one seat is left. */
  async createInvite(viewerId: ID, body: { toId: ID; questId: ID | null; suggestionTitle: string; message: string }): Promise<Invite & { seatsLeft: number | null }> {
    const v = await this.view();
    const to = this.resolvePerson(v, body.toId);
    if (to.id === viewerId) throw badRequest('cannot invite yourself');
    if (!v.areFriends(viewerId, to.id)) throw forbidden('invites go to friends');
    let seatsLeft: number | null = null;
    if (body.questId) {
      const q = v.questById.get(body.questId);
      if (!q || !v.isActiveQuest(q)) throw notFound('quest_not_found');
      seatsLeft = v.seatsLeft(q);
    }
    const row: InviteRow = {
      id: uuid(), fromId: viewerId, toId: to.id, questId: body.questId, suggestionTitle: body.suggestionTitle,
      message: body.message, status: 'pending', createdAt: iso(), respondedAt: null,
    };
    await this.backend.insert('invites', [row]);
    const thread = await this.openThread(viewerId, [to.id]);
    await this.sendMessage(viewerId, thread.id, body.message || body.suggestionTitle, 'invite', row.id);
    await this.notify(await this.view(), to.id, 'quest_invite', viewerId, 'invite', row.id,
      `${firstName(v.profileById.get(viewerId))} invited you: ${body.suggestionTitle}`);
    await publish(`user:${to.id}`, { type: 'invite', id: row.id });
    const { respondedAt: _r, ...invite } = row;
    void _r;
    return { ...invite, seatsLeft };
  }

  /**
   * Accepting joins the invitee, and the inviter too when both fit (one atomic join_quest).
   * When only one seat is left, the invitee takes it alone (`joinedAlone: true`) and the inviter is notified.
   * A quest with no seat left is 409 quest_full: the invite stays pending and the inviter's user channel still fires.
   */
  async respondInvite(viewerId: ID, inviteId: ID, status: 'accepted' | 'declined'): Promise<{ invite: Invite; quest?: Quest; joinedAlone?: boolean }> {
    const v = await this.view();
    const i = v.db.invites.find((x) => x.id === inviteId);
    if (!i || (i.toId !== viewerId && i.fromId !== viewerId)) throw notFound('invite_not_found');
    if (i.toId !== viewerId) throw forbidden('only the invitee can respond');
    if (i.status !== 'pending') {
      if (i.status !== status) throw conflict('invite_already_answered');
      const { respondedAt: _x, ...same } = i;
      void _x;
      if (status !== 'accepted' || !i.questId) return { invite: same };
      // A repeated accept returns the same outcome as the first one.
      const q = (await this.quest(viewerId, i.questId)).quest;
      return { invite: same, quest: q, joinedAlone: !q.memberIds.includes(i.fromId) };
    }
    let quest: Quest | undefined;
    let joinedAlone: boolean | undefined;
    if (status === 'accepted' && i.questId) {
      const questId = i.questId;
      const withFriend = v.areFriends(viewerId, i.fromId) ? i.fromId : null;
      try {
        try {
          quest = (await this.joinQuest(viewerId, questId, withFriend)).quest;
        } catch (e) {
          // Not enough seats for both: the invitee takes the last seat alone.
          if (!(e instanceof HttpError && e.message === 'quest_full') || !withFriend) throw e;
          quest = (await this.joinQuest(viewerId, questId, null)).quest;
        }
      } catch (e) {
        if (e instanceof HttpError && e.message === 'quest_full') await publish(`user:${i.fromId}`, { type: 'invite', id: inviteId });
        throw e;
      }
      joinedAlone = !quest.memberIds.includes(i.fromId);
    }
    await this.backend.update('invites', { id: inviteId }, { status, respondedAt: iso() });
    if (quest && joinedAlone) {
      const after = await this.view();
      const q = after.questById.get(quest.id);
      // The host already gets a quest_join notification from joinQuest.
      if (q && q.hostId !== i.fromId) {
        await this.notify(after, i.fromId, 'quest_join', viewerId, 'quest', q.id,
          `${firstName(after.profileById.get(viewerId))} took the last seat at ${q.title}.`);
      }
    }
    await publish(`user:${i.fromId}`, { type: 'invite', id: inviteId });
    const { respondedAt: _r, ...invite } = i;
    void _r;
    return { invite: { ...invite, status }, ...(quest ? { quest } : {}), ...(joinedAlone !== undefined ? { joinedAlone } : {}) };
  }

  // ---------- Out Here: crews, memories, daily, streak ----------
  async crews(viewerId: ID): Promise<Crew[]> {
    const v = await this.view();
    return v.db.crews.filter((c) => v.crewMemberIds(c.id).includes(viewerId))
      .sort((a, b) => b.lastHangoutAt.localeCompare(a.lastHangoutAt)).map((c) => v.crew(c));
  }

  async memories(viewerId: ID, crewId: ID): Promise<Memory[]> {
    const v = await this.view();
    if (!v.db.crews.some((c) => c.id === crewId)) throw notFound('crew_not_found');
    if (!v.crewMemberIds(crewId).includes(viewerId)) throw forbidden('crew members only');
    return v.db.memories.filter((m) => m.crewId === crewId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async addMemory(viewerId: ID, body: { crewId: ID; questId: ID; caption: string; file: { bytes: Uint8Array; contentType: string } }): Promise<Memory> {
    const v = await this.view();
    const crew = v.db.crews.find((c) => c.id === body.crewId);
    if (!crew || !v.crewMemberIds(crew.id).includes(viewerId)) throw forbidden('crew members only');
    const quest = v.questById.get(body.questId);
    if (!quest || crew.originQuestId !== quest.id || quest.status !== 'done') throw badRequest('Choose a completed hangout for this album.');
    const id = uuid();
    await this.backend.uploadFile('crew-photos', id, body.file.bytes, body.file.contentType);
    const m: Memory = {
      id, crewId: crew.id, questId: quest.id, uploaderId: viewerId,
      photoUrl: `/api/memories/${id}/photo`, caption: body.caption, createdAt: iso(),
    };
    await this.backend.insert('memories', [m]);
    for (const member of v.crewMemberIds(body.crewId)) {
      if (member !== viewerId) await publish(`user:${member}`, { type: 'memory', id: m.id });
    }
    return m;
  }

  async memoryPhoto(viewerId: ID, id: ID): Promise<Blob> {
    const v = await this.view();
    const memory = v.db.memories.find((m) => m.id === id);
    if (memory?.photoUrl !== `/api/memories/${id}/photo` || !v.crewMemberIds(memory.crewId).includes(viewerId)) {
      throw notFound('photo_not_found');
    }
    return this.backend.downloadCrewPhoto(id);
  }

  async daily(date: string = demoDate()): Promise<DailyQuest> {
    const v = await this.view();
    const d = v.db.dailyQuests.find((x) => x.date === date);
    if (!d) throw notFound('no daily quest for that date');
    return d;
  }

  async dailyEntry(viewerId: ID, body: { date: string; photoUrl: string }): Promise<DailyEntry> {
    const v = await this.view();
    if (!v.db.dailyQuests.some((x) => x.date === body.date)) throw notFound('no daily quest for that date');
    const row = { date: body.date, userId: viewerId, photoUrl: body.photoUrl, verified: null, museNote: '', createdAt: iso() };
    await this.backend.upsert('dailyEntries', [row]);
    const { createdAt: _c, ...entry } = row;
    void _c;
    return entry;
  }

  /** Weeks in a row (Monday-start, DEMO_TZ date) with at least one completed hangout. */
  async streak(viewerId: ID): Promise<{ weeks: number; thisWeekDone: boolean }> {
    const v = await this.view();
    const weekKey = (d: Date) => {
      const day = new Date(`${demoDate(d)}T00:00:00Z`);
      const dow = (day.getUTCDay() + 6) % 7;
      day.setUTCDate(day.getUTCDate() - dow);
      return day.toISOString().slice(0, 10);
    };
    const weeks = new Set(v.db.quests.filter((q) => q.status === 'done' && v.questMemberIds(q.id).includes(viewerId))
      .map((q) => weekKey(new Date(q.startsAt))));
    const cursor = new Date(`${weekKey(now())}T00:00:00Z`);
    const thisWeekDone = weeks.has(cursor.toISOString().slice(0, 10));
    if (!thisWeekDone) cursor.setUTCDate(cursor.getUTCDate() - 7);
    let n = 0;
    while (weeks.has(cursor.toISOString().slice(0, 10))) { n++; cursor.setUTCDate(cursor.getUTCDate() - 7); }
    return { weeks: n, thisWeekDone };
  }

  // ---------- marketplace / reels ----------
  async listings(): Promise<Listing[]> {
    const v = await this.view();
    return v.db.listings.filter((l) => l.status !== 'sold').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listing(viewerId: ID, id: ID): Promise<{ listing: Listing; seller: PersonCard }> {
    const v = await this.view();
    const l = v.db.listings.find((x) => x.id === id);
    if (!l) throw notFound('listing_not_found');
    return { listing: l, seller: v.person(viewerId, l.sellerId)! };
  }

  async reels(): Promise<Reel[]> {
    return [...(await this.backend.snapshot()).reels].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async uploadFile(viewerId: ID, bucket: 'uploads' | 'memories', file: { bytes: Uint8Array; contentType: string; name: string }): Promise<string> {
    const ext = (file.name.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? file.contentType.split('/')[1] ?? 'bin').toLowerCase();
    return this.backend.uploadFile(bucket, `${viewerId}/${uuid()}.${ext}`, file.bytes, file.contentType);
  }

  /** Server-side context for Muse (not exposed as a route): raw profiles, places and the friend graph. */
  async museContext(): Promise<{ db: Db; view: View }> {
    const view = await this.view();
    return { db: view.db, view };
  }

  // ---------- Out Here: friend locations (logic in locations.ts) ----------
  friendPins(viewerId: ID) { return friendPins(this, viewerId); }
  myLocation(viewerId: ID) { return myLocation(this, viewerId); }
  updateMyLocation(viewerId: ID, patch: LocationPatch) { return updateMyLocation(this, viewerId, patch); }
  hangInvite(viewerId: ID, body: HangBody) { return hangInvite(this, viewerId, body); }
  hangSuggestion(viewerId: ID, toId: ID) { return hangSuggestion(this, viewerId, toId); }

  // ---------- Daily Side Quests (logic in sidequest.ts) ----------
  sideQuestState(viewerId: ID) { return sideQuestState(this, viewerId); }
  sideQuestSubmit(viewerId: ID, input: SubmitInput) { return sideQuestSubmit(this, viewerId, input); }
  sideQuestBoard(viewerId: ID, date?: string) { return sideQuestBoard(this, viewerId, date); }
  sideQuestUnshare(viewerId: ID, date: string) { return sideQuestUnshare(this, viewerId, date); }
  sideQuestReport(viewerId: ID, body: { date: string; userId: ID }) { return sideQuestReport(this, viewerId, body); }
  sideQuestHistory(viewerId: ID) { return sideQuestHistory(this, viewerId); }
  sideQuestTrigger(viewerId: ID, seconds?: number) { return sideQuestTrigger(this, viewerId, seconds); }
  sideQuestPhoto(viewerId: ID, date: string, userId: ID) { return sideQuestPhoto(this, viewerId, date, userId); }
  sideQuestPrefs(viewerId: ID) { return sideQuestPrefs(this, viewerId); }
  setSideQuestPrefs(viewerId: ID, prefs: SideQuestPrefs) { return setSideQuestPrefs(this, viewerId, prefs); }
}
