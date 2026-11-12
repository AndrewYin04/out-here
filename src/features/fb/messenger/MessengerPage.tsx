'use client';

import { MessageCircle } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { apiPost, currentPersona, useViewer } from '@/features/data';
import type { ThreadView } from '@/shared/api';
import { Card, EmptyState, Skeleton, SkeletonGroup, cn } from '@/features/ui';
import { ROUTES } from '@/features/fb/shell/nav';
import { Conversation } from './Conversation';
import { ChatFilterChips, ChatSearch, ChatsHeader, NewMessagePicker, useChatFilter } from './ChatListControls';
import { ThreadRow } from './ThreadRow';
import { usePresence } from './usePresence';
import { notifyThreadsChanged, useThreads } from './useThreads';

/**
 * /messages: chat list (360 px) and the open conversation on desktop; on phones the list and
 * the conversation are separate views. ?thread=<id> opens a chat; ?to=<handle> opens or
 * creates the 1:1 chat with that person and then rewrites the URL to ?thread=<id>.
 */
export function MessengerPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { viewer } = useViewer();
  const { online, ready: presenceReady } = usePresence(viewer.id);
  const { threads, loading, error } = useThreads();
  const [composing, setComposing] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [opened, setOpened] = useState<ThreadView | null>(null);
  const to = params.get('to');
  const threadParam = params.get('thread');
  const opening = useRef<string | null>(null);

  useEffect(() => {
    if (!to) return;
    const key = `${currentPersona()}:${to}`;
    if (opening.current === key) return;
    opening.current = key;
    setOpenError(null);
    apiPost<{ thread: ThreadView }>('/api/threads', { memberIds: [to] })
      .then(({ thread }) => {
        setOpened(thread);
        notifyThreadsChanged();
        router.replace(ROUTES.thread(thread.id));
      })
      .catch(() => setOpenError("Couldn't open that chat."))
      .finally(() => { opening.current = null; });
  }, [to, router]);

  const activeId = to ? null : threadParam;
  const { query, setQuery, filter, setFilter, shown } = useChatFilter(threads, viewer.id, activeId);
  const active = useMemo(
    () => threads?.find((t) => t.id === activeId) ?? (opened?.id === activeId ? opened : null),
    [threads, activeId, opened],
  );

  const showConversation = !!activeId || !!to;

  return (
    <div className="grid h-[calc(100dvh-112px)] md:h-[calc(100dvh-56px)] md:grid-cols-[360px_minmax(0,1fr)]" data-testid="messenger">
      <Card
        as="section"
        className={cn('min-h-0 flex-col overflow-hidden rounded-none shadow-none md:flex md:border-r md:border-fb-divider-soft', showConversation ? 'hidden' : 'flex')}
        aria-labelledby="chats-title"
        data-testid="chat-list"
      >
        {composing ? (
          <NewMessagePicker onClose={() => setComposing(false)} />
        ) : (
        <>
        <div className="px-4 pb-2 pt-3">
          <ChatsHeader threads={threads} titleId="chats-title" onCompose={() => setComposing(true)} />
          <ChatSearch value={query} onChange={setQuery} />
          <ChatFilterChips value={filter} onChange={setFilter} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {loading || !shown ? (
            error ? (
              <EmptyState title="Couldn't load chats" body={error} />
            ) : (
              <SkeletonGroup label="chats">
                {Array.from({ length: 8 }, (_, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-card px-2 py-2">
                    <Skeleton shape="circle" width={56} height={56} />
                    <div className="flex-1 space-y-2">
                      <Skeleton width={`${55 - (i % 3) * 10}%`} />
                      <Skeleton width="75%" className="h-2.5" />
                    </div>
                  </div>
                ))}
              </SkeletonGroup>
            )
          ) : shown.length === 0 ? (
            <EmptyState
              icon={<MessageCircle size={40} />}
              title={query || filter !== 'all' ? 'No chats match' : 'No chats yet'}
              body={query ? `Nothing for "${query}".` : filter === 'unread' ? "You're all caught up." : filter === 'groups' ? 'No group chats yet.' : 'Message a friend from Contacts or their profile.'}
            />
          ) : (
            <nav aria-label="Chats">
              {shown.map((t) => (
                <ThreadRow key={t.id} thread={t} viewerId={viewer.id} active={t.id === activeId} online={online} />
              ))}
            </nav>
          )}
        </div>
        </>
        )}
      </Card>

      {/* On phones an open chat covers the shell's top and bottom bars, like Messenger. */}
      <div className={cn('min-h-0', showConversation ? 'fixed inset-0 z-[55] bg-fb-surface md:static md:z-auto md:block' : 'hidden md:block')} data-testid="conversation-pane">
        {openError ? (
          <EmptyState className="h-full justify-center bg-fb-surface" title={openError} body="That person may not be in this demo." />
        ) : activeId ? (
          <Conversation
            key={`${viewer.id}:${activeId}`}
            threadId={activeId}
            thread={active}
            viewerId={viewer.id}
            online={online}
            presenceReady={presenceReady}
            onBack={() => router.push(ROUTES.messages)}
          />
        ) : to ? (
          <div className="flex h-full items-center justify-center bg-fb-surface"><Skeleton width={160} /></div>
        ) : (
          <EmptyState
            className="h-full justify-center bg-fb-surface"
            icon={<MessageCircle size={48} />}
            title="Select a chat"
            body="Pick a conversation from your chats, or message a friend from Contacts."
          />
        )}
      </div>
    </div>
  );
}
