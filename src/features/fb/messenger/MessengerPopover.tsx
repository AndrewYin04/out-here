'use client';

import { MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { useOnline, useViewer } from '@/features/data';
import { Badge, EmptyState, IconButton, Popover, Skeleton } from '@/features/ui';
import { ROUTES } from '@/features/fb/shell/nav';
import { ThreadRow } from './ThreadRow';
import { useThreads } from './useThreads';

/** Top-bar Messenger button: live count of unread chats and a panel with the 6 newest chats. */
export function MessengerPopover({ active = false, fallbackCount = 0 }: { active?: boolean; fallbackCount?: number }) {
  const { viewer } = useViewer();
  const online = useOnline();
  const { threads, unread } = useThreads();
  const count = threads ? unread : fallbackCount;
  return (
    <Popover
      label="Chats"
      kind="dialog"
      width={360}
      className="p-2"
      trigger={(props, open) => (
        <IconButton
          label="Messenger"
          {...props}
          active={open || active}
          data-testid="messenger-button"
          badge={<Badge count={count} floating label={`${count} unread chats`} />}
        >
          <MessageCircle size={20} aria-hidden />
        </IconButton>
      )}
    >
      {(close) => (
        <div data-testid="messenger-panel">
          <h2 className="px-2 pt-1 text-fb-title font-bold text-fb-text">Chats</h2>
          <div className="mt-2">
            {!threads ? (
              Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="flex items-center gap-3 px-2 py-2">
                  <Skeleton shape="circle" width={56} height={56} />
                  <div className="flex-1 space-y-2"><Skeleton width="50%" /><Skeleton width="70%" className="h-2.5" /></div>
                </div>
              ))
            ) : threads.length === 0 ? (
              <EmptyState title="No chats yet" />
            ) : (
              threads.slice(0, 6).map((t) => (
                <ThreadRow key={t.id} thread={t} viewerId={viewer.id} online={online} onNavigate={close} />
              ))
            )}
          </div>
          <div className="mt-1 border-t border-fb-divider-soft pt-2 text-center">
            <Link href={ROUTES.messages} onClick={close} className="text-[15px] font-semibold text-fb-link hover:underline" data-testid="see-all-messenger">
              See all in Messenger
            </Link>
          </div>
        </div>
      )}
    </Popover>
  );
}
