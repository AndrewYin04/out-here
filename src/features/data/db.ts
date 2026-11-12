// In-process table shapes shared by both stores, and the mappers between Postgres rows
// (snake_case, lat/lng columns) and these camelCase rows. Server-only.
import type {
  Audience, Availability, Comment, DailyEntry, DailyQuest, Event, EventRsvp, FriendList, Friendship,
  Group, GroupMember, ID, Invite, Listing, Memory, Message, Notification, Place, Post, Profile,
  Quest, Reaction, Reel, Story, Thread, Crew, LocationShare, Intro, IntroProfile,
} from '@/shared';

export type QuestRow = Omit<Quest, 'memberIds'>;
export type QuestMemberRow = { questId: ID; userId: ID; joinedAt: string; viaFriendId: ID | null };
export type AvailabilityRow = Availability & { audience: Audience };
export type GroupRow = Omit<Group, 'memberCount'>;
export type EventRow = Omit<Event, 'goingCount' | 'interestedCount'>;
export type CrewRow = Omit<Crew, 'memberIds'> & { createdAt: string };
export type CrewMemberRow = { crewId: ID; userId: ID };
export type FriendListRow = Omit<FriendList, 'memberIds'>;
export type FriendListMemberRow = { listId: ID; userId: ID; addedAt: string };
export type ThreadRow = Omit<Thread, 'memberIds'>;
export type ThreadMemberRow = { threadId: ID; userId: ID; lastReadAt: string | null };
export type DailyEntryRow = DailyEntry & { createdAt: string };
export type InviteRow = Invite & { respondedAt: string | null };
export type PlaceRow = Place & { description: string };

export type Db = {
  profiles: Profile[];
  friendships: Friendship[];
  friendLists: FriendListRow[];
  friendListMembers: FriendListMemberRow[];
  groups: GroupRow[];
  groupMembers: GroupMember[];
  places: PlaceRow[];
  availability: AvailabilityRow[];
  quests: QuestRow[];
  questMembers: QuestMemberRow[];
  invites: InviteRow[];
  crews: CrewRow[];
  crewMembers: CrewMemberRow[];
  memories: Memory[];
  dailyQuests: DailyQuest[];
  dailyEntries: DailyEntryRow[];
  events: EventRow[];
  eventRsvps: EventRsvp[];
  posts: Post[];
  comments: Comment[];
  reactions: Reaction[];
  stories: Story[];
  threads: ThreadRow[];
  threadMembers: ThreadMemberRow[];
  messages: Message[];
  notifications: Notification[];
  listings: Listing[];
  reels: Reel[];
  locationShares: LocationShare[];
  introProfiles: IntroProfile[];
  intros: Intro[];
};
export type TableKey = keyof Db;
export type RowOf<T extends TableKey> = Db[T][number];

/** Postgres table name for each Db key. */
export const TABLE_NAMES: Record<TableKey, string> = {
  profiles: 'profiles', friendships: 'friendships', friendLists: 'friend_lists',
  friendListMembers: 'friend_list_members', groups: 'groups', groupMembers: 'group_members',
  places: 'places', availability: 'availability', quests: 'quests', questMembers: 'quest_members',
  invites: 'invites', crews: 'crews', crewMembers: 'crew_members', memories: 'memories',
  dailyQuests: 'daily_quests', dailyEntries: 'daily_entries', events: 'events', eventRsvps: 'event_rsvps',
  posts: 'posts', comments: 'comments', reactions: 'reactions', stories: 'stories', threads: 'threads',
  threadMembers: 'thread_members', messages: 'messages', notifications: 'notifications',
  listings: 'listings', reels: 'reels', locationShares: 'location_shares',
  introProfiles: 'intro_profiles', intros: 'intros',
};
export const TABLE_KEYS = Object.keys(TABLE_NAMES) as TableKey[];

/** Primary-key columns (camelCase) per table, used for update/delete matching and upserts. */
export const PRIMARY_KEYS: Record<TableKey, string[]> = {
  profiles: ['id'], friendships: ['userA', 'userB'], friendLists: ['id'], friendListMembers: ['listId', 'userId'],
  groups: ['id'], groupMembers: ['groupId', 'userId'], places: ['id'], availability: ['id'], quests: ['id'],
  questMembers: ['questId', 'userId'], invites: ['id'], crews: ['id'], crewMembers: ['crewId', 'userId'],
  memories: ['id'], dailyQuests: ['date'], dailyEntries: ['date', 'userId'], events: ['id'],
  eventRsvps: ['eventId', 'userId'], posts: ['id'], comments: ['id'], reactions: ['postId', 'userId'],
  stories: ['id'], threads: ['id'], threadMembers: ['threadId', 'userId'], messages: ['id'],
  notifications: ['id'], listings: ['id'], reels: ['id'], locationShares: ['userId'],
  introProfiles: ['userId'], intros: ['id'],
};

