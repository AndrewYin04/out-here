'use client';

import { ApiFetchError, apiFetch, apiPost } from '@/features/data';
import type { FriendListsResponse, FriendsResponse, PersonCard } from '@/shared/api';
import type { FriendList, Friendship } from '@/shared/types';

// Friend actions used by the Friends page and the profile header. Every call goes through
// the API with the tab's persona; the server applies the friend graph rules.

export const sendRequest = (toId: string) => apiPost<{ friendship: Friendship }>('/api/friends/requests', { toId });

export const respondRequest = (fromId: string, action: 'confirm' | 'delete') =>
  apiPost<{ friendship: Friendship | null }>('/api/friends/requests/respond', { fromId, action });

/** Unfriend, or cancel a pending request in either direction. */
export const removeFriend = (userId: string) =>
  apiFetch<{ ok: true }>(`/api/friends/${encodeURIComponent(userId)}`, { method: 'DELETE' });

export const createList = (name: string) => apiPost<{ list: FriendList }>('/api/friend-lists', { name });

export const addToList = (listId: string, userId: string) =>
  apiPost<{ list: FriendList }>(`/api/friend-lists/${listId}/members`, { userId });

export const removeFromList = (listId: string, userId: string) =>
  apiFetch<{ list: FriendList }>(`/api/friend-lists/${listId}/members/${userId}`, { method: 'DELETE' });

export type { FriendListsResponse, FriendsResponse, PersonCard };

/**
 * Message buttons link to /messages?to=<handle>. Turn this on at merge once the Messenger
 * slice opens or creates the 1:1 thread from ?to=; until then the buttons are hidden.
 */
export const MESSENGER_TO_READY = false;

/** True when the server says the request or friendship no longer exists (the other person acted first). */
export function isGone(e: unknown): boolean {
  return e instanceof ApiFetchError && (e.status === 404 || e.status === 409);
}

export const GONE_NOTE = 'This request is no longer available';

/** Facebook-style copy for a failed action; never the raw server string. */
export function errorText(e: unknown): string {
  if (e instanceof ApiFetchError) {
    if (e.status === 404) return "This content isn't available right now.";
    if (e.status === 409) return 'This has already been done.';
    if (e.status === 403) return "You can't do that right now.";
  }
  return 'Something went wrong. Please try again.';
}
