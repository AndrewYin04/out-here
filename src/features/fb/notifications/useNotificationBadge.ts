'use client';
// The unread badge shared by the top-bar bell and the mobile bottom-bar tab. It counts unread
// notifications that arrived after the list was last opened, so opening the panel or the
// notifications page clears it (as on Facebook) while rows keep their unread dots. Both badges
// read the same per-tab marker, and a window event keeps them in step within the tab.
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useViewer } from '@/features/data';
import type { NotificationView } from '@/shared/api';
import { NOTIFICATIONS_PATH } from './links';
import { useNotificationFeed } from './useNotificationFeed';

const SEEN_KEY = (handle: string) => `outhere.notif-seen.${handle}`;
const SEEN_EVENT = 'outhere:notif-seen';

function readSeen(handle: string): string | null {
  try { return window.sessionStorage.getItem(SEEN_KEY(handle)); } catch { return null; }
}
function writeSeen(handle: string, at: string) {
  try { window.sessionStorage.setItem(SEEN_KEY(handle), at); } catch { /* private mode */ }
}

function useSeenMarker(handle: string, list: NotificationView[] | null) {
  const [seenAt, setSeenAt] = useState<string | null>(null);
  useEffect(() => {
    setSeenAt(readSeen(handle));
    const onSeen = (e: Event) => {
      const d = (e as CustomEvent<{ handle: string; at: string }>).detail;
      if (d?.handle === handle) setSeenAt(d.at);
    };
    window.addEventListener(SEEN_EVENT, onSeen);
    return () => window.removeEventListener(SEEN_EVENT, onSeen);
  }, [handle]);
  const markSeen = useCallback(() => {
    if (!list) return;
    const newest = list.reduce((m, n) => (n.createdAt > m ? n.createdAt : m), seenAt ?? '');
    if (!newest || newest === seenAt) return;
    writeSeen(handle, newest);
    setSeenAt(newest);
    window.dispatchEvent(new CustomEvent(SEEN_EVENT, { detail: { handle, at: newest } }));
  }, [handle, list, seenAt]);
  const count = useMemo(
    () => (list ?? []).filter((n) => !n.readAt && (!seenAt || n.createdAt > seenAt)).length,
    [list, seenAt],
  );
  return { count, markSeen };
}

/** Live badge count for the tab's persona; it clears while the notifications page is open. */
export function useNotificationBadge() {
  const pathname = usePathname() ?? '/';
  const { handle } = useViewer();
  const feed = useNotificationFeed();
  const { count, markSeen } = useSeenMarker(handle, feed.notifications);
  const onPage = pathname === NOTIFICATIONS_PATH;
  useEffect(() => { if (onPage) markSeen(); }, [onPage, markSeen]);
  return { feed, count, markSeen, onPage };
}
