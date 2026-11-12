'use client';

import { useState } from 'react';
import { Card } from '@/features/ui';
import { NotificationsMenu } from './NotificationsPopover';
import { FilterChips, NotificationList } from './NotificationList';
import { useNotificationFeed } from './useNotificationFeed';

/** /notifications: the full list (the phone's Notifications tab lands here). */
export function NotificationsPage() {
  const feed = useNotificationFeed();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  return (
    <Card flushOnMobile className="pb-2 md:p-2" data-testid="notifications-page">
      <div className="flex items-center justify-between px-4 pt-3 md:px-2 md:pt-1">
        <h1 className="text-fb-title font-bold text-fb-text">Notifications</h1>
        <NotificationsMenu markRead={feed.markRead} />
      </div>
      <div className="px-2 md:px-0">
        <FilterChips value={filter} onChange={setFilter} />
        <NotificationList notifications={feed.notifications} loading={feed.loading} filter={filter} markRead={feed.markRead} />
      </div>
    </Card>
  );
}
