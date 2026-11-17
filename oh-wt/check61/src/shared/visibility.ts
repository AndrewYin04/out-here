import type { Audience, ID, QuestVisibility } from './types';

export type VisibilityContext = {
  /** True when viewer and owner have an accepted friendship. */
  areFriends: boolean;
  /** Members of the friend list named by a 'list:<id>' audience (the owner's list). */
  listMemberIds?: readonly ID[];
};

/** Friend-list id inside a 'list:<id>' audience, or null for any other audience. */
export function audienceListId(audience: Audience): ID | null {
  return audience.startsWith('list:') ? audience.slice(5) || null : null;
}

export function isAudience(value: unknown): value is Audience {
  return (
    value === 'public' ||
    value === 'friends' ||
    value === 'only_me' ||
    (typeof value === 'string' && value.startsWith('list:') && value.length > 5)
  );
}

/**
 * The one visibility rule for posts, profile fields, availability, stories and albums.
 * viewerId null = logged-out viewer (sees public only). The owner always sees their own items.
 * A list audience shows the item to list members who are still the owner's friends.
 * Unknown audience strings fail closed.
 */
export function canSee(
  viewerId: ID | null,
  ownerId: ID,
  audience: Audience,
  ctx: VisibilityContext,
): boolean {
  if (viewerId !== null && viewerId === ownerId) return true;
  if (audience === 'public') return true;
  if (viewerId === null) return false;
  if (audience === 'only_me') return false;
  if (audience === 'friends') return ctx.areFriends;
  const listId = audienceListId(audience);
  if (listId) return ctx.areFriends && (ctx.listMemberIds ?? []).includes(viewerId);
  return false;
}

/** What the server knows about one viewer and one plan, for canSeeQuest. */
export type QuestVisibilityContext = {
  isMemberOrHost: boolean;
  isGroupMember: boolean;
  areFriendsWithHost: boolean;
  /** The viewer and host share at least one friend (friends of friends). */
  hasMutualWithHost: boolean;
  /** The viewer has an invite to this plan. */
  isInvited: boolean;
  /** The viewer reported this plan; it is hidden from them. */
  hasReported: boolean;
};

/**
 * The one visibility rule for Out Here plans (map, plan page, Group Hangouts, Muse candidates).
 * - community: everyone
 * - group: members of the plan's Group
 * - open: the host's friends and friends of friends
 * - friends: invited friends only
 * The host and members always see it. A viewer who reported it does not.
 */
export function canSeeQuest(
  q: { visibility: QuestVisibility; groupId: ID | null },
  ctx: QuestVisibilityContext,
): boolean {
  if (ctx.isMemberOrHost) return true;
  if (ctx.hasReported) return false;
  switch (q.visibility) {
    case 'community': return true;
    case 'group': return q.groupId !== null && ctx.isGroupMember;
    case 'open': return ctx.areFriendsWithHost || ctx.hasMutualWithHost;
    case 'friends': return ctx.isInvited;
    default: return false;
  }
}

/** visibility plus the isPublic flag that mirrors it, for building Quest rows. */
export function questVisibilityFields(visibility: QuestVisibility): { visibility: QuestVisibility; isPublic: boolean } {
  return { visibility, isPublic: visibility === 'community' };
}
