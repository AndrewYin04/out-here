// Request/response contracts for every route. The route list comments are the source of
// truth for paths; the types below are what handlers accept and return.
//
// Identity: the active persona travels as the `x-persona: <handle>` header (see plan 4.1).
// Every route validates input with zod and answers bad input with a 4xx `{ error: string }`.
//
// ---- Kit (Out Here) ----
// GET  /api/quests?lat&lng&radiusM&viewerId          -> { quests: Quest[] }     (approxLocation unless member)
// GET  /api/quests/mine                                           -> { plans: YourPlan[] }
// POST /api/quests                     body: Omit<Quest,'id'|'memberIds'|'status'|'createdAt'|'approxLocation'> -> { quest }
// POST /api/quests/:id/join            body: { userId, withFriendId? }  -> { quest, seatsLeft }   (409 if full)
// POST /api/quests/:id/leave           body: { userId }                 -> { quest, seatsLeft }
// POST /api/quests/:id/complete        body: { userId? }                -> { quest, crew }        (attendee, after the start)
// POST /api/availability               body: { userId, text, startsAt, endsAt, location } -> { availability }
// GET  /api/friends/:userId/availability                                -> { items: (Availability & { friend: Profile })[] }
// GET  /api/locations/friends          (viewer from x-persona)          -> { pins: FriendPin[] }   (canSee on audience; fuzzed when approximate; paused/expired hidden)
// GET  /api/locations/me                                                -> { share: LocationShare | null }
// PUT  /api/locations/me               body: Partial<Pick<LocationShare,'location'|'placeLabel'|'precision'|'audience'|'paused'|'bubble'>> -> { share }
//      (publishes Broadcast location:<userId> {userId, updatedAt}; clients refetch /api/locations/friends)
// POST /api/locations/hang             body: { toId, questId?, placeId?, message } -> { invite }   ("Want to hang?" from a friend card)
// GET  /api/users                                                       -> { users: Profile[] }   (demo switcher)
// POST /api/invites                    body: { fromId, toId, questId, suggestionTitle, message } -> { invite }
// POST /api/invites/:id/respond        body: { status: 'accepted'|'declined' } -> { invite, quest? } (accept auto-joins)
// GET  /api/crews?userId                                                -> { crews: Crew[] }
// POST /api/memories                   multipart: photo, crewId, questId, uploaderId?, caption? -> { memory }
// GET  /api/memories/:id/photo                                      -> image bytes (crew members only)
// GET  /api/memories?crewId                                             -> { memories: Memory[] }
// GET  /api/daily?date / POST /api/daily/entry                          -> DailyQuest / { entry }
// GET  /api/me/:userId/streak                                           -> { weeks: number, thisWeekDone: boolean }
// POST /api/muse/plan                  body: { userId, text, location, now? } -> MusePlan
// POST /api/muse/regroup               body: { crewId, now? }           -> { suggestion: PlanSuggestion, message: string }
// POST /api/muse/create-quest          body: { userId, text, location } -> { draft: Partial<Quest>, pitch: string }
// POST /api/muse/caption               body: { questId }                -> { caption: string }
// POST /api/muse/daily                 body: { date }                   -> DailyQuest
// POST /api/muse/verify-photo          body: { date, photoUrl }         -> { verified: boolean, note: string }
// POST /api/muse/wrapped               body: { userId, month }          -> { cards: { title: string; body: string; stat?: string; photoUrl?: string }[] }
//
// ---- Facebook base (viewer = x-persona) ----
// GET  /api/feed?cursor                                                 -> FeedResponse
// POST /api/posts                      body: CreatePostBody             -> { post: PostView }
// POST /api/posts/:id/reactions        body: { type: ReactionType | null } (null removes) -> ReactResponse
// GET  /api/posts/:id/comments                                          -> { comments: CommentView[] }
// POST /api/posts/:id/comments         body: { text, parentId? }        -> { comment: CommentView }
// POST /api/uploads                    multipart: file                  -> { url: string }   (Storage bucket "uploads")
// GET  /api/stories                                                     -> { stories: StoryGroup[] }
// GET  /api/profile/:handle                                             -> ProfileResponse
// GET  /api/profile/:handle/posts?cursor                                -> FeedResponse
// GET  /api/profile/:handle/photos                                      -> { photos: string[] }
// GET  /api/friends                                                     -> { friends: PersonCard[] }
// GET  /api/friends/requests                                            -> { incoming: FriendRequestView[], outgoing: FriendRequestView[] }
// POST /api/friends/requests           body: { toId }                   -> { friendship: Friendship }
// POST /api/friends/requests/respond   body: { fromId, action: 'confirm'|'delete' } -> { friendship: Friendship | null }
// DELETE /api/friends/:userId                                           -> { ok: true }   (unfriend)
// GET  /api/friends/suggestions                                         -> { people: PersonCard[] }  (ranked by mutual friends)
// GET  /api/friend-lists                                                -> { lists: FriendList[] }
// POST /api/friend-lists               body: { name }                   -> { list: FriendList }
// POST /api/friend-lists/:id/members   body: { userId }                 -> { list: FriendList }
// DELETE /api/friend-lists/:id/members/:userId                          -> { list: FriendList }
// GET  /api/groups                                                      -> { groups: GroupView[] }
// GET  /api/groups/:slug                                                -> GroupResponse
// GET  /api/groups/:slug/posts?cursor                                   -> FeedResponse
// GET  /api/groups/:slug/members                                        -> { members: PersonCard[], friendCount: number }
// GET  /api/groups/:slug/hangouts                                       -> { quests: Quest[] }
// POST /api/groups/:slug/join  /  POST /api/groups/:slug/leave          -> { group: GroupView }
// GET  /api/events?from&to                                              -> { events: EventView[] }
// GET  /api/events/:slug                                                -> EventResponse
// POST /api/events/:slug/rsvp          body: { status: RsvpStatus | null } -> { event: EventView }
// GET  /api/notifications                                               -> { notifications: NotificationView[], unread: number }
// POST /api/notifications/read         body: { ids?: ID[] } (omitted = all) -> { unread: number }
// GET  /api/threads                                                     -> { threads: ThreadView[] }
// GET  /api/threads/:id/messages?before                                 -> { messages: Message[] }
// POST /api/threads/:id/messages       body: { text }                   -> { message: Message }
// POST /api/threads                    body: { memberIds, name? }       -> { thread: ThreadView }   (returns the existing 1:1 thread)
// GET  /api/search?q&type                                               -> SearchResponse
// GET  /api/listings  /  GET /api/listings/:id                          -> { listings: Listing[] } / { listing: Listing, seller: PersonCard }
// GET  /api/reels                                                       -> { reels: Reel[] }

