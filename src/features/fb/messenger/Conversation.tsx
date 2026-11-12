'use client';

import { ArrowLeft, Info, Phone, SendHorizontal, ThumbsUp, Video } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { apiPost, useApi, type InviteView } from '@/features/data';
import type { Message } from '@/shared';
import type { MessagesResponse, ThreadView } from '@/shared/api';
import { Avatar, EmptyState, IconButton, Skeleton, SkeletonGroup, cn, useToast } from '@/features/ui';
import { ROUTES } from '@/features/fb/shell/nav';
import { firstName, groupMessages, mergeMessages, otherMembers, shortAgo, threadTitle } from './format';
import { InviteMessage } from './InviteMessage';
import { ThreadAvatar } from './ThreadRow';
import { notifyThreadsChanged } from './useThreads';

type Pending = Message & { failed?: boolean };

let localSeq = 0;

export function Conversation({ threadId, thread, viewerId, online, presenceReady = true, onBack }: {
  threadId: string; thread: ThreadView | null; viewerId: string; online: Set<string>;
  /** False until presence has answered; the "Active 1h ago" line waits so it cannot contradict a dot that appears a moment later. */
  presenceReady?: boolean; onBack: () => void;
}) {
  const msgs = useApi<MessagesResponse>(`/api/threads/${threadId}/messages`, [`thread:${threadId}`]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [draft, setDraft] = useState('');
  const [info, setInfo] = useState(false);
  const toast = useToast();
  // Re-render each minute so "Active 5m ago" stays current.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);
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
  // No presence history exists, so "last active" is the time of their newest message here.
  const othersIds = new Set(others.map((o) => o.id));
  const lastSeen = [...all].reverse().find((m) => othersIds.has(m.fromId))?.createdAt ?? null;
  const subtitle = activeNow ? 'Active now'
    : thread?.isGroup && !presenceReady ? `${thread.members.length} members`
    : !presenceReady ? null
    : lastSeen ? (shortAgo(lastSeen, now) === 'Just now' ? 'Active 1m ago' : `Active ${shortAgo(lastSeen, now)} ago`)
      : thread?.isGroup ? `${thread.members.length} members` : null;
  const callToast = () => toast.show("Calls aren't available in this demo.");

  return (
    <section className="relative flex h-full min-h-0 flex-col bg-fb-surface" aria-label={title ? `Conversation with ${title}` : 'Conversation'} data-testid="conversation">
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
                  {subtitle && <span className="block text-[13px] text-fb-text-2" data-testid="conversation-subtitle">{subtitle}</span>}
                </span>
              </Link>
            ) : (
              <div className="flex min-w-0 items-center gap-3 p-1">
                <ThreadAvatar thread={thread} viewerId={viewerId} size={40} online={online} />
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold text-fb-text" data-testid="conversation-title">{title}</span>
                  {subtitle && <span className="block text-[13px] text-fb-text-2" data-testid="conversation-subtitle">{subtitle}</span>}
                </span>
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center gap-3"><Skeleton shape="circle" width={40} height={40} /><Skeleton width={140} /></div>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <HeaderButton label="Start a voice call" onClick={callToast} testId="call-voice"><Phone size={20} aria-hidden /></HeaderButton>
          <HeaderButton label="Start a video call" onClick={callToast} testId="call-video"><Video size={22} aria-hidden /></HeaderButton>
          <HeaderButton label="Conversation information" onClick={() => setInfo((v) => !v)} pressed={info} testId="conversation-info-button">
            <Info size={22} aria-hidden fill={info ? 'currentColor' : 'none'} className={info ? '[&>path]:stroke-white' : undefined} />
          </HeaderButton>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">

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
      </div>
      {info && thread && (
        <aside className="absolute inset-x-0 bottom-0 top-16 z-10 flex flex-col overflow-y-auto bg-fb-surface md:static md:w-[300px] md:shrink-0 md:border-l md:border-fb-divider-soft" aria-label="Conversation information" data-testid="conversation-info">
          <div className="flex flex-col items-center px-4 pb-4 pt-6 text-center">
            {solo ? <Avatar src={solo.avatarUrl} name={solo.name} size={80} online={activeNow} decorative /> : <ThreadAvatar thread={thread} viewerId={viewerId} size={56} online={online} />}
            <p className="mt-2 text-[17px] font-semibold text-fb-text">{title}</p>
            {subtitle && <p className="text-[13px] text-fb-text-2">{subtitle}</p>}
          </div>
          <div className="px-2 pb-4">
            {solo ? (
              <Link href={ROUTES.profile(solo.handle)} className="flex items-center gap-3 rounded-card px-2 py-2 text-[15px] font-medium text-fb-text hover:bg-fb-hover" data-testid="info-view-profile">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-fb-secondary-btn"><Info size={18} aria-hidden /></span>
                View profile
              </Link>
            ) : (
              <>
                <p className="px-2 pb-1 text-[13px] font-semibold text-fb-text-2">Members</p>
                {thread.members.map((m) => (
                  <Link key={m.id} href={ROUTES.profile(m.handle)} className="flex items-center gap-3 rounded-card px-2 py-2 text-[15px] text-fb-text hover:bg-fb-hover">
                    <Avatar src={m.avatarUrl} name={m.name} size={36} online={online.has(m.id) || !!m.online} decorative />
                    <span className="truncate">{m.id === viewerId ? `${m.name} (you)` : m.name}</span>
                  </Link>
                ))}
              </>
            )}
          </div>
        </aside>
      )}
      </div>
    </section>
  );
}

function HeaderButton({ label, onClick, pressed, testId, children }: { label: string; onClick: () => void; pressed?: boolean; testId: string; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} aria-pressed={pressed} onClick={onClick} data-testid={testId}
      className="flex h-9 w-9 items-center justify-center rounded-full text-fb-blue hover:bg-fb-hover">
      {children}
    </button>
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
