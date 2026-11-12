'use client';

import { Bell, Check, MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useViewer } from '@/features/data';
import { Badge, IconButton, MenuItem, Popover } from '@/features/ui';
import type { NotificationView } from '@/shared/api';
import { NOTIFICATIONS_PATH } from './links';
import { FilterChips, NotificationList } from './NotificationList';
import { useNotificationFeed } from './useNotificationFeed';

const SEEN_KEY = (handle: string) => `outhere.notif-seen.${handle}`;

function readSeen(handle: string): string | null {
  try { return window.sessionStorage.getItem(SEEN_KEY(handle)); } catch { return null; }
}
function writeSeen(handle: string, at: string) {
  try { window.sessionStorage.setItem(SEEN_KEY(handle), at); } catch { /* private mode */ }
}

/**
 * The badge counts unread notifications that arrived after the panel was last opened, so
 * opening the panel clears it (as on Facebook) while rows keep their unread dots.
 */
function useSeenMarker(handle: string, list: NotificationView[] | null) {
  const [seenAt, setSeenAt] = useState<string | null>(null);
  useEffect(() => { setSeenAt(readSeen(handle)); }, [handle]);
  const markSeen = useCallback(() => {
    if (!list) return;
    const newest = list.reduce((m, n) => (n.createdAt > m ? n.createdAt : m), seenAt ?? '');
    if (!newest) return;
    writeSeen(handle, newest);
    setSeenAt(newest);
  }, [handle, list, seenAt]);
  const count = useMemo(
    () => (list ?? []).filter((n) => !n.readAt && (!seenAt || n.createdAt > seenAt)).length,
    [list, seenAt],
  );
  return { count, markSeen };
}

export function NotificationsMenu({ markRead }: { markRead: (ids?: string[]) => Promise<void> }) {
  return (
    <Popover
      label="Notification options"
      width={300}
      trigger={(props, open) => (
        <IconButton label="Notification options" {...props} active={open} tone="plain">
          <MoreHorizontal size={20} aria-hidden />
        </IconButton>
      )}
    >
      {(close) => (
        <MenuItem icon={<Check size={20} aria-hidden />} onSelect={() => { void markRead(); close(); }}>
          Mark all as read
        </MenuItem>
      )}
    </Popover>
  );
}

/** Top-bar bell: live unread badge and a 360 px notifications panel. */
export function NotificationsPopover() {
  const pathname = usePathname() ?? '/';
  const { handle } = useViewer();
  const feed = useNotificationFeed();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const { count, markSeen } = useSeenMarker(handle, feed.notifications);
  const onPage = pathname === NOTIFICATIONS_PATH;

  useEffect(() => { if (onPage) markSeen(); }, [onPage, markSeen]);

  return (
    <Popover
      label="Notifications"
      kind="dialog"
      width={360}
      className="p-2"
      trigger={(props, open) => (
        <IconButton
          label="Notifications"
          {...props}
          onClick={() => { if (!open) markSeen(); props.onClick(); }}
          active={open || onPage}
          data-testid="notifications-bell"
          badge={<Badge count={count} floating label={`${count} new notifications`} />}
        >
          <Bell size={20} aria-hidden />
        </IconButton>
      )}
    >
      {(close) => (
        <div data-testid="notifications-panel">
          <div className="flex items-center justify-between px-2 pt-1">
            <h2 className="text-fb-title font-bold text-fb-text">Notifications</h2>
            <NotificationsMenu markRead={feed.markRead} />
          </div>
          <FilterChips value={filter} onChange={setFilter} />
          <div className="flex items-center justify-between px-2 pt-1">
            <span className="sr-only">{feed.unread} unread</span>
            <span />
            <Link href={NOTIFICATIONS_PATH} onClick={close} className="text-[15px] text-fb-link hover:underline">
              See all
            </Link>
          </div>
          <NotificationList
            notifications={feed.notifications}
            loading={feed.loading}
            filter={filter}
            markRead={feed.markRead}
            compact
            max={20}
            onNavigate={close}
          />
        </div>
      )}
    </Popover>
  );
}