import type { SideQuestAudience, SideQuestChallenge, SideQuestPhase } from './sidequest';
import type {
  Audience, Availability, Comment, Crew, DailyEntry, DailyQuest, Event, EventRsvp, FriendList,
  Friendship, Group, GroupRole, ID, Invite, LatLng, Listing, Memory, Message, MusePlan,
  Notification, PlanSuggestion, Post, Profile, Quest, ReactionCounts, ReactionType, Reel,
  RsvpStatus, Story, Thread,
} from './types';

export type ApiError = { error: string };

// ---- Kit ----
export type QuestsQuery = { lat: number; lng: number; radiusM?: number; viewerId?: ID };
export type QuestsResponse = { quests: Quest[] };
export type YourPlan = { quest: Quest; members: PersonCard[]; walkMinutes: number; crewId: ID | null };
export type YourPlansResponse = { plans: YourPlan[] };
export type CreateQuestBody = Omit<Quest, 'id' | 'memberIds' | 'status' | 'createdAt' | 'approxLocation'>;
export type QuestResponse = { quest: Quest };
export type JoinQuestBody = { userId: ID; withFriendId?: ID };
export type JoinQuestResponse = { quest: Quest; seatsLeft: number };
export type LeaveQuestBody = { userId: ID };
export type LeaveQuestResponse = { quest: Quest; seatsLeft: number };
export type CompleteQuestBody = { userId: ID };
export type CompleteQuestResponse = { quest: Quest; crew: Crew };
export type CreateAvailabilityBody = {
  userId: ID; text: string; startsAt: string; endsAt: string; location: LatLng;
};
export type AvailabilityResponse = { availability: Availability };
export type FriendAvailabilityResponse = { items: (Availability & { friend: Profile })[] };
export type UsersResponse = { users: Profile[] };
export type CreateInviteBody = {
  fromId: ID; toId: ID; questId: ID | null; suggestionTitle: string; message: string;
};
export type InviteResponse = { invite: Invite };
export type RespondInviteBody = { status: 'accepted' | 'declined' };
export type RespondInviteResponse = { invite: Invite; quest?: Quest };
export type CrewsResponse = { crews: Crew[] };
export type MemoryResponse = { memory: Memory };
export type MemoriesResponse = { memories: Memory[] };
export type DailyResponse = DailyQuest;
export type DailyEntryBody = { date: string; userId: ID; photoUrl: string };
export type DailyEntryResponse = { entry: DailyEntry };
export type StreakResponse = { weeks: number; thisWeekDone: boolean };
export type MusePlanBody = { userId: ID; text: string; location: LatLng; now?: string };
export type MusePlanResponse = MusePlan;
export type MuseRegroupBody = { crewId: ID; now?: string };
export type MuseRegroupResponse = { suggestion: PlanSuggestion; message: string };
export type MuseCreateQuestBody = { userId: ID; text: string; location: LatLng };
export type MuseCreateQuestResponse = { draft: Partial<Quest>; pitch: string };
export type MuseCaptionBody = { questId: ID };
export type MuseCaptionResponse = { caption: string };
export type MuseDailyBody = { date: string };
export type MuseVerifyPhotoBody = { date: string; photoUrl: string };
export type MuseVerifyPhotoResponse = { verified: boolean; note: string };
export type MuseWrappedBody = { userId: ID; month: string };
export type WrappedCard = { title: string; body: string; stat?: string; photoUrl?: string };
export type MuseWrappedResponse = { cards: WrappedCard[] };

