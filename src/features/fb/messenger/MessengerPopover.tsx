'use client';

import { MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useOnline, useViewer } from '@/features/data';
import { Badge, EmptyState, IconButton, Popover, Skeleton } from '@/features/ui';
import { ROUTES } from '@/features/fb/shell/nav';
import { ChatFilterChips, ChatSearch, ChatsHeader, NewMessagePicker, useChatFilter } from './ChatListControls';
import { ThreadRow } from './ThreadRow';
import { useThreads } from './useThreads';

/** Top-bar Messenger button: live count of unread chats and a panel with the 6 newest chats. */
export function MessengerPopover({ active = false, fallbackCount = 0 }: { active?: boolean; fallbackCount?: number }) {
  const { viewer } = useViewer();
  const online = useOnline();
  const { threads, unread } = useThreads();
  const count = threads ? unread : fallbackCount;
  const { query, setQuery, filter, setFilter, shown } = useChatFilter(threads, viewer.id);
  const [composing, setComposing] = useState(false);
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
        <div data-testid="messenger-panel" className="flex max-h-[calc(100dvh-80px)] flex-col">
          {composing ? (
            <div className="flex h-[420px] flex-col">
              <NewMessagePicker onClose={() => setComposing(false)} onNavigate={close} />
            </div>
          ) : (
            <>
              <div className="px-2 pt-1">
                <ChatsHeader threads={threads} as="h2" onNavigate={close} onCompose={() => setComposing(true)} />
                <ChatSearch value={query} onChange={setQuery} />
                <ChatFilterChips value={filter} onChange={setFilter} />
              </div>
              <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
                {!shown ? (
                  Array.from({ length: 4 }, (_, i) => (
                    <div key={i} className="flex items-center gap-3 px-2 py-2">
                      <Skeleton shape="circle" width={56} height={56} />
                      <div className="flex-1 space-y-2"><Skeleton width="50%" /><Skeleton width="70%" className="h-2.5" /></div>
                    </div>
                  ))
                ) : shown.length === 0 ? (
                  <EmptyState title={query || filter !== 'all' ? 'No chats match' : 'No chats yet'} />
                ) : (
                  shown.slice(0, 6).map((t) => (
                    <ThreadRow key={t.id} thread={t} viewerId={viewer.id} online={online} onNavigate={close} />
                  ))
                )}
              </div>
              <div className="mt-1 border-t border-fb-divider-soft pt-2 text-center">
                <Link href={ROUTES.messages} onClick={close} className="text-[15px] font-semibold text-fb-link hover:underline" data-testid="see-all-messenger">
                  See all in Messenger
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </Popover>
  );
}
