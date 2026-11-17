'use client';

import { Bell, Check, MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Badge, IconButton, MenuItem, Popover } from '@/features/ui';
import { NOTIFICATIONS_PATH } from './links';
import { FilterChips, NotificationList } from './NotificationList';
import { useNotificationBadge } from './useNotificationBadge';

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
  const { feed, count, markSeen, onPage } = useNotificationBadge();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

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
