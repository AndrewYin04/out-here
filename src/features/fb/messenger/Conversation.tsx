'use client';

import { ArrowLeft, SendHorizontal, ThumbsUp } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { apiPost, useApi, type InviteView } from '@/features/data';
import type { Message } from '@/shared';
import type { MessagesResponse, ThreadView } from '@/shared/api';
import { Avatar, EmptyState, IconButton, Skeleton, SkeletonGroup, cn } from '@/features/ui';
import { ROUTES } from '@/features/fb/shell/nav';
import { firstName, groupMessages, mergeMessages, otherMembers, threadTitle } from './format';
import { InviteMessage } from './InviteMessage';
import { ThreadAvatar } from './ThreadRow';
import { notifyThreadsChanged } from './useThreads';

type Pending = Message & { failed?: boolean };

let localSeq = 0;

export function Conversation({ threadId, thread, viewerId, online, onBack }: {
  threadId: string; thread: ThreadView | null; viewerId: string; online: Set<string>; onBack: () => void;
}) {
  const msgs = useApi<MessagesResponse>(`/api/threads/${threadId}/messages`, [`thread:${threadId}`]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [draft, setDraft] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  // Opening the thread (GET messages) marks it read on the server; tell the chat lists.
  useEffect(() => { if (msgs.data) notifyThreadsChanged(); }, [msgs.data]);
  useEffect(() => { setPending([]); setDraft(''); input.current?.focus(); }, [threadId]);

  const server = msgs.data?.messages;
  const all = useMemo(() => mergeMessages(server ?? [], pending), [server, pending]);
  const hasInvites = all.some((m) => m.kind === 'invite' && m.inviteId);
  const invitesApi = useApi<{ incoming: InviteView[]; outgoing: InviteView[] }>(hasInvites ? '/api/invites' : null, hasInvites ? [`user:${viewerId}`] : []);
  const invites = useMemo(() => {
    const map = new Map<string, InviteView>();
    for (const i of [...(invitesApi.data?.incoming ?? []), ...(invitesApi.data?.outgoing ?? [])]) map.set(i.id, i);
    return map;
  }, [invitesApi.data]);
  const groups = useMemo(() => groupMessages(all), [all]);

  // Stay pinned to the newest message: on new messages, and when content below grows later
  // (invite cards load their quest after the text), unless the viewer scrolled up to read.
  const stick = useRef(true);
  const loaded = !!msgs.data;
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
    stick.current = true;
  }, [all.length, threadId]);
  useEffect(() => {
    const el = scroller.current;
    const content = el?.firstElementChild;
    if (!el || !content || typeof ResizeObserver === 'undefined') return;
    const onScroll = () => { stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; };
    const ro = new ResizeObserver(() => { if (stick.current) el.scrollTop = el.scrollHeight; });
    ro.observe(content);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => { ro.disconnect(); el.removeEventListener('scroll', onScroll); };
  }, [loaded]);

  const send = useCallback(async (text: string, retryId?: string) => {
    const body = text.trim();
    if (!body) return;
    const id = retryId ?? `local-${++localSeq}`;
    const temp: Pending = { id, threadId, fromId: viewerId, text: body, kind: 'text', inviteId: null, createdAt: new Date().toISOString() };
    setPending((p) => [...p.filter((m) => m.id !== id), temp]);
    try {
      const { message } = await apiPost<{ message: Message }>(`/api/threads/${threadId}/messages`, { text: body });
      setPending((p) => p.map((m) => (m.id === id ? message : m)));
      void msgs.refetch();
      notifyThreadsChanged();
    } catch {
      setPending((p) => p.map((m) => (m.id === id ? { ...m, failed: true } : m)));
    }
  }, [threadId, viewerId, msgs]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = draft;
    setDraft('');
    void send(text);
  };

  const others = thread ? otherMembers(thread, viewerId) : [];
  const title = thread ? threadTitle(thread, viewerId) : '';
  const solo = thread && !thread.isGroup && others.length === 1 ? others[0] : null;
  const activeNow = solo ? online.has(solo.id) || !!solo.online : others.some((o) => online.has(o.id));
  const people = new Map((thread?.members ?? []).map((m) => [m.id, m]));
  const notFound = !!msgs.error && !msgs.data;

  return (
    <section className="flex h-full min-h-0 flex-col bg-fb-surface" aria-label={title ? `Conversation with ${title}` : 'Conversation'} data-testid="conversation">
      <header className="flex h-16 shrink-0 items-center gap-2 border-b border-fb-divider-soft px-2 md:px-4">
        <IconButton label="Back to chats" tone="plain" size="md" className="md:hidden" onClick={onBack}>
          <ArrowLeft size={20} aria-hidden />
        </IconButton>
        {thread ? (
          <>
            {solo ? (
              <Link href={ROUTES.profile(solo.handle)} className="flex min-w-0 items-center gap-3 rounded-card p-1 hover:bg-fb-hover" data-testid="conversation-profile-link">
                <Avatar src={solo.avatarUrl} name={solo.name} size={40} online={activeNow} decorative />
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold text-fb-text" data-testid="conversation-title">{title}</span>
                  <span className="block text-[13px] text-fb-text-2">{activeNow ? 'Active now' : 'Messenger'}</span>
                </span>
              </Link>
            ) : (
              <div className="flex min-w-0 items-center gap-3 p-1">
                <ThreadAvatar thread={thread} viewerId={viewerId} size={40} online={online} />
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold text-fb-text" data-testid="conversation-title">{title}</span>
                  <span className="block text-[13px] text-fb-text-2">{activeNow ? 'Active now' : `${thread.members.length} members`}</span>
                </span>
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center gap-3"><Skeleton shape="circle" width={40} height={40} /><Skeleton width={140} /></div>
        )}
      </header>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-4" data-testid="message-list" aria-live="polite">
        {notFound ? (
          <EmptyState title="This chat isn't available" body="It may belong to another person in the demo." action={<Link href={ROUTES.messages} className="text-[15px] font-semibold text-fb-link hover:underline">Back to chats</Link>} />
        ) : !msgs.data ? (
          <SkeletonGroup label="messages" className="flex h-full flex-col justify-end gap-2">
            {[180, 260, 140, 220, 120].map((w, i) => (
              <Skeleton key={i} className={i % 2 ? 'h-9 self-end rounded-[18px] bg-fb-blue-tint' : 'h-9 rounded-[18px]'} width={w} />
            ))}
          </SkeletonGroup>
        ) : all.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            {solo && <Avatar src={solo.avatarUrl} name={solo.name} size={80} decorative />}
            <p className="text-[17px] font-semibold text-fb-text">{title}</p>
            <p className="text-[13px] text-fb-text-2">Say hi to start the conversation.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {groups.map((g) => {
              const mine = g.fromId === viewerId;
              const sender = people.get(g.fromId);
              return (
                <div key={g.key} className="flex flex-col gap-0.5">
                  {g.divider && <p className="py-2 text-center text-[12px] font-medium text-fb-text-2" data-testid="time-divider">{g.divider}</p>}
                  {!mine && thread?.isGroup && sender && <p className="ml-10 text-[12px] text-fb-text-2">{firstName(sender.name)}</p>}
                  <div className={cn('flex items-end gap-2', mine ? 'justify-end' : 'justify-start')}>
                    {!mine && (
                      <span className="w-7 shrink-0">
                        <Avatar src={sender?.avatarUrl} name={sender?.name ?? 'Friend'} size={28} decorative />
                      </span>
                    )}
                    <div className={cn('flex min-w-0 max-w-[75%] flex-col gap-0.5 md:max-w-[60%]', mine ? 'items-end' : 'items-start')}>
                      {g.messages.map((m, i) => (
                        m.kind === 'invite' && m.inviteId ? (
                          <InviteMessage key={m.id} message={m} invite={invites.get(m.inviteId) ?? null} viewerId={viewerId} mine={mine}
                            onAnswered={() => { void invitesApi.refetch(); void msgs.refetch(); }} />
                        ) : (
                          <Bubble key={m.id} m={m as Pending} mine={mine} first={i === 0} last={i === g.messages.length - 1}
                            onRetry={(p) => void send(p.text, p.id)} />
                        )
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="flex shrink-0 items-center gap-2 px-3 pb-3 pt-2" data-testid="composer">
        <label className="sr-only" htmlFor={`composer-${threadId}`}>Message</label>
        <input
          id={`composer-${threadId}`}
          ref={input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Aa"
          autoComplete="off"
          maxLength={4000}
          disabled={notFound}
          data-testid="composer-input"
          className="h-9 min-w-0 flex-1 rounded-pill bg-fb-input px-3 text-[15px] text-fb-text outline-none placeholder:text-fb-text-2"
        />
        {draft.trim() ? (
          <IconButton type="submit" label="Send" tone="plain" size="md" className="text-fb-blue" data-testid="send-button">
            <SendHorizontal size={20} aria-hidden />
          </IconButton>
        ) : (
          <IconButton label="Send a like" tone="plain" size="md" className="text-fb-blue" disabled={notFound} onClick={() => void send('👍')} data-testid="like-button">
            <ThumbsUp size={20} aria-hidden />
          </IconButton>
        )}
      </form>
    </section>
  );
}

function Bubble({ m, mine, first, last, onRetry }: { m: Pending; mine: boolean; first: boolean; last: boolean; onRetry: (m: Pending) => void }) {
  const sending = m.id.startsWith('local-') && !m.failed;
  const emojiOnly = /^\p{Extended_Pictographic}{1,3}$/u.test(m.text);
  const radius = mine
    ? cn('rounded-[18px]', !first && 'rounded-tr-[4px]', !last && 'rounded-br-[4px]')
    : cn('rounded-[18px]', !first && 'rounded-tl-[4px]', !last && 'rounded-bl-[4px]');
  return (
    <div className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
      <p
        data-testid={mine ? 'bubble-mine' : 'bubble-theirs'}
        data-pending={sending ? '1' : undefined}
        title={new Date(m.createdAt).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}
        className={cn(
          'whitespace-pre-wrap break-words text-[15px] leading-5',
          emojiOnly ? 'text-[32px] leading-10' : cn('px-3 py-2', radius, mine ? 'bg-fb-blue text-white' : 'bg-[#E2E5E9] text-fb-text'),
          sending && 'opacity-70',
        )}
      >
        {m.text}
      </p>
      {m.failed && (
        <button type="button" onClick={() => onRetry(m)} className="mt-0.5 text-[12px] font-semibold text-fb-red hover:underline">
          Not sent. Tap to retry.
        </button>
      )}
    </div>
  );
}
