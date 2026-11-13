'use client';
// The "Chats" header (options menu and New message), the search field and the All / Unread /
// Groups filter chips, shared by the /messages chat list and the top-bar popover.
import { Check, MoreHorizontal, Search, SquarePen, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, useApi } from '@/features/data';
import type { FriendsResponse, ThreadView } from '@/shared/api';
import { Avatar, Skeleton, cn } from '@/features/ui';
import { ROUTES } from '@/features/fb/shell/nav';
import { listedThreads, threadTitle } from './format';
import { notifyThreadsChanged } from './useThreads';

export type ChatFilter = 'all' | 'unread' | 'groups';

/**
 * Name search plus the filter chips. Groups are chats with more than 2 members. Chats with no
 * messages are left out, except `keepId` (the chat open right now).
 */
export function useChatFilter(threads: ThreadView[] | null, viewerId: string, keepId?: string | null) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ChatFilter>('all');
  const shown = useMemo(() => {
    if (!threads) return null;
    const q = query.trim().toLowerCase();
    return listedThreads(threads, keepId).filter((t) => {
      if (filter === 'unread' && t.unreadCount === 0) return false;
      if (filter === 'groups' && t.members.length <= 2) return false;
      if (!q) return true;
      return threadTitle(t, viewerId).toLowerCase().includes(q)
        || t.members.some((m) => m.id !== viewerId && m.name.toLowerCase().includes(q));
    });
  }, [threads, query, filter, viewerId, keepId]);
  return { query, setQuery, filter, setFilter, shown };
}

const circle = 'flex h-9 w-9 items-center justify-center rounded-full bg-fb-secondary-btn text-fb-text hover:bg-fb-secondary-btn-hover';

/** "Chats" title with the round options (...) and New message (pencil) buttons. */
export function ChatsHeader({ threads, titleId, as = 'h1', onNavigate, onCompose }: {
  threads: ThreadView[] | null; titleId?: string; as?: 'h1' | 'h2'; onNavigate?: () => void; onCompose: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setMenu(false); } };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc, true); };
  }, [menu]);
  const unread = (threads ?? []).filter((t) => t.unreadCount > 0);
  // Reading a thread's messages marks it read on the server.
  const markAllRead = async () => {
    setBusy(true);
    try { await Promise.all(unread.map((t) => apiFetch(`/api/threads/${t.id}/messages`))); } catch { /* the list refetch shows what is left */ }
    setBusy(false);
    setMenu(false);
    notifyThreadsChanged();
  };
  const Title = as;
  return (
    <div className="flex items-center gap-2">
      <Title id={titleId} className="min-w-0 flex-1 text-fb-title font-bold text-fb-text">Chats</Title>
      <div ref={box} className="relative">
        <button type="button" aria-label="Chat options" aria-expanded={menu} aria-haspopup="menu" className={circle} onClick={() => setMenu((v) => !v)} data-testid="chat-options">
          <MoreHorizontal size={20} aria-hidden />
        </button>
        {menu && (
          <div role="menu" className="absolute right-0 top-10 z-50 w-[240px] rounded-card bg-fb-surface p-2 shadow-popover" data-testid="chat-options-menu">
            <button type="button" role="menuitem" disabled={busy || unread.length === 0} onClick={() => void markAllRead()}
              className="flex w-full items-center gap-3 rounded-btn px-2 py-2 text-left text-[15px] font-medium text-fb-text hover:bg-fb-hover disabled:text-fb-text-2 disabled:hover:bg-transparent"
              data-testid="mark-all-read">
              <Check size={20} aria-hidden />
              {unread.length === 0 ? 'All chats are read' : busy ? 'Marking…' : 'Mark all as read'}
            </button>
            <button type="button" role="menuitem" onClick={() => { setMenu(false); onNavigate?.(); router.push(ROUTES.messages); }}
              className="flex w-full items-center gap-3 rounded-btn px-2 py-2 text-left text-[15px] font-medium text-fb-text hover:bg-fb-hover">
              <Search size={20} aria-hidden />
              Open Messenger
            </button>
          </div>
        )}
      </div>
      <button type="button" aria-label="New message" className={circle} onClick={onCompose} data-testid="new-message">
        <SquarePen size={18} aria-hidden />
      </button>
    </div>
  );
}

