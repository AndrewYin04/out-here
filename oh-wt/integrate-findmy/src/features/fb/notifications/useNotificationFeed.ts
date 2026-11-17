'use client';
// Notifications for the tab's persona, live over user:<id>, plus a mark-read helper that
// updates the list at once and then takes the server's unread count.
import { useCallback, useEffect, useState } from 'react';
import { apiPost, useNotifications } from '@/features/data';
import type { NotificationView } from '@/shared/api';

export function useNotificationFeed() {
  const { data, loading, error, refetch } = useNotifications();
  const [local, setLocal] = useState<NotificationView[] | null>(null);
  const [unread, setUnread] = useState(0);

  // Read state changes are not broadcast, so a cached snapshot could show a row as unread after
  // it was opened; one fresh read on mount avoids that.
  useEffect(() => { void refetch(); }, [refetch]);

  useEffect(() => {
    if (!data) return;
    setLocal(data.notifications);
    setUnread(data.unread);
  }, [data]);

  const markRead = useCallback(async (ids?: string[]) => {
    const at = new Date().toISOString();
    setLocal((list) => list?.map((n) => ((!ids || ids.includes(n.id)) && !n.readAt ? { ...n, readAt: at } : n)) ?? null);
    setUnread((u) => (ids ? Math.max(0, u - ids.length) : 0));
    try {
      const r = await apiPost<{ unread: number }>('/api/notifications/read', ids ? { ids } : {});
      setUnread(r.unread);
    } catch {
      void refetch();
    }
  }, [refetch]);

  return { notifications: local, unread, loading: loading && !local, error, markRead, refetch };
}
