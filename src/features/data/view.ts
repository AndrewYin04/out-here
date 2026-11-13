// Read-side helpers over one snapshot of the tables: indexes, visibility and view models.
// Every view model that leaves the server is built here, so canSee is applied in one place.
import {
  canSee, canSeeQuest, audienceListId, now, REACTION_TYPES, type QuestVisibility,
  type Audience, type Comment, type ID, type Post, type Profile, type ProfileField, type Quest,
  type ReactionCounts, type ReactionType, type Group, type Event, type FriendList, type Crew,
  type Thread, type Message, type Notification, type GroupRole, type RsvpStatus,
} from '@/shared';
import type {
  CommentView, EventView, GroupView, ListingCard, NotificationView, PersonCard, PostView, ThreadView,
} from '@/shared/api';
import type { Db, GroupRow, QuestRow, EventRow, CrewRow } from './db';

const PROFILE_FIELDS: ProfileField[] = ['school', 'major', 'gradYear', 'hometown', 'currentCity', 'job', 'pronouns'];

function groupBy<T, K>(rows: readonly T[], key: (r: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const r of rows) {
    const k = key(r);
    const arr = m.get(k);
    if (arr) arr.push(r); else m.set(k, [r]);
  }
  return m;
}

const byNewest = <T extends { createdAt: string }>(a: T, b: T) => b.createdAt.localeCompare(a.createdAt);

export class View {
  readonly profileById: Map<ID, Profile>;
  readonly profileByHandle: Map<string, Profile>;
  private friendSets = new Map<ID, Set<ID>>();
  private listMembers: Map<ID, ID[]>;
  private groupMembersBy: Map<ID, Db['groupMembers']>;
  private groupsByUser: Map<ID, Db['groupMembers']>;
  private questMembersBy: Map<ID, Db['questMembers']>;
  private questCheckinsBy: Map<ID, Db['questCheckins']>;
  private questInvitees: Map<ID, Set<ID>>;
  private questReporters: Map<ID, Set<ID>>;
  private reactionsBy: Map<ID, Db['reactions']>;
  private commentsBy: Map<ID, Comment[]>;
  private sharesBy: Map<ID, number>;
  private rsvpsBy: Map<ID, Db['eventRsvps']>;
  private threadMembersBy: Map<ID, Db['threadMembers']>;
  private messagesBy: Map<ID, Message[]>;
  readonly groupById: Map<ID, GroupRow>;
  readonly groupBySlug: Map<string, GroupRow>;
  readonly postById: Map<ID, Post>;
  readonly questById: Map<ID, QuestRow>;
  readonly eventById: Map<ID, EventRow>;
  readonly eventBySlug: Map<string, EventRow>;
  readonly online: Set<ID>;

