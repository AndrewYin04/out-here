// Request/response contracts for every route. The route list comments are the source of
// truth for paths; the types below are what handlers accept and return.
//
// Identity: the active persona travels as the `x-persona: <handle>` header (see plan 4.1).
// Every route validates input with zod and answers bad input with a 4xx `{ error: string }`.
//
// ---- Kit (Out Here) ----
// GET  /api/quests?lat&lng&radiusM&viewerId          -> { quests: Quest[] }     (approxLocation unless member)
// GET  /api/quests/mine                                           -> { plans: YourPlan[] }
// POST /api/quests                     body: CreateQuestBody -> { quest }   (429 after EVENTS_PER_DAY in 24 h; publishes quests:new {questId})
// GET  /api/quests/:id                                                  -> QuestDetail   (members [] + canSeeGuests false for strangers)
// POST /api/quests/:id/checkin         body: { location }               -> { hereCount }   (members, live, within 150 m)
// POST /api/quests/:id/report          body: { reason? }                -> { ok: true }    (hides the plan for the reporter)
// GET  /api/quests/:id/posts                                            -> { posts: PostView[] }   (the plan page's activity feed)
// POST /api/quests/:id/posts           body: { text, media? }           -> { post: PostView }
// POST /api/quests/:id/join            body: { userId, withFriendId? }  -> { quest, seatsLeft }   (409 if full)
// POST /api/quests/:id/leave           body: { userId }                 -> { quest, seatsLeft }
// POST /api/quests/:id/complete        body: { userId? }                -> { quest, crew }        (attendee, after the start)
// POST /api/availability               body: { userId, text, startsAt, endsAt, location } -> { availability }
// DELETE /api/availability                                              -> { ok: true }  ("Busy": ends the viewer's windows)
// GET  /api/availability/free-with-me                                   -> FreeWithMeResponse (friends free when the viewer is, ranked)
// POST /api/together                   body: { friendIds }              -> TogetherResponse  (opens the group's shared plan, or creates it with Muse)
// GET  /api/together                                                    -> { plans: TogetherView[] }  (viewer's open + just-confirmed plans)
// GET  /api/together/:id                                                -> TogetherResponse
// POST /api/together/:id/vote          body: { questId, in }            -> TogetherResponse  (locks when every member is in on one option)
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
// GET  /api/quests/:id/rating          (viewer from x-persona)          -> HangoutRatingState      (viewer's own rating only)
// PUT  /api/quests/:id/rating          body: RateHangoutBody            -> { rating: HangoutRating } (attendee, after start; upsert)
// GET  /api/quests/:id/recap           (viewer from x-persona)          -> HangoutRecap            (members only; no hang-again, no notes)
// POST /api/muse/rating-takeaway      body: { questId }                -> { takeaway: string, byMuse: boolean } (done-screen line; byMuse false = code template)
// GET  /api/me/ratings                 (viewer from x-persona)          -> { ratings: MyRating[] } (own history, score desc; photos resolved)
// GET  /api/daily?date / POST /api/daily/entry                          -> DailyQuest / { entry }
// GET  /api/me/:userId/streak                                           -> { weeks: number, thisWeekDone: boolean }
// POST /api/muse/plan                  body: { userId, text, location, now? } -> MusePlan
// POST /api/muse/regroup               body: { crewId, now? }           -> { suggestion: PlanSuggestion, message: string }
// POST /api/muse/create-quest          body: { text, location, now? }   -> { draft: Partial<Quest> & { durationMin }, pitch: string }
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
// ---- Marketplace pickup on the Out Here map ----
// GET  /api/listings/map                                               -> { listings: MapListing[] }   (pickup window open, not sold)
// GET  /api/listings/:id/pickup                                        -> { listing: MapListing }      (any status, so a sheet can show "Sold")
// POST /api/listings                   body: CreateListingBody          -> { listing: MapListing }      (publishes listings:new {listingId})
// POST /api/listings/:id/holds         body: HoldRequestBody            -> { listing: MapListing }      (409 when reserved or you already asked)
// POST /api/listing-holds/:id/respond  body: { accept: boolean }        -> { listing: MapListing }      (seller; 409 when already reserved)
// POST /api/listing-holds/:id/release                                  -> { listing: MapListing }      (buyer or seller cancels)
// POST /api/listings/:id/sold                                          -> { listing: MapListing }      (seller; leaves the map)
// GET  /api/muse/wants  /  POST /api/muse/wants  body: { text }        -> { wants: MuseWant[] } / { want: MuseWant }
// DELETE /api/muse/wants?id=<id>                                       -> { ok: true }
// GET  /api/muse/finds?lat&lng                                         -> MuseFindsResponse (listings matching your wants, with Muse's line)
// ---- Watch + Muse Marketplace picks ----
// GET  /api/watch                                                       -> WatchResponse (the videos and the viewer's history)
// POST /api/watch/:key/view           body: { seconds }                -> { ok: true }     (publishes user:<id> {type:"watch"})
// GET  /api/muse/marketplace-picks?lat&lng&exclude=a,b                 -> MarketplacePicksResponse
// GET  /api/reels                                                       -> { reels: Reel[] }