export function ChatSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="mt-3 flex h-9 items-center gap-2 rounded-pill bg-fb-input px-3">
      <Search size={16} className="text-fb-text-2" aria-hidden />
      <span className="sr-only">Search Messenger</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search Messenger"
        data-testid="chat-search"
        className="min-w-0 flex-1 bg-transparent text-[15px] text-fb-text outline-none placeholder:text-fb-text-2"
      />
    </label>
  );
}

const FILTERS: { id: ChatFilter; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'unread', label: 'Unread' }, { id: 'groups', label: 'Groups' },
];

export function ChatFilterChips({ value, onChange }: { value: ChatFilter; onChange: (f: ChatFilter) => void }) {
  return (
    <div className="mt-2 flex gap-1.5" role="group" aria-label="Filter chats">
      {FILTERS.map((f) => (
        <button
          key={f.id}
          type="button"
          aria-pressed={value === f.id}
          onClick={() => onChange(f.id)}
          data-testid={`chat-filter-${f.id}`}
          className={cn(
            'h-9 rounded-pill px-3 text-[15px] font-semibold transition-colors',
            value === f.id ? 'bg-[#DDEDFE] text-[#0064D1]' : 'text-fb-text hover:bg-fb-hover',
          )}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

/** "To:" people picker for a new message; choosing someone opens /messages?to=<handle>. */
export function NewMessagePicker({ onClose, onNavigate }: { onClose: () => void; onNavigate?: () => void }) {
  const router = useRouter();
  const friends = useApi<FriendsResponse>('/api/friends');
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const list = useMemo(() => {
    const all = friends.data?.friends ?? [];
    const s = q.trim().toLowerCase();
    return (s ? all.filter((p) => p.name.toLowerCase().includes(s)) : all).slice(0, 20);
  }, [friends.data, q]);
  const pick = (handle: string) => { onNavigate?.(); onClose(); router.push(ROUTES.chatWith(handle)); };
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="new-message-picker">
      <div className="flex items-center gap-2 px-4 pb-2 pt-3">
        <h2 className="flex-1 text-[17px] font-bold text-fb-text">New message</h2>
        <button type="button" aria-label="Close new message" className={circle} onClick={onClose}><X size={18} aria-hidden /></button>
      </div>
      <label className="mx-4 flex h-10 items-center gap-2 border-b border-fb-divider-soft text-[15px]">
        <span className="text-fb-text-2">To:</span>
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && list[0]) pick(list[0].handle); if (e.key === 'Escape') onClose(); }}
          placeholder="Name of a friend"
          aria-label="To"
          data-testid="new-message-to"
          className="min-w-0 flex-1 bg-transparent text-fb-text outline-none placeholder:text-fb-text-2"
        />
      </label>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {!friends.data ? (
          Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 px-2 py-2"><Skeleton shape="circle" width={36} height={36} /><Skeleton width="50%" /></div>
          ))
        ) : list.length === 0 ? (
          <p className="px-2 py-4 text-center text-[15px] text-fb-text-2">{friends.error ? "Couldn't load friends." : 'No friends match.'}</p>
        ) : (
          list.map((p) => (
            <button key={p.id} type="button" onClick={() => pick(p.handle)} data-testid="new-message-person"
              className="flex w-full items-center gap-3 rounded-card px-2 py-2 text-left hover:bg-fb-hover">
              <Avatar src={p.avatarUrl} name={p.name} size={36} online={p.online} decorative />
              <span className="truncate text-[15px] font-medium text-fb-text">{p.name}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