  constructor(readonly db: Db, online: readonly ID[] = []) {
    this.online = new Set(online);
    this.profileById = new Map(db.profiles.map((p) => [p.id, p]));
    this.profileByHandle = new Map(db.profiles.map((p) => [p.handle, p]));
    for (const f of db.friendships) {
      if (f.status !== 'accepted') continue;
      this.friendSet(f.userA).add(f.userB);
      this.friendSet(f.userB).add(f.userA);
    }
    this.listMembers = new Map();
    for (const m of db.friendListMembers) {
      const arr = this.listMembers.get(m.listId) ?? [];
      arr.push(m.userId);
      this.listMembers.set(m.listId, arr);
    }
    this.groupMembersBy = groupBy(db.groupMembers, (m) => m.groupId);
    this.groupsByUser = groupBy(db.groupMembers, (m) => m.userId);
    this.questMembersBy = groupBy(
      [...db.questMembers].sort((a, b) => a.joinedAt.localeCompare(b.joinedAt)), (m) => m.questId);
    this.questCheckinsBy = groupBy(db.questCheckins ?? [], (c) => c.questId);
    this.questInvitees = new Map();
    for (const i of db.invites) {
      if (!i.questId) continue;
      const set = this.questInvitees.get(i.questId) ?? new Set<ID>();
      set.add(i.toId);
      this.questInvitees.set(i.questId, set);
    }
    this.questReporters = new Map();
    for (const r of db.questReports ?? []) {
      const set = this.questReporters.get(r.questId) ?? new Set<ID>();
      set.add(r.reporterId);
      this.questReporters.set(r.questId, set);
    }
    this.reactionsBy = groupBy(db.reactions, (r) => r.postId);
    this.commentsBy = groupBy([...db.comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt)), (c) => c.postId);
    this.sharesBy = new Map();
    for (const p of db.posts) if (p.sharedPostId) this.sharesBy.set(p.sharedPostId, (this.sharesBy.get(p.sharedPostId) ?? 0) + 1);
    this.rsvpsBy = groupBy(db.eventRsvps, (r) => r.eventId);
    this.threadMembersBy = groupBy(db.threadMembers, (m) => m.threadId);
    this.messagesBy = groupBy([...db.messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt)), (m) => m.threadId);
    this.groupById = new Map(db.groups.map((g) => [g.id, g]));
    this.groupBySlug = new Map(db.groups.map((g) => [g.slug, g]));
    this.postById = new Map(db.posts.map((p) => [p.id, p]));
    this.questById = new Map(db.quests.map((q) => [q.id, q]));
    this.eventById = new Map(db.events.map((e) => [e.id, e]));
    this.eventBySlug = new Map(db.events.map((e) => [e.slug, e]));
  }

  private friendSet(id: ID): Set<ID> {
    let s = this.friendSets.get(id);
    if (!s) { s = new Set(); this.friendSets.set(id, s); }
    return s;
  }

  // ---------- graph ----------
  friendIds(id: ID): Set<ID> { return this.friendSets.get(id) ?? new Set(); }
  areFriends(a: ID, b: ID): boolean { return this.friendIds(a).has(b); }
  mutualIds(a: ID, b: ID): ID[] {
    const fa = this.friendIds(a);
    return [...this.friendIds(b)].filter((x) => fa.has(x) && x !== a && x !== b);
  }
  friendship(a: ID, b: ID) {
    const [userA, userB] = a < b ? [a, b] : [b, a];
    return this.db.friendships.find((f) => f.userA === userA && f.userB === userB) ?? null;
  }
  listMemberIds(listId: ID): ID[] { return this.listMembers.get(listId) ?? []; }
  friendListsOf(ownerId: ID): FriendList[] {
    return this.db.friendLists.filter((l) => l.ownerId === ownerId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((l) => ({ ...l, memberIds: this.listMemberIds(l.id) }));
  }

  /** canSee with the friendship and friend-list context filled in. */
  canSee(viewerId: ID | null, ownerId: ID, audience: Audience): boolean {
    const listId = audienceListId(audience);
    const list = listId ? this.db.friendLists.find((l) => l.id === listId) : undefined;
    return canSee(viewerId, ownerId, audience, {
      areFriends: viewerId !== null && this.areFriends(viewerId, ownerId),
      listMemberIds: list && list.ownerId === ownerId ? this.listMemberIds(list.id) : [],
    });
  }

  // ---------- people ----------
  person(viewerId: ID, id: ID): PersonCard | null {
    const p = this.profileById.get(id);
    if (!p) return null;
    return {
      id: p.id, handle: p.handle, name: p.name, avatarUrl: p.avatarUrl,
      mutualFriendCount: id === viewerId ? 0 : this.mutualIds(viewerId, id).length,
      isFriend: this.areFriends(viewerId, id),
      online: this.online.has(id),
    };
  }
  people(viewerId: ID, ids: Iterable<ID>): PersonCard[] {
    const out: PersonCard[] = [];
    for (const id of ids) { const c = this.person(viewerId, id); if (c) out.push(c); }
    return out;
  }
  /** Friends first, then by mutual friends, then by name. */
  sortPeople(cards: PersonCard[]): PersonCard[] {
    return cards.sort((a, b) => Number(b.isFriend) - Number(a.isFriend)
      || b.mutualFriendCount - a.mutualFriendCount || a.name.localeCompare(b.name));
  }

  /**
   * The profile with fields the viewer cannot see set to null. Home is never sent for someone
   * else (null at runtime; the shared Profile type still says LatLng, see the contract request).
   */
  profileFor(viewerId: ID, p: Profile): Profile {
    if (viewerId === p.id) return p;
    const out: Profile = { ...p, home: null as unknown as Profile['home'] };
    for (const f of PROFILE_FIELDS) {
      const audience = p.fieldVisibility[f] ?? 'public';
      if (!this.canSee(viewerId, p.id, audience)) (out as Record<ProfileField, unknown>)[f] = null;
    }
    return out;
  }

  // ---------- posts ----------
  canSeePost(viewerId: ID, post: Post): boolean {
    if (post.authorId === viewerId) return true;
    if (post.targetType === 'group') {
      const g = this.groupById.get(post.targetId);
      if (!g) return false;
      return g.privacy === 'public' || this.groupRole(post.targetId, viewerId) !== null;
    }
    if (post.targetType === 'event') return true;
    if (post.targetType === 'quest') {
      const q = this.questById.get(post.targetId);
      return !!q && this.canSeeQuest(viewerId, q);
    }
    return this.canSee(viewerId, post.authorId, post.audience);
  }

  reactionCounts(postId: ID): ReactionCounts {
    const counts = Object.fromEntries(REACTION_TYPES.map((t) => [t, 0])) as ReactionCounts;
    for (const r of this.reactionsBy.get(postId) ?? []) counts[r.type] += 1;
    return counts;
  }
  reactionTotal(postId: ID): number { return this.reactionsBy.get(postId)?.length ?? 0; }
  commentTotal(postId: ID): number { return this.commentsBy.get(postId)?.length ?? 0; }
  viewerReaction(postId: ID, viewerId: ID): ReactionType | null {
    return this.reactionsBy.get(postId)?.find((r) => r.userId === viewerId)?.type ?? null;
  }

  commentTree(viewerId: ID, postId: ID): CommentView[] {
    const all = this.commentsBy.get(postId) ?? [];
    const replies = groupBy(all.filter((c) => c.parentId), (c) => c.parentId!);
    const view = (c: Comment, withReplies: boolean): CommentView | null => {
      const author = this.person(viewerId, c.authorId);
      if (!author) return null;
      const rs = withReplies ? (replies.get(c.id) ?? []).map((r) => view(r, false)).filter((x): x is CommentView => !!x) : [];
      return { ...c, author, replies: rs };
    };
    return all.filter((c) => !c.parentId).map((c) => view(c, true)).filter((x): x is CommentView => !!x);
  }

  postView(viewerId: ID, post: Post): PostView & { sharedPost: PostView | null } {
    const counts = this.reactionCounts(post.id);
    const top = REACTION_TYPES.filter((t) => counts[t] > 0).sort((a, b) => counts[b] - counts[a]).slice(0, 3);
    const group = post.targetType === 'group' ? this.groupById.get(post.targetId) : undefined;
    const tree = this.commentTree(viewerId, post.id);
    const shared = post.sharedPostId ? this.postById.get(post.sharedPostId) : undefined;
    return {
      ...post,
      author: this.person(viewerId, post.authorId) ?? {
        id: post.authorId, handle: 'unknown', name: 'Unknown', avatarUrl: '', mutualFriendCount: 0, isFriend: false,
      },
      group: group ? { id: group.id, slug: group.slug, name: group.name } : null,
      reactionCounts: counts,
      topReactions: top,
      viewerReaction: this.viewerReaction(post.id, viewerId),
      commentCount: this.commentTotal(post.id),
      previewComments: tree.slice(-2),
      shareCount: this.sharesBy.get(post.id) ?? 0,
      listing: this.listingOfPost(post),
      sharedPost: shared && this.canSeePost(viewerId, shared) ? this.postView(viewerId, { ...shared, sharedPostId: null }) : null,
    };
  }

  /** A post by a seller whose photo is one of their unsold listings' photo shares that listing. */
  listingOfPost(post: Post): ListingCard | null {
    const img = post.media[0];
    if (!img) return null;
    const l = (this.db.listings ?? []).find((x) => x.sellerId === post.authorId && x.imageUrl === img && x.status !== 'sold');
    return l ? { id: l.id, title: l.title, priceUsd: l.priceUsd, imageUrl: l.imageUrl, status: l.status } : null;
  }

  // ---------- groups ----------
  groupRole(groupId: ID, userId: ID): GroupRole | null {
    return this.groupMembersBy.get(groupId)?.find((m) => m.userId === userId)?.role ?? null;
  }
  groupMemberIds(groupId: ID): ID[] { return (this.groupMembersBy.get(groupId) ?? []).map((m) => m.userId); }
  groupIdsOf(userId: ID): ID[] { return (this.groupsByUser.get(userId) ?? []).map((m) => m.groupId); }
  groupView(viewerId: ID, g: GroupRow): GroupView {
    const members = this.groupMemberIds(g.id);
    const friends = this.friendIds(viewerId);
    const full: Group = { ...g, memberCount: members.length };
    return { ...full, viewerRole: this.groupRole(g.id, viewerId), friendMemberCount: members.filter((m) => friends.has(m)).length };
  }

  // ---------- events ----------
  rsvps(eventId: ID) { return this.rsvpsBy.get(eventId) ?? []; }
  eventView(viewerId: ID, e: EventRow): EventView {
    const rs = this.rsvps(e.id);
    const friends = this.friendIds(viewerId);
    const full: Event = {
      ...e,
      goingCount: rs.filter((r) => r.status === 'going').length,
      interestedCount: rs.filter((r) => r.status === 'interested').length,
    };
    return {
      ...full,
      viewerRsvp: (rs.find((r) => r.userId === viewerId)?.status ?? null) as RsvpStatus | null,
      friendsGoing: this.people(viewerId, rs.filter((r) => r.status === 'going' && friends.has(r.userId)).map((r) => r.userId)),
    };
  }

  // ---------- quests ----------
  questMemberIds(questId: ID): ID[] { return (this.questMembersBy.get(questId) ?? []).map((m) => m.userId); }
  seatsLeft(q: QuestRow): number { return Math.max(q.capacity - this.questMemberIds(q.id).length, 0); }
  /**
   * Quest as the viewer may see it: exact location only for members. A viewer who may not see
   * the guest list gets only their own friends' ids; everyone else is a `hidden:<n>` placeholder,
   * so counts and seats stay right without saying who is going.
   */
  questFor(viewerId: ID, q: QuestRow): Quest {
    const all = this.questMemberIds(q.id);
    const isMember = all.includes(viewerId);
    const memberIds = this.canSeeQuestGuests(viewerId, q)
      ? all
      : all.map((id, i) => (id === viewerId || this.areFriends(viewerId, id) ? id : `hidden:${i}`));
    return {
      ...q, memberIds, location: isMember ? q.location : q.approxLocation,
      visibility: this.questVisibility(q), posterUrl: q.posterUrl ?? null, bubbleText: q.bubbleText ?? null,
    };
  }
  /** A quest's visibility; rows written before migration 0003 fall back to isPublic. */
  questVisibility(q: QuestRow): QuestVisibility {
    return q.visibility ?? (q.isPublic ? 'community' : q.groupId ? 'group' : 'open');
  }
  /** The one quest visibility rule (src/shared/visibility.ts) with this snapshot's facts filled in. */
  canSeeQuest(viewerId: ID, q: QuestRow): boolean {
    const visibility = this.questVisibility(q);
    return canSeeQuest({ visibility, groupId: q.groupId }, {
      isMemberOrHost: q.hostId === viewerId || this.questMemberIds(q.id).includes(viewerId),
      isGroupMember: !!q.groupId && this.groupRole(q.groupId, viewerId) !== null,
      areFriendsWithHost: this.areFriends(viewerId, q.hostId),
      hasMutualWithHost: visibility === 'open' && this.mutualIds(viewerId, q.hostId).length > 0,
      isInvited: this.questInvitees.get(q.id)?.has(viewerId) ?? false,
      hasReported: this.questReporters.get(q.id)?.has(viewerId) ?? false,
    });
  }
  /** Strangers see how many are going, never who: guests show to the host, members and the host's friends. */
  canSeeQuestGuests(viewerId: ID, q: QuestRow): boolean {
    return q.hostId === viewerId || this.questMemberIds(q.id).includes(viewerId) || this.areFriends(viewerId, q.hostId);
  }
  questCheckinIds(questId: ID): ID[] { return (this.questCheckinsBy.get(questId) ?? []).map((c) => c.userId); }
  /** Posts on a plan's page, newest first. */
  questPostIds(questId: ID): ID[] {
    return this.db.posts.filter((p) => p.targetType === 'quest' && p.targetId === questId)
      .sort(byNewest).map((p) => p.id);
  }
  /** Live = between start and end (computed; status is not stored for this). */
  isQuestLive(q: QuestRow, at: Date = now()): boolean {
    return q.status !== 'done' && new Date(q.startsAt) <= at && at < new Date(q.endsAt);
  }

  // ---------- crews ----------
  crewMemberIds(crewId: ID): ID[] { return this.db.crewMembers.filter((m) => m.crewId === crewId).map((m) => m.userId); }
  crew(c: CrewRow): Crew {
    return {
      id: c.id, name: c.name, memberIds: this.crewMemberIds(c.id), originQuestId: c.originQuestId,
      sharedPrefs: c.sharedPrefs, lastHangoutAt: c.lastHangoutAt,
    };
  }

  // ---------- messenger ----------
  threadMemberIds(threadId: ID): ID[] { return (this.threadMembersBy.get(threadId) ?? []).map((m) => m.userId); }
  threadMember(threadId: ID, userId: ID) { return this.threadMembersBy.get(threadId)?.find((m) => m.userId === userId) ?? null; }
  messages(threadId: ID): Message[] { return this.messagesBy.get(threadId) ?? []; }
  threadView(viewerId: ID, t: Db['threads'][number]): ThreadView {
    const memberIds = this.threadMemberIds(t.id);
    const msgs = this.messages(t.id);
    const lastRead = this.threadMember(t.id, viewerId)?.lastReadAt ?? '';
    const thread: Thread = { ...t, memberIds };
    return {
      ...thread,
      members: this.people(viewerId, memberIds),
      lastMessage: msgs[msgs.length - 1] ?? null,
      unreadCount: msgs.filter((m) => m.fromId !== viewerId && m.createdAt > lastRead).length,
    };
  }

  // ---------- notifications ----------
  notificationHref(n: Notification): string {
    switch (n.objectType) {
      case 'post': return `/posts/${n.objectId}`;
      case 'comment': {
        const c = this.db.comments.find((x) => x.id === n.objectId);
        return c ? `/posts/${c.postId}` : '/';
      }
      case 'profile': return `/profile/${this.profileById.get(n.objectId)?.handle ?? ''}`;
      case 'group': return `/groups/${this.groupById.get(n.objectId)?.slug ?? ''}`;
      case 'event': return `/events/${this.eventById.get(n.objectId)?.slug ?? ''}`;
      case 'quest': return `/out-here/plan/${n.objectId}`;
      case 'invite': return `/out-here?invite=${n.objectId}`;
      case 'thread': return `/messages/${n.objectId}`;
      case 'intro': return `/intros#${n.objectId}`;
      default: return '/';
    }
  }
  notificationView(viewerId: ID, n: Notification): NotificationView {
    return { ...n, actor: n.actorId ? this.person(viewerId, n.actorId) : null, href: this.notificationHref(n) };
  }

  sortNewest = byNewest;
  isActiveQuest(q: QuestRow): boolean { return q.status !== 'done' && new Date(q.endsAt) > now(); }
}
