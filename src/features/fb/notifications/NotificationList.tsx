'use client';

import { AtSign, Bell, CalendarDays, Heart, MapPin, MessageCircle, MessageSquare, Sparkles, Store, UserPlus, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { Avatar, EmptyState, Skeleton, SkeletonGroup, cn } from '@/features/ui';
import type { NotificationType } from '@/shared';
import type { NotificationView } from '@/shared/api';
import { notificationLink } from './links';
import { timeAgo } from './time';

const TYPE_BADGE: Record<NotificationType, { icon: ReactNode; bg: string }> = {
  friend_request: { icon: <UserPlus size={14} />, bg: 'bg-fb-blue' },
  friend_accept: { icon: <UserPlus size={14} />, bg: 'bg-fb-blue' },
  comment: { icon: <MessageSquare size={14} />, bg: 'bg-[#20A464]' },
  reply: { icon: <AtSign size={14} />, bg: 'bg-[#20A464]' },
  reaction: { icon: <Heart size={14} fill="currentColor" />, bg: 'bg-[#F33E58]' },
  group_post: { icon: <Users size={14} />, bg: 'bg-fb-blue' },
  event_invite: { icon: <CalendarDays size={14} />, bg: 'bg-[#E4463B]' },
  quest_invite: { icon: <MapPin size={14} />, bg: 'bg-[#7A3CFF]' },
  quest_join: { icon: <MapPin size={14} />, bg: 'bg-[#7A3CFF]' },
  message: { icon: <MessageCircle size={14} />, bg: 'bg-fb-blue' },
  intro: { icon: <Sparkles size={14} />, bg: 'bg-[#6b3fd4]' },
  listing_hold: { icon: <Store size={14} />, bg: 'bg-[#E4A11B]' },
  listing_update: { icon: <Store size={14} />, bg: 'bg-[#E4A11B]' },
};

/** Bolds the actor's name where it opens the text. */
function RowText({ n }: { n: NotificationView }) {
  const full = n.actor?.name;
  const name = full && n.text.startsWith(full) ? full : full?.split(' ')[0];
  if (name && n.text.startsWith(name)) {
    return <><strong className="font-semibold">{name}</strong>{n.text.slice(name.length)}</>;
  }
  return <>{n.text}</>;
}

export function NotificationRow({ n, onOpen, compact }: { n: NotificationView; onOpen: (n: NotificationView) => void; compact?: boolean }) {
  const unread = !n.readAt;
  const badge = TYPE_BADGE[n.type] ?? { icon: <Bell size={14} />, bg: 'bg-fb-blue' };
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(n)}
        data-testid="notification-row"
        data-id={n.id}
        data-unread={unread ? 'true' : 'false'}
        data-href={notificationLink(n)}
        className="flex w-full items-center gap-3 rounded-btn px-2 py-2 text-left hover:bg-fb-hover focus-visible:bg-fb-hover"
      >
        <span className="relative shrink-0">
          <Avatar src={n.actor?.avatarUrl} name={n.actor?.name ?? 'Facebook'} size={compact ? 56 : 60} decorative />
          <span aria-hidden className={cn('absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full text-white ring-2 ring-white', badge.bg)}>
            {badge.icon}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('line-clamp-3 text-[15px] leading-5', unread ? 'text-fb-text' : 'text-fb-text-2')}>
            <RowText n={n} />
          </span>
          <span className={cn('mt-0.5 block text-fb-meta', unread ? 'font-semibold text-fb-link' : 'text-fb-text-2')}>
            {timeAgo(n.createdAt)}
          </span>
        </span>
        {unread && <span aria-label="Unread" role="img" className="h-3 w-3 shrink-0 rounded-full bg-fb-link" />}
      </button>
    </li>
  );
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * Notification rows in "New" (last 24 h) and "Earlier" sections. Clicking a row marks it read
 * and navigates to its object.
 */
export function NotificationList({
  notifications, loading, filter, markRead, compact = false, onNavigate, max,
}: {
  notifications: NotificationView[] | null;
  loading: boolean;
  filter: 'all' | 'unread';
  markRead: (ids?: string[]) => Promise<void>;
  compact?: boolean;
  onNavigate?: () => void;
  max?: number;
}) {
  const router = useRouter();
  if (loading || !notifications) {
    return (
      <SkeletonGroup label="notifications" className="flex flex-col gap-3 px-2 py-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton shape="circle" width={56} height={56} />
            <div className="flex flex-1 flex-col gap-2"><Skeleton className="h-3 w-4/5" /><Skeleton className="h-3 w-1/4" /></div>
          </div>
        ))}
      </SkeletonGroup>
    );
  }
  const shown = notifications.filter((n) => filter === 'all' || !n.readAt).slice(0, max);
  if (shown.length === 0) {
    return (
      <EmptyState
        icon={<Bell size={48} />}
        title={filter === 'unread' ? 'You have no unread notifications' : 'You have no notifications'}
      />
    );
  }
  const open = (n: NotificationView) => {
    if (!n.readAt) void markRead([n.id]);
    onNavigate?.();
    router.push(notificationLink(n));
  };
  const cutoff = Date.now() - DAY;
  const fresh = shown.filter((n) => new Date(n.createdAt).getTime() >= cutoff);
  const earlier = shown.filter((n) => new Date(n.createdAt).getTime() < cutoff);
  return (
    <div data-testid="notification-list">
      {fresh.length > 0 && (
        <section>
          <h2 className="px-2 pb-1 pt-2 text-fb-rail font-semibold text-fb-text">New</h2>
          <ul>{fresh.map((n) => <NotificationRow key={n.id} n={n} onOpen={open} compact={compact} />)}</ul>
        </section>
      )}
      {earlier.length > 0 && (
        <section>
          <h2 className="px-2 pb-1 pt-3 text-fb-rail font-semibold text-fb-text">Earlier</h2>
          <ul>{earlier.map((n) => <NotificationRow key={n.id} n={n} onOpen={open} compact={compact} />)}</ul>
        </section>
      )}
    </div>
  );
}

/** "All" / "Unread" pill chips, 36 px, tinted when selected. */
export function FilterChips({ value, onChange }: { value: 'all' | 'unread'; onChange: (v: 'all' | 'unread') => void }) {
  return (
    <div role="tablist" aria-label="Filter notifications" className="flex gap-1 px-2 py-1">
      {(['all', 'unread'] as const).map((v) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={value === v}
          onClick={() => onChange(v)}
          className={cn(
            'h-9 rounded-full px-3 text-[15px] font-semibold',
            value === v ? 'bg-fb-blue-tint text-fb-link' : 'text-fb-text hover:bg-fb-hover',
          )}
        >
          {v === 'all' ? 'All' : 'Unread'}
        </button>
      ))}
    </div>
  );
}