import type {
  Audience, Availability, Comment, Crew, DailyEntry, DailyQuest, Event, EventRsvp, FriendList,
  Friendship, Group, GroupRole, HangoutRating, HangoutVerdict, ID, Invite, LatLng, Listing, ListingHold, ListingStatus, Memory, MuseWant, Message, MusePlan,
  Notification, PlanSuggestion, Post, Profile, Quest, ReactionCounts, ReactionType, Reel,
  RsvpStatus, Story, Thread,
  TogetherPlan,
} from './types';

export type ApiError = { error: string };

// ---- Kit ----
export type QuestsQuery = { lat: number; lng: number; radiusM?: number; viewerId?: ID };
export type QuestsResponse = { quests: Quest[] };
export type YourPlan = { quest: Quest; members: PersonCard[]; walkMinutes: number; crewId: ID | null };
export type YourPlansResponse = { plans: YourPlan[] };
export type CreateQuestBody = Omit<Quest, 'id' | 'memberIds' | 'status' | 'createdAt' | 'approxLocation' | 'isPublic'> & {
  /** Friends to invite; required for visibility 'friends' (invite only). */
  inviteIds?: ID[];
  /** The invite's text (a Muse draft); defaults to "<emoji> <title>, want to come?". */
  inviteMessage?: string;
};
export type QuestCheckinBody = { location: LatLng };
export type QuestCheckinResponse = { hereCount: number };
export type QuestReportBody = { reason?: string };
export type QuestPostBody = { text: string; media?: string[] };
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
export type FreeWithMeItem = {
  friend: PersonCard;
  from: string; until: string;        // overlap with the viewer's window
  text: string;                       // the friend's own note ("on a long lunch")
  sharedInterests: string[];
  knows: ID[];                        // other free friends this friend is friends with
  freeNow: boolean;
  score: number;
};
/** Empty when the viewer is busy. `group` is the suggested set of friend ids, best first. */
export type FreeWithMeResponse = { items: FreeWithMeItem[]; group: ID[] };
export type TogetherView = TogetherPlan & { members: PersonCard[] };
export type TogetherResponse = { plan: TogetherView };
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
export type MuseCreateQuestBody = { text: string; location: LatLng; now?: string };
export type MuseQuestDraft = Pick<Quest, 'title' | 'emoji' | 'category' | 'description' | 'venueName' | 'startsAt' | 'endsAt'
  | 'capacity' | 'priceMax' | 'tags' | 'placeId' | 'bubbleText'> & { location: LatLng };
export type MuseCreateQuestResponse = { draft: MuseQuestDraft; pitch: string };
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
  target?: { type: 'profile' } | { type: 'group'; slug: string } | { type: 'event'; slug: string } | { type: 'quest'; id: ID };
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

