'use client';
// The viewer's chats, shared by the Messenger page and the top-bar popover. Refetches on
// user:<viewerId> (a message for the viewer, or a new thread) and on THREADS_EVENT, which this
// tab fires after it sends a message or opens a thread (opening one marks it read on the server).
import { useEffect, useMemo } from 'react';
import { useApi, useViewer } from '@/features/data';
import type { ThreadsResponse, ThreadView } from '@/shared/api';
import { sortThreads } from './format';

export const THREADS_EVENT = 'outhere:threads-changed';

export function notifyThreadsChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(THREADS_EVENT));
}

export function useThreads(): { threads: ThreadView[] | null; loading: boolean; error: string | null; unread: number; refetch: () => Promise<void> } {
  const { viewer } = useViewer();
  const api = useApi<ThreadsResponse>('/api/threads', [`user:${viewer.id}`]);
  const { refetch } = api;
  useEffect(() => {
    const on = () => { void refetch(); };
    window.addEventListener(THREADS_EVENT, on);
    return () => window.removeEventListener(THREADS_EVENT, on);
  }, [refetch]);
  const threads = useMemo(() => (api.data ? sortThreads(api.data.threads) : null), [api.data]);
  const unread = threads ? threads.filter((t) => t.unreadCount > 0).length : 0;
  return { threads, loading: api.loading && !api.data, error: api.error, unread, refetch };
}
