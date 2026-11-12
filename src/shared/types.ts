// Shared domain types. The kit types (Profile .. MusePlan) follow
// .claude/rules/10-architecture.md; fields added on top of the kit are marked "ext".
// Feature code imports types from here and never redefines them.

export type ID = string;
export type LatLng = { lat: number; lng: number };

// ---- Audience / visibility ----
// 'list:<friendListId>' limits something to the members of one of the owner's friend lists.
export type Audience = 'public' | 'friends' | `list:${string}` | 'only_me';

export type ProfileField =
  | 'school'
  | 'major'
  | 'gradYear'
  | 'hometown'
  | 'currentCity'
  | 'job'
  | 'pronouns';

export type Profile = {
  id: ID; name: string; avatarUrl: string; bio: string;
  interests: string[]; budgetMax: number; home: LatLng; isDemoUser: boolean;
  // ext: Facebook profile fields
  handle: string;
  coverUrl: string | null;
  school: string | null;
  major: string | null;
  gradYear: number | null;
  hometown: string | null;
  currentCity: string | null;
  job: string | null;
  pronouns: string | null;
  age: number | null;
  /** Per-field audience; a missing key means 'public'. */
  fieldVisibility: Partial<Record<ProfileField, Audience>>;
};

export type Availability = {            // an "I'm free" signal
  id: ID; userId: ID; text: string;      // raw text the user typed
  startsAt: string; endsAt: string;      // ISO
  location: LatLng; intent: MuseIntent | null; createdAt: string;
};

// ---- Friend locations + status bubbles ("Find My" inside Facebook) ----
// One row per user. Who can see it is an Audience checked with canSee(); precision
// 'approximate' means viewers get a fuzzed point (~500 m-1 km), never the exact one.
export type LocationPrecision = 'exact' | 'approximate';
export type StatusBubble = {
  emoji: string | null;          // "🥟"
  thought: string | null;        // "craving dumplings"
  doing: string | null;          // "at work till 5:15"
  wantsTo: string | null;        // "try the new boba place"
};
export type LocationShare = {
  userId: ID;
  location: LatLng;              // exact; servers return a fuzzed point when precision is approximate
  placeLabel: string | null;     // "Menlo Park" / "near Hacker Way" / "San Diego, CA"
  precision: LocationPrecision;
  audience: Audience;            // who may see this share
  paused: boolean;
  bubble: StatusBubble;
  updatedAt: string;             // ISO
  expiresAt: string;             // ISO; expired shares are hidden
};
// What a viewer receives for one friend on the Friends map.
export type FriendPin = {
  friend: Profile;
  location: LatLng;              // already fuzzed if approximate
  placeLabel: string | null;
  precision: LocationPrecision;
  bubble: StatusBubble;
  updatedAt: string;
  distanceKm: number;
  walkingMinutes: number | null; // null when too far to walk
  availability: Availability | null; // their active "I'm free" signal, if any
};

export type QuestStatus = 'open' | 'full' | 'live' | 'done';
/**
 * Who can see a plan (ext). community = everyone nearby; group = members of groupId;
 * open = the host's friends and friends of friends; friends = invited friends only.
 */
export type QuestVisibility = 'community' | 'group' | 'open' | 'friends';
export const QUEST_VISIBILITIES: readonly QuestVisibility[] = ['community', 'group', 'open', 'friends'];
export type QuestCategory =
  'food' | 'music' | 'sports' | 'study' | 'thrift' | 'art' | 'outdoors' | 'games' | 'other';
export type Quest = {
  id: ID; hostId: ID; title: string; emoji: string;
  category: QuestCategory;
  description: string; venueName: string;
  location: LatLng;          // exact — only returned to members
  approxLocation: LatLng;    // ~200 m fuzz — returned to everyone else
  startsAt: string; endsAt: string;
  capacity: number; memberIds: ID[]; priceMax: number; tags: string[];
  status: QuestStatus; isPublic: boolean; createdAt: string;
  // ext
  groupId: ID | null;        // set when the quest is a Group hangout
  placeId: ID | null;
  visibility: QuestVisibility; // isPublic mirrors visibility === 'community'
  posterUrl: string | null;  // pop-up poster image
  bubbleText: string | null; // pop-up text bubble, <= 80 chars
};

export type Invite = {
  id: ID; fromId: ID; toId: ID; questId: ID | null; suggestionTitle: string;
  message: string; status: 'pending' | 'accepted' | 'declined'; createdAt: string;
};

export type Crew = {                     // forms after a hangout; powers "do this again"
  id: ID; name: string; memberIds: ID[]; originQuestId: ID;
  sharedPrefs: string[]; lastHangoutAt: string;
};

export type Memory = {
  id: ID; crewId: ID; questId: ID; uploaderId: ID;
  photoUrl: string; caption: string; createdAt: string;
};

export type DailyQuest = { date: string; prompt: string; emoji: string };
export type DailyEntry = { date: string; userId: ID; photoUrl: string; verified: boolean | null; museNote: string };

// ---- Muse ----
export type MuseIntent = {
  activities: string[];          // ["food", "dumplings"]
  budgetMax: number | null;
  windowStart: string; windowEnd: string;   // ISO, resolved from "30 min", "before 7"
  maxWalkMinutes: number | null;
  wantsFriends: boolean; openToNewPeople: boolean;
  vibe: string | null;           // "chill", "loud", "low-key"
};

