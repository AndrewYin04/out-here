// DataStore: everything the Facebook and Out Here UIs read and write, for one viewer at a time.
// Two implementations share the logic in core.ts: SupabaseStore (server-only, service key) and
// MemoryStore (seeded in-process). getStore() picks SupabaseStore when the Supabase URL and the
// service key for DATA_TARGET are present, else MemoryStore. Server-only module.
import type { CoreStore } from './core';
import { supabaseEnv } from './env';
import { sharedMemoryStore } from './memory-store';
import { createSupabaseStore } from './supabase-store';

/** Every method takes the viewer's profile id first (from getViewer) and applies canSee for them. */
export interface DataStore {
  readonly kind: 'memory' | 'supabase';
  // identity / people
  profileByHandle: CoreStore['profileByHandle'];
  users: CoreStore['users'];
  // feed, posts, reactions, comments, share (createPost with sharedPostId), stories
  feed: CoreStore['feed'];
  post: CoreStore['post'];
  createPost: CoreStore['createPost'];
  react: CoreStore['react'];
  comments: CoreStore['comments'];
  addComment: CoreStore['addComment'];
  stories: CoreStore['stories'];
  // profiles
  profile: CoreStore['profile'];
  updateProfile: CoreStore['updateProfile'];
  profilePosts: CoreStore['profilePosts'];
  profilePhotos: CoreStore['profilePhotos'];
  profileFriends: CoreStore['profileFriends'];
  // friends
  friends: CoreStore['friends'];
  mutualFriends: CoreStore['mutualFriends'];
  friendRequests: CoreStore['friendRequests'];
  sendFriendRequest: CoreStore['sendFriendRequest'];
  respondFriendRequest: CoreStore['respondFriendRequest'];
  unfriend: CoreStore['unfriend'];
  suggestions: CoreStore['suggestions'];
  friendLists: CoreStore['friendLists'];
  createFriendList: CoreStore['createFriendList'];
  renameFriendList: CoreStore['renameFriendList'];
  deleteFriendList: CoreStore['deleteFriendList'];
  addListMember: CoreStore['addListMember'];
  removeListMember: CoreStore['removeListMember'];
  // groups
  groups: CoreStore['groups'];
  group: CoreStore['group'];
  groupPosts: CoreStore['groupPosts'];
  groupMembers: CoreStore['groupMembers'];
  groupHangouts: CoreStore['groupHangouts'];
  joinGroup: CoreStore['joinGroup'];
  leaveGroup: CoreStore['leaveGroup'];
  // events
  events: CoreStore['events'];
  event: CoreStore['event'];
  rsvp: CoreStore['rsvp'];
  // notifications, messenger, search
  notifications: CoreStore['notifications'];
  markNotificationsRead: CoreStore['markNotificationsRead'];
  threads: CoreStore['threads'];
  messages: CoreStore['messages'];
  sendMessage: CoreStore['sendMessage'];
  openThread: CoreStore['openThread'];
  search: CoreStore['search'];
  // Out Here
  questsNear: CoreStore['questsNear'];
  yourPlans: CoreStore['yourPlans'];
  quest: CoreStore['quest'];
  createQuest: CoreStore['createQuest'];
  joinQuest: CoreStore['joinQuest'];
  leaveQuest: CoreStore['leaveQuest'];
  completeQuest: CoreStore['completeQuest'];
  questPosts: CoreStore['questPosts'];
  checkIn: CoreStore['checkIn'];
  reportQuest: CoreStore['reportQuest'];
  createAvailability: CoreStore['createAvailability'];
  myAvailability: CoreStore['myAvailability'];
  clearAvailability: CoreStore['clearAvailability'];
  freeWithMe: CoreStore['freeWithMe'];
  openTogether: CoreStore['openTogether'];
  createTogether: CoreStore['createTogether'];
  togetherPlans: CoreStore['togetherPlans'];
  resetStory: CoreStore['resetStory'];
  together: CoreStore['together'];
  voteTogether: CoreStore['voteTogether'];
  friendAvailability: CoreStore['friendAvailability'];
  invites: CoreStore['invites'];
  invite: CoreStore['invite'];
  createInvite: CoreStore['createInvite'];
  respondInvite: CoreStore['respondInvite'];
  crews: CoreStore['crews'];
  memories: CoreStore['memories'];
  addMemory: CoreStore['addMemory'];
  memoryPhoto: CoreStore['memoryPhoto'];
  daily: CoreStore['daily'];
  dailyEntry: CoreStore['dailyEntry'];
  streak: CoreStore['streak'];
  // marketplace, reels, uploads
  listings: CoreStore['listings'];
  listing: CoreStore['listing'];
  reels: CoreStore['reels'];
  uploadFile: CoreStore['uploadFile'];
  /** Raw tables + view helpers for server-side Muse candidate generation. Never send to the browser. */
  museContext: CoreStore['museContext'];
  // friend locations (Find My)
  friendPins: CoreStore['friendPins'];
  myLocation: CoreStore['myLocation'];
  updateMyLocation: CoreStore['updateMyLocation'];
  // walking there together (#46)
  walkers: CoreStore['walkers'];
  postWalkStep: CoreStore['postWalkStep'];
  hangInvite: CoreStore['hangInvite'];
  hangSuggestion: CoreStore['hangSuggestion'];
}

const g = globalThis as unknown as { __outhereSupabaseStore?: { key: string; store: DataStore } };

export function getStore(): DataStore {
  const env = supabaseEnv();
  if (!env) return sharedMemoryStore();
  const key = `${env.target}|${env.url}`;
  if (!g.__outhereSupabaseStore || g.__outhereSupabaseStore.key !== key) {
    g.__outhereSupabaseStore = { key, store: createSupabaseStore(env) };
  }
  return g.__outhereSupabaseStore.store;
}

export type { CoreStore };
