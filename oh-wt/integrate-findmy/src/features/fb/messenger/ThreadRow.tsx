'use client';

import Link from 'next/link';
import type { ThreadView } from '@/shared/api';
import { Avatar, cn } from '@/features/ui';
import { ROUTES } from '@/features/fb/shell/nav';
import { lastActivity, otherMembers, shortAgo, snippet, threadTitle } from './format';

/** One avatar for a 1:1 chat; two overlapping ones for a group. */
export function ThreadAvatar({ thread, viewerId, size = 56, online }: {
  thread: ThreadView; viewerId: string; size?: 40 | 56; online?: Set<string>;
}) {
  const others = otherMembers(thread, viewerId);
  if (thread.isGroup && others.length > 1) {
    const small: 28 | 36 = size === 56 ? 36 : 28;
    return (
      <span className="relative inline-block shrink-0" style={{ width: size, height: size }} aria-hidden>
        <span className="absolute right-0 top-0">
          <Avatar src={others[1].avatarUrl} name={others[1].name} size={small} decorative />
        </span>
        <span className="absolute bottom-0 left-0 rounded-full ring-2 ring-fb-surface">
          <Avatar src={others[0].avatarUrl} name={others[0].name} size={small} decorative />
        </span>
      </span>
    );
  }
  const p = others[0];
  const isOnline = !!(p && (online?.has(p.id) || p.online));
  return <Avatar src={p?.avatarUrl} name={p?.name ?? 'Chat'} size={size} online={isOnline} decorative />;
}

export function ThreadRow({ thread, viewerId, active, online, onNavigate, now }: {
  thread: ThreadView; viewerId: string; active?: boolean; online?: Set<string>;
  onNavigate?: () => void; now?: number;
}) {
  const unread = thread.unreadCount > 0 && !active;
  const title = threadTitle(thread, viewerId);
  return (
    <Link
      href={ROUTES.thread(thread.id)}
      onClick={onNavigate}
      data-testid="thread-row"
      data-thread-id={thread.id}
      data-title={title}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-card px-2 py-2 transition-colors',
        active ? 'bg-fb-blue-tint' : 'hover:bg-fb-hover',
      )}
    >
      <ThreadAvatar thread={thread} viewerId={viewerId} online={online} />
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-[15px] leading-5 text-fb-text', unread ? 'font-bold' : 'font-medium')}>{title}</span>
        <span className={cn('flex min-w-0 gap-1 text-[13px] leading-4', unread ? 'font-bold text-fb-text' : 'text-fb-text-2')}>
          <span className="truncate" data-testid="thread-snippet">{snippet(thread, viewerId)}</span>
          <span aria-hidden className="shrink-0">·</span>
          <span className="shrink-0">{shortAgo(lastActivity(thread), now)}</span>
        </span>
      </span>
      {unread && <span className="h-3 w-3 shrink-0 rounded-full bg-fb-blue" data-testid="unread-dot"><span className="sr-only">Unread</span></span>}
    </Link>
  );
}
