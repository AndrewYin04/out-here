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
  /** Pre-check: what each invited friend's agent answered, from what that friend shared. */
  precheck?: FriendCheck[];
};

// ---- Plan together: one shared plan for friends who are free at the same time ----
// Muse proposes the same options to everyone; each person taps "I'm in" on the ones they like.
// It locks when every member is in on the same option. Nobody sees a "no": an unanswered plan
// just expires when the shared free time ends.
export type TogetherOption = {
  questId: ID; title: string; emoji: string; venueName: string;
  startsAt: string; priceMax: number; seatsLeft: number;
  reason: string;                    // one plain sentence from Muse (or code on fallback)
};
export type TogetherStatus = 'proposing' | 'confirmed' | 'expired';
export type TogetherPlan = {
  id: ID;
  memberIds: ID[];                   // sorted; includes whoever started it
  startedBy: ID;
  options: TogetherOption[];
  votes: Record<ID, ID[]>;           // member id -> quest ids they're in for (members only)
  status: TogetherStatus;
  confirmedQuestId: ID | null;
  summary: string;
  expiresAt: string;                 // end of the shared free time
  createdAt: string;
};

// Pre-check: before a suggestion is shown, the friend's agent answers "likely down" only from
// what the friend chose to share (free window, interests, status). Busy or unshared friends are
// never listed, so nobody sees a no.
export type FriendCheck = {
  friendId: ID;
  verdict: 'likely_down';
  freeUntil: string;   // ISO
  because: string[];   // ["free till 12:10 PM", "likes dumplings", "craving dumplings"]
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

/** 'muse' is a note Muse posts into a thread (the intro message), shown as Muse, not as the sender. */
export type MessageKind = 'text' | 'invite' | 'muse';
export type Message = {
  id: ID; threadId: ID; fromId: ID; text: string;
  kind: MessageKind; inviteId: ID | null; createdAt: string;
};

export type NotificationType =
  | 'friend_request' | 'friend_accept'
  | 'comment' | 'reply' | 'reaction'
  | 'group_post' | 'event_invite'
  | 'quest_invite' | 'quest_join' | 'message' | 'intro'
  | 'listing_hold' | 'listing_update'
  | 'hangout_rate';   // "How was Dumpling Den?" after a hangout ends
export type NotificationObjectType =
  'post' | 'comment' | 'profile' | 'group' | 'event' | 'quest' | 'invite' | 'thread' | 'intro' | 'listing';
export type Notification = {
  id: ID; recipientId: ID; type: NotificationType; actorId: ID | null;
  objectType: NotificationObjectType; objectId: ID; text: string;
  createdAt: string; readAt: string | null;
};

/** 'reserved' is derived: an accepted hold that has not expired. Stored rows are 'available' or 'sold'. */
export type ListingStatus = 'available' | 'reserved' | 'sold';
export type Listing = {
  id: ID; sellerId: ID; title: string; priceUsd: number; condition: string; category: string;
  description: string; imageUrl: string | null; location: LatLng | null;
  status: ListingStatus; createdAt: string;
  /** "Available for pickup until": the listing is a map pin until then. Null = not on the map. */
  pickupUntil: string | null;
  /** The pickup area everyone sees ("Belle Haven"). */
  pickupLabel: string | null;
  /** The exact spot; only the seller and a buyer with an accepted hold get it (null for others). */
  pickupSpot: string | null;
};

export type ListingHoldStatus = 'requested' | 'accepted' | 'declined' | 'cancelled' | 'completed' | 'expired';
/** A buyer's "Reserve for pickup". 'expired' is derived: accepted, and expiresAt has passed. */
export type ListingHold = {
  id: ID; listingId: ID; buyerId: ID; offerUsd: number; message: string; etaMin: number;
  status: ListingHoldStatus; createdAt: string; acceptedAt: string | null; expiresAt: string | null;
};

/** Something a person told Muse they are looking for ("desk chair under $40, 15 min drive"). */
export type MuseWant = {
  id: ID; userId: ID; text: string; item: string; keywords: string[];
  maxPrice: number | null; maxDriveMin: number | null; active: boolean; createdAt: string;
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

// ---- Muse Intros (Boardy-style warm intros, vetted by two "Click" agents) ----
export const INTRO_KINDS = ['friendship', 'networking', 'dating'] as const;
export type IntroKind = (typeof INTRO_KINDS)[number];
export type IntroGender = 'man' | 'woman' | 'nonbinary';
export type IntroKindSetting = { on: boolean; lookingFor: string };
export type DatingPrefs = { ageMin: number; ageMax: number; genders: IntroGender[] };
/** One person's Intro settings. Private to that person; agents read it server-side only. */
export type IntroProfile = {
  userId: ID;
  kinds: Record<IntroKind, IntroKindSetting>;
  datingPrefs: DatingPrefs | null;
  maxKm: number;
  paused: boolean;
};
/** Why the two people are not strangers: shared friends and/or shared Groups. */
export type TrustPath = { mutualIds: ID[]; groupIds: ID[]; label: string };
/**
 * One turn of the agent-to-agent conversation, as stored for one side. The other agent's turns
 * are stored with text '' and only `outcome`, a one-line result that side may see.
 */
export type AgentTurn = { agent: 'a' | 'b'; text: string; outcome?: string };
export type FirstStep = { text: string; questId: ID | null; placeId: ID | null };
export type IntroStatus = 'proposed' | 'a_accepted' | 'b_accepted' | 'accepted' | 'declined' | 'expired';
export type IntroSource = 'auto' | 'request';
/**
 * Stored intro (server-only shape). agentLogA is shown only to A, agentLogB only to B.
 * reasons and noteA are written to A ("you" = A), reasonsB and noteB to B; neither quotes the
 * other person's private Intro settings. B sees the intro only after A accepts.
 */
export type Intro = {
  id: ID; kind: IntroKind; source: IntroSource; aId: ID; bId: ID;
  trustPath: TrustPath; score: number; reasons: string[]; reasonsB: string[]; summary: string;
  noteA: string; noteB: string; firstStep: FirstStep;
  agentLogA: AgentTurn[]; agentLogB: AgentTurn[];
  status: IntroStatus; declinedBy: ID | null; threadId: ID | null;
  createdAt: string; decidedAt: string | null;
};
/** The suggested first step on a card: a real quest with a relative time and a map link, or a fallback. */
export type IntroStepView = { label: string; when: string | null; href: string | null; seatsLeft: number | null };
/** What one side sees: the other person's card plus only their own agent's turns. */
export type IntroCardView = {
  id: ID; kind: IntroKind; score: number;
  other: { id: ID; handle: string; firstName: string; avatarUrl: string };
  trustPath: string[];
  /** Mutual friends for the avatar stack (at most 3). */
  mutuals: { id: ID; firstName: string; avatarUrl: string }[];
  /** This viewer's "why you'd click" line and reasons, addressed to them as "you". */
  summary: string; reasons: string[];
  step: IntroStepView;
  /** This side's agent turns in full; the other agent's turns as one-line outcomes only. */
  myAgentLog: { mine: boolean; text: string }[];
  /** e.g. "Muse judge: 91/100, above the 85 bar". */
  judgeLine: string;
  /** The other person already said yes (only ever true on B's card). */
  otherAccepted: boolean;
  /** new: waiting on you; waiting: you accepted; connected: both accepted; closed: declined or expired. */
  state: 'new' | 'waiting' | 'connected' | 'closed';
  closedText: string | null;
  threadId: ID | null; createdAt: string;
};
// ---- Post-hangout rating (spec: docs/HANGOUT_RATINGS.md) ----
// Beli-style: pick a bucket, then place the hangout against your past ones to get a 0-10 score.
// A hangout is rated, never a person. The per-person "hang again?" answer is private: only the
// server and Muse read it; no route returns another person's answer, and Muse never quotes it.
export type HangoutVerdict = 'loved' | 'fine' | 'meh';
/** Score range per bucket, inclusive. The comparison step picks a score inside the range. */
export const VERDICT_RANGES: Record<HangoutVerdict, [number, number]> = {
  loved: [6.7, 10], fine: [3.4, 6.6], meh: [0, 3.3],
};
export type HangoutRating = {
  id: ID; questId: ID; raterId: ID;
  verdict: HangoutVerdict;
  score: number;            // 0-10, one decimal, inside VERDICT_RANGES[verdict]
  highlights: string[];     // chips from HANGOUT_HIGHLIGHTS
  note: string;             // optional; private to the rater (and Muse)
  photoIds: ID[];           // Memory ids the rater added in this flow (photos live in memories)
  createdAt: string; updatedAt: string;
};
export const HANGOUT_HIGHLIGHTS = [
  'great conversation', 'good food', 'easy to find', 'met someone new', 'good vibe',
  'want to go back', 'too loud', 'too crowded', 'ran late', 'too pricey',
] as const;
/** The complaint chips. The recap never counts these below RECAP_MIN_OTHER_RATERS. */
export const NEGATIVE_HIGHLIGHTS: ReadonlySet<string> = new Set(['too loud', 'too crowded', 'ran late', 'too pricey']);
/** The recap shows verdict and chip counts only once this many members besides the viewer rated. */
export const RECAP_MIN_OTHER_RATERS = 3;
/** One rater's private answer about one other attendee of one hangout. */
export type HangAgain = { questId: ID; raterId: ID; subjectId: ID; again: boolean; createdAt: string };
