'use client';

import { apiFetch, apiPost } from '@/features/data';
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

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong';
}