/** A listing as the Out Here map shows it to one viewer. */
export type MapListing = {
  /** location is the fuzzed pickup area unless `exact`; pickupSpot is null unless `exact`. */
  listing: Listing;
  status: ListingStatus;
  seller: PersonCard;
  /** True for the seller and for a buyer whose hold was accepted (and has not expired). */
  exact: boolean;
  /** The viewer's latest hold on this listing (buyer side). */
  myHold: ListingHold | null;
  /** When the current reservation ends (anyone sees "Reserved till 4:45 PM"). */
  reservedUntil: string | null;
  /** Seller only: open requests and the accepted hold, with the buyer. */
  requests: (ListingHold & { buyer: PersonCard })[];
};
export type MapListingsResponse = { listings: MapListing[] };
export type MapListingResponse = { listing: MapListing };
export type CreateListingBody = {
  title: string; priceUsd: number; category: string; description?: string; imageUrl?: string | null;
  /** pickupLabel defaults to the neighbourhood of `location`. */
  location: LatLng; pickupLabel?: string; pickupSpot: string; pickupUntil: string;
};
export type HoldRequestBody = { offerUsd: number; etaMin: number; message: string };
export type HoldRespondBody = { accept: boolean };
export type MuseWantsResponse = { wants: MuseWant[] };
/** One listing Muse surfaced for a want: the facts code checked, and Muse's one line. */
export type MuseFind = {
  listingId: ID; wantId: ID; title: string; priceUsd: number; imageUrl: string | null;
  driveMin: number; pickupUntil: string; listedMinAgo: number; sellerFirstName: string;
  line: string; source: 'muse' | 'mock' | 'fallback';
};
export type MuseFindsResponse = { finds: MuseFind[] };

/** A Watch video as the app shows it. */
export type WatchVideo = {
  key: string; title: string; minutes: number; topics: string[]; posterUrl: string;
  /** 'reel' is vertical (9:16). */
  format: 'video' | 'reel';
  /** Short clip made from Muse-generated images (scripts/gen-clips.mjs). */
  clipUrl: string;
  creator: PersonCard | null;
};
/** The viewer's history, one row per video: total seconds and the last time they watched it. */
export type WatchHistoryItem = { videoKey: string; seconds: number; lastAt: string };
export type WatchResponse = { videos: WatchVideo[]; history: WatchHistoryItem[] };

/** What Muse thinks the viewer is into, with the videos that show it. */
export type TasteTopic = { name: string; why: string; minutes: number; /** Watched in the last few minutes. */ justNow: boolean; evidence: { video: WatchVideo; minutes: number; seconds: number }[] };
export type MarketplacePick = {
  listing: Listing;
  seller: PersonCard;
  topic: string;
  reason: string;
  /** The watched videos behind this pick. */
  evidence: { video: WatchVideo; minutes: number; seconds: number }[];
  driveMin: number | null;
  /** A plan linked to this listing (quest tag listing:<id>), if any. */
  openHouse: { questId: ID; title: string; startsAt: string; venueName: string } | null;
  /** Its evidence includes a view from the last few minutes. */
  isNew: boolean;
};
export type MarketplacePicksResponse = {
  topics: TasteTopic[];
  picks: MarketplacePick[];
  /** Listings Muse checked and hid because they match nothing the viewer watches. */
  hidden: { listing: Listing; seller: PersonCard }[];
  checked: number;
  videosRead: number;
  source: 'muse' | 'mock' | 'fallback';
  ms: number;
};
export type ReelsResponse = { reels: Reel[] };
export type MessagesResponse = { messages: Message[] };
export type ThreadsResponse = { threads: ThreadView[] };

// ---- Post-hangout rating (spec: docs/HANGOUT_RATINGS.md) ----
export type RateHangoutBody = {
  verdict: HangoutVerdict; score: number; highlights: string[]; note?: string; photoIds?: ID[];
  again: { subjectId: ID; again: boolean }[];   // only other attendees; a person left out = not answered
};
export type HangoutRatingState = {
  rating: HangoutRating | null;
  photos: Memory[];                              // rating.photoIds resolved to memories, same order (render photoUrl as stored)
  again: { subjectId: ID; again: boolean }[];   // the viewer's own answers
  attendees: PersonCard[];                       // other members, for the "hang again?" rows
  compareWith: { questId: ID; title: string; emoji: string; score: number; verdict: HangoutVerdict }[]; // viewer's past rated hangouts, for placement
};
/** One row of GET /api/me/ratings. photos are rating.photoIds resolved to memories. */
export type MyRating = HangoutRating & { quest: Quest; photos: Memory[] };
export type HangoutRecap = {
  quest: Quest; members: PersonCard[]; photos: Memory[];
  ratedCount: number;
  // k-anonymity: until RECAP_MIN_OTHER_RATERS members other than the viewer have rated,
  // countsHidden is true, verdicts is null, and highlights holds only positive chips every rater
  // picked (count = ratedCount). Never a "Not for me" or negative-chip count below that.
  countsHidden: boolean;
  verdicts: Record<HangoutVerdict, number> | null;
  highlights: { label: string; count: number }[];   // counted across raters, most first
  myRating: HangoutRating | null;
};