export type PlanSuggestion = {
  kind: 'join_quest' | 'friend_hang' | 'new_quest';
  questId: ID | null; friendIds: ID[];
  title: string; emoji: string;
  reason: string;                // plain language, 1–2 sentences, cites real shared interests/times
  bridge: string | null;         // "Maya's going too" — only from public/shared info
  startsAt: string; travelMinutes: number; fitsWindow: true;   // non-fitting suggestions are dropped by code
  seatsLeft: number | null; inviteDraft: string | null;
};

export type MusePlan = { intent: MuseIntent; suggestions: PlanSuggestion[]; summary: string };

// ---- Places (venues the seed and Muse candidates use) ----
/** Opening hours by weekday key; each entry is [open "HH:MM", close "HH:MM"] in DEMO_TZ. */
export type WeekdayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type OpeningHours = Partial<Record<WeekdayKey, [string, string][]>>;
export type Place = {
  id: ID; name: string; category: string; location: LatLng; address: string;
  priceLevel: 1 | 2 | 3 | 4; typicalCostUsd: number; hours: OpeningHours;
};

// ---- Facebook base ----
export type FriendshipStatus = 'pending' | 'accepted';
/** One row per pair; userA < userB (string order of ids). */
export type Friendship = {
  userA: ID; userB: ID; requesterId: ID; status: FriendshipStatus;
  createdAt: string; acceptedAt: string | null;
};

export type FriendList = { id: ID; ownerId: ID; name: string; memberIds: ID[]; createdAt: string };

export type GroupPrivacy = 'public' | 'private';
export type Group = {
  id: ID; slug: string; name: string; privacy: GroupPrivacy; description: string;
  tags: string[]; coverUrl: string | null; createdBy: ID | null; createdAt: string;
  memberCount: number;
};

export type GroupRole = 'admin' | 'moderator' | 'member';
export type GroupMember = { groupId: ID; userId: ID; role: GroupRole; joinedAt: string };

export type EventCategory = 'music' | 'food' | 'sports' | 'social' | 'study' | 'arts';
export type Event = {
  id: ID; slug: string; title: string; description: string;
  groupId: ID | null; hostId: ID; placeId: ID | null; venueName: string; location: LatLng | null;
  startsAt: string; endsAt: string; priceUsd: number; capacity: number | null;
  category: EventCategory; coverUrl: string | null; createdAt: string;
  goingCount: number; interestedCount: number;
};

export type RsvpStatus = 'going' | 'interested' | 'invited';
export type EventRsvp = { eventId: ID; userId: ID; status: RsvpStatus; createdAt: string };

export type PostTargetType = 'profile' | 'group' | 'event' | 'quest';
export type Post = {
  id: ID; authorId: ID;
  targetType: PostTargetType;
  targetId: ID;              // profile id (the author's own for a timeline post), group id, or event id
  audience: Audience;
  text: string; media: string[];
  sharedPostId: ID | null;
  createdAt: string;
};

export type Comment = {
  id: ID; postId: ID; authorId: ID;
  parentId: ID | null;       // one reply level: a reply's parent is a top-level comment
  text: string; createdAt: string;
};

export const REACTION_TYPES = ['like', 'love', 'care', 'haha', 'wow', 'sad', 'angry'] as const;
export type ReactionType = (typeof REACTION_TYPES)[number];
export type Reaction = { postId: ID; userId: ID; type: ReactionType; createdAt: string };
export type ReactionCounts = Record<ReactionType, number>;

export type Story = {
  id: ID; authorId: ID; mediaUrl: string; audience: Audience;
  createdAt: string; expiresAt: string;
};

export type Thread = {
  id: ID; name: string | null; isGroup: boolean; memberIds: ID[];
  createdAt: string; lastMessageAt: string | null;
};

export type MessageKind = 'text' | 'invite';
export type Message = {
  id: ID; threadId: ID; fromId: ID; text: string;
  kind: MessageKind; inviteId: ID | null; createdAt: string;
};

export type NotificationType =
  | 'friend_request' | 'friend_accept'
  | 'comment' | 'reply' | 'reaction'
  | 'group_post' | 'event_invite'
  | 'quest_invite' | 'quest_join' | 'message';
export type NotificationObjectType =
  'post' | 'comment' | 'profile' | 'group' | 'event' | 'quest' | 'invite' | 'thread';
export type Notification = {
  id: ID; recipientId: ID; type: NotificationType; actorId: ID | null;
  objectType: NotificationObjectType; objectId: ID; text: string;
  createdAt: string; readAt: string | null;
};

export type ListingStatus = 'available' | 'pending' | 'sold';
export type Listing = {
  id: ID; sellerId: ID; title: string; priceUsd: number; condition: string; category: string;
  description: string; imageUrl: string | null; location: LatLng | null;
  status: ListingStatus; createdAt: string;
};

export type Reel = {
  id: ID; authorId: ID; videoUrl: string; posterUrl: string | null; caption: string; createdAt: string;
};

/** One Muse call, logged for "why did Muse suggest this". Never stores keys. */
export type MuseRun = {
  id: ID; route: string; model: string; userId: ID | null;
  latencyMs: number; inputHash: string; output: unknown;
  promptTokens: number | null; completionTokens: number | null;
  ok: boolean; error: string | null; createdAt: string;
};