// ---- Facebook base: view models ----
/** The small person shape lists use; never carries profile fields the viewer cannot see. */
export type PersonCard = {
  id: ID; handle: string; name: string; avatarUrl: string;
  mutualFriendCount: number; isFriend: boolean; online?: boolean;
};

export type CommentView = Comment & { author: PersonCard; replies: CommentView[] };

export type PostView = Post & {
  author: PersonCard;
  group: { id: ID; slug: string; name: string } | null;
  reactionCounts: ReactionCounts;
  topReactions: ReactionType[];   // up to 3, most used first
  viewerReaction: ReactionType | null;
  commentCount: number;
  previewComments: CommentView[]; // the latest 1–2
  shareCount: number;
};

export type FeedResponse = { posts: PostView[]; nextCursor: string | null };

export type CreatePostBody = {
  text: string;
  media?: string[];               // urls returned by POST /api/uploads
  audience: Audience;
  target?: { type: 'profile' } | { type: 'group'; slug: string } | { type: 'event'; slug: string };
  sharedPostId?: ID;
};

export type ReactResponse = { reactionCounts: ReactionCounts; viewerReaction: ReactionType | null };

export type StoryGroup = { author: PersonCard; stories: Story[]; seen: boolean };

/** Profile with fields the viewer may not see set to null (canSee per fieldVisibility). */
export type ProfileResponse = {
  profile: Profile;
  friendCount: number;
  friendPreview: PersonCard[];    // avatar stack
  mutualFriendCount: number;
  relationship: 'self' | 'friends' | 'request_sent' | 'request_received' | 'none';
};

export type FriendRequestView = { friendship: Friendship; person: PersonCard };

export type GroupView = Group & { viewerRole: GroupRole | null; friendMemberCount: number };
export type GroupResponse = { group: GroupView; admins: PersonCard[] };

export type EventView = Event & { viewerRsvp: RsvpStatus | null; friendsGoing: PersonCard[] };
export type EventResponse = { event: EventView; host: PersonCard; guests: (EventRsvp & { person: PersonCard })[] };

export type NotificationView = Notification & { actor: PersonCard | null; href: string };

export type ThreadView = Thread & {
  members: PersonCard[]; lastMessage: Message | null; unreadCount: number;
};