/**
 * Tables added by migration 0003. A Supabase project that has not run it yet loads them as
 * empty instead of failing every request.
 */
export const OPTIONAL_TABLES: ReadonlySet<TableKey> = new Set<TableKey>(['introProfiles', 'intros']);

export function emptyDb(): Db {
  return Object.fromEntries(TABLE_KEYS.map((k) => [k, []])) as unknown as Db;
}

// ---------- key conversion ----------
const camel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const snake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

const TIME_KEYS = /(_at|^starts_at|^ends_at)$/;
const NUMERIC_KEYS = new Set(['price_max', 'price_usd', 'typical_cost_usd', 'budget_max', 'price_level']);
const JSON_KEYS = new Set([
  'field_visibility', 'hours', 'intent', 'output',
  'kinds', 'dating_prefs', 'trust_path', 'reasons', 'reasons_b', 'first_step', 'agent_log_a', 'agent_log_b',
]);

/** Postgres row (snake_case) -> Db row (camelCase). */
export function fromRow<T extends TableKey>(table: T, row: Record<string, unknown>): RowOf<T> {
  const out: Record<string, unknown> = {};
  const r = { ...row };
  const latLng = (lat: string, lng: string) => {
    const a = r[lat]; const b = r[lng];
    delete r[lat]; delete r[lng];
    return a === null || a === undefined || b === null || b === undefined ? null : { lat: Number(a), lng: Number(b) };
  };
  if (table === 'profiles') out.home = latLng('home_lat', 'home_lng');
  if (table === 'quests') {
    out.approxLocation = latLng('approx_lat', 'approx_lng');
    out.location = latLng('lat', 'lng');
  }
  if (table === 'availability' || table === 'places' || table === 'events' || table === 'listings') {
    out.location = latLng('lat', 'lng');
  }
  if (table === 'locationShares') {
    out.location = latLng('lat', 'lng');
    const s = (k: string) => (typeof r[k] === 'string' ? (r[k] as string) : null);
    out.bubble = { emoji: s('emoji'), thought: s('thought'), doing: s('doing'), wantsTo: s('wants_to') };
    delete r.emoji; delete r.thought; delete r.doing; delete r.wants_to;
  }
  if (table === 'profiles') delete r.created_at;
  for (const [k, v] of Object.entries(r)) {
    let val = v;
    if (JSON_KEYS.has(k) && typeof v === 'string') {
      try { val = JSON.parse(v); } catch { val = v; }
    } else if (NUMERIC_KEYS.has(k) && v !== null && v !== undefined) {
      val = Number(v);
    } else if (TIME_KEYS.test(k) && typeof v === 'string') {
      val = new Date(v).toISOString();
    }
    out[camel(k)] = val;
  }
  if (table === 'profiles' && out.fieldVisibility == null) out.fieldVisibility = {};
  return out as RowOf<T>;
}

/** Db row (camelCase, possibly partial) -> Postgres row (snake_case). */
export function toRow(table: TableKey, obj: Record<string, unknown>): Record<string, unknown> {
  const o = { ...obj };
  const out: Record<string, unknown> = {};
  const split = (key: string, lat: string, lng: string) => {
    if (!(key in o)) return;
    const v = o[key] as { lat: number; lng: number } | null;
    out[lat] = v ? v.lat : null;
    out[lng] = v ? v.lng : null;
    delete o[key];
  };
  if (table === 'profiles') split('home', 'home_lat', 'home_lng');
  if (table === 'quests') split('approxLocation', 'approx_lat', 'approx_lng');
  if (['quests', 'availability', 'places', 'events', 'listings', 'locationShares'].includes(table)) split('location', 'lat', 'lng');
  if (table === 'locationShares' && 'bubble' in o) {
    const bub = o.bubble as { emoji: string | null; thought: string | null; doing: string | null; wantsTo: string | null } | null;
    out.emoji = bub?.emoji ?? null; out.thought = bub?.thought ?? null; out.doing = bub?.doing ?? null; out.wants_to = bub?.wantsTo ?? null;
    delete o.bubble;
  }
  for (const [k, v] of Object.entries(o)) out[snake(k)] = v;
  return out;
}