export type SearchType = 'all' | 'people' | 'groups' | 'events' | 'quests';
export type SearchResponse = {
  people: PersonCard[]; groups: GroupView[]; events: EventView[]; quests: Quest[];
};

export type FriendsResponse = { friends: PersonCard[] };
export type FriendListsResponse = { lists: FriendList[] };
export type ListingsResponse = { listings: Listing[] };
export type ListingResponse = { listing: Listing; seller: PersonCard };
export type ReelsResponse = { reels: Reel[] };
export type MessagesResponse = { messages: Message[] };
export type ThreadsResponse = { threads: ThreadView[] };

// ---- Daily Side Quests (spec: docs/DAILY_SIDE_QUESTS.md) ----
// GET    /api/daily/side-quest                  -> SideQuestState   (creates today's persisted drop on first read)
// POST   /api/daily/side-quest/submit           multipart: photo, audience, caption?, crewId? -> SideQuestSubmitResponse
// GET    /api/daily/side-quest/board?date       -> SideQuestBoardResponse
// DELETE /api/daily/side-quest/entry?date       -> SideQuestState   (unshare: removes the board post, keeps the private memory)
// POST   /api/daily/side-quest/report           body: { date, userId }
// GET    /api/daily/side-quest/history          -> SideQuestHistoryResponse
// GET|PUT /api/daily/side-quest/prefs           -> SideQuestPrefs   (active window / quiet hours)
// GET    /api/daily/photo?date&userId           -> image bytes (owner, or anyone when shared with the community)
export type SideQuestPrefs = { startMin: number; endMin: number; tz: string };

/** A person's own entry for a date (private unless shared). */
export type SideQuestEntry = {
  date: string; challengeId: string; photoUrl: string; caption: string; audience: SideQuestAudience;
  /** Submitted before the deadline. Always true for entries made through the quest. */
  onTime: boolean; submittedAt: string;
  /** The board post when shared with the community. */
  postId: string | null;
  /** Also added to this crew's album, when the person chose to. */
  crewMemoryId: string | null;
};

export type SideQuestState = {
  date: string;
  challenge: SideQuestChallenge;
  phase: SideQuestPhase;
  /** Server clock, so the countdown stays right when the device clock is wrong. */
  serverNow: string;
  dropAt: string;
  deadlineAt: string;
  durationMinutes: number;
  prefs: SideQuestPrefs;
  entry: SideQuestEntry | null;
  /** People who shared today's entry with the community. */
  boardCount: number;
  /** Crews the viewer can add the photo to. */
  crews: { id: string; name: string }[];
  /** The viewer's weekly in-person streak (existing meaning, unchanged). */
  weeklyStreak: { weeks: number; thisWeekDone: boolean };
};

export type SideQuestBoardEntry = {
  date: string; userId: ID;
  /** First name only for anyone who is not a friend. */
  author: { name: string; avatarUrl: string; isFriend: boolean };
  photoUrl: string; caption: string; onTime: boolean; submittedAt: string;
  postId: string;
  reactionCounts: ReactionCounts; viewerReaction: ReactionType | null;
  mine: boolean;
};

export type SideQuestBoardResponse = {
  date: string;
  challenge: SideQuestChallenge;
  /** Entries shared with the community for this date. */
  count: number;
  /** Entries are shown after you have entered or the quest ended; before that only the count. */
  entriesVisible: boolean;
  entries: SideQuestBoardEntry[];
};

export type SideQuestSubmitResponse = { entry: SideQuestEntry; state: SideQuestState };

export type SideQuestHistoryItem = {
  date: string; challengeId: string; title: string; emoji: string;
  /** What happened that day: done, ended without a photo, today, or nothing to show. */
  status: 'completed' | 'missed' | 'today' | 'none';
  entry: SideQuestEntry | null;
};
export type SideQuestHistoryResponse = {
  /** The last 7 days, oldest first. */
  week: SideQuestHistoryItem[];
  completedCount: number;
  /** Completed entries, newest first (the personal Side Quest memories). */
  memories: (SideQuestEntry & { title: string; emoji: string })[];
};
