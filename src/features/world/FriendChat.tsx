'use client';
// Tap a friend in the street (Alan's "tap friend" reference): a small sheet slides up with who they
// are, where, how far, and a few one-tap messages Muse suggests from their bubble ("Can I join? 👋").
// You send it: it goes to your real 1:1 Messenger thread (the Messenger page isn't built yet, so
// the chat lives here). Their reply lands in the sheet and pops
// over their head in the street; then "Walk there" walks you to them. The same sheet opens on the
// other side when a friend's message comes in, with replies to match ("Join! 🙌").
import { Footprints, Hand, Sparkles, UserRound, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiFetch, apiPost, useApi } from '@/features/data';
import type { HangSuggestion } from '@/features/data/locations';
import { Avatar, burst, cn, useToast } from '@/features/ui';
import type { Message } from '@/shared';
import type { ThreadView } from '@/shared/api';

export type ChatFriend = {
  id: string; name: string; handle?: string; avatarUrl: string;
  /** "📚 at the lib" */
  place: string | null;
  walkMin: number | null;
  /** Their status bubble, which Muse's suggestions build on. */
  thought: string | null; emoji: string | null; wantsTo: string | null;
  free: boolean;
};

const first = (n: string) => n.split(' ')[0] ?? n;
const SNACK = /coffee|boba|tea|latte|matcha|snack|hungry|craving|dumpling|food|eat|lunch|dinner|pho|taco|ramen/i;

/** One-tap messages Muse suggests. You always choose and send. */
function suggestions(f: ChatFriend, theyAsked: boolean): string[] {
  if (theyAsked) return ['Join! 🙌', 'Omw 🚶', 'Not right now, next time?'];
  const want = `${f.thought ?? ''} ${f.wantsTo ?? ''}`;
  const extra = SNACK.test(want) ? `${/boba|tea/i.test(want) ? '🧋' : '☕'} Bring you something?` : f.wantsTo ? `I'm down to ${f.wantsTo.replace(/^to /i, '')}` : 'Want company?';
  return ['Can I join? 👋', 'Need anything?', extra];
}

export function FriendChat({ friend, viewerId, incoming = false, onReply, onWalk, walking, onClose }: {
  friend: ChatFriend;
  viewerId: string;
  /** Opened because their message came in (replies instead of asks). */
  incoming?: boolean;
  /** Their latest reply, for the speech bubble over their head. */
  onReply: (friendId: string, text: string) => void;
  onWalk: (() => void) | null;
  walking: boolean;
  onClose: () => void;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => { setHost(document.querySelector<HTMLElement>('[data-testid="out-here-map"]') ?? document.body); }, []);
  if (!host) return null;
  return createPortal(<Sheet key={friend.id} friend={friend} viewerId={viewerId} incoming={incoming} onReply={onReply} onWalk={onWalk} walking={walking} onClose={onClose} />, host);
}

function Sheet({ friend, viewerId, incoming, onReply, onWalk, walking, onClose }: {
  friend: ChatFriend; viewerId: string; incoming: boolean;
  onReply: (friendId: string, text: string) => void; onWalk: (() => void) | null; walking: boolean; onClose: () => void;
}) {
  const toast = useToast();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [invite, setInvite] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const sheetRef = useRef<HTMLElement>(null);
  // Only this moment's messages: from a minute before you tapped (so the one that opened it shows).
  const since = useRef(Date.now() - (incoming ? 5 * 60_000 : 60_000));

  useEffect(() => {
    let live = true;
    apiPost<{ thread: ThreadView }>('/api/threads', { memberIds: [friend.id] })
      .then((r) => { if (live) setThreadId(r.thread.id); })
      .catch(() => { if (live) toast.show('Couldn’t open the chat. Try again.'); });
    return () => { live = false; };
  }, [friend.id, toast]);

  const msgs = useApi<{ messages: Message[] }>(threadId ? `/api/threads/${threadId}/messages` : null, threadId ? [`thread:${threadId}`] : []);
  const recent = useMemo(() => (msgs.data?.messages ?? []).filter((m) => Date.parse(m.createdAt) >= since.current).slice(-6), [msgs.data]);
  const theirs = recent.filter((m) => m.fromId !== viewerId);
  const mine = recent.filter((m) => m.fromId === viewerId);
  const lastTheirs = theirs.at(-1) ?? null;
  const theyAsked = !!lastTheirs && (mine.length === 0 || Date.parse(lastTheirs.createdAt) > Date.parse(mine.at(-1)!.createdAt));
  const replied = mine.length > 0 && theirs.some((m) => Date.parse(m.createdAt) > Date.parse(mine[0]!.createdAt));

  // Their newest reply pops over their head in the street.
  const lastSeen = useRef<string | null>(null);
  useEffect(() => {
    if (!lastTheirs || lastTheirs.id === lastSeen.current) return;
    lastSeen.current = lastTheirs.id;
    onReply(friend.id, lastTheirs.text);
  }, [lastTheirs, friend.id, onReply]);

  const send = async (text: string) => {
    if (!threadId || sending) return;
    setSending(true);
    try {
      await apiPost(`/api/threads/${threadId}/messages`, { text });
      await msgs.refetch();
    } catch {
      toast.show('Couldn’t send. Try again.');
    } finally {
      setSending(false);
    }
  };

  // "Want to hang?": the same invite as the Find My card, with the plan Muse picks.
  const hang = async () => {
    setInviting(true);
    try {
      const { suggestion } = await apiFetch<{ suggestion: HangSuggestion | null }>(`/api/locations/hang?toId=${encodeURIComponent(friend.id)}`);
      const res = await apiPost<{ suggestion: string }>('/api/locations/hang', {
        toId: friend.id,
        message: suggestion?.draft ?? 'Want to hang? I’m nearby for a bit.',
        questId: suggestion?.questId ?? null,
        placeId: suggestion?.placeId ?? null,
      });
      setInvite(suggestion ? `${suggestion.emoji} ${suggestion.title}` : res.suggestion);
      burst(sheetRef.current, ['👋', '✨', suggestion?.emoji ?? '🎉'], 14);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Couldn’t send the invite.');
    } finally {
      setInviting(false);
    }
  };

  const picks = suggestions(friend, theyAsked);
  const showPicks = theyAsked || mine.length === 0;
  const name = first(friend.name);

  return (
    <section ref={sheetRef} aria-label={`${friend.name}`} data-testid="friend-chat" data-incoming={incoming ? 'true' : 'false'}
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-40 flex max-h-[62%] animate-sheet-up flex-col rounded-t-[24px] bg-fb-surface shadow-popover md:bottom-4 md:left-1/2 md:w-[440px] md:-translate-x-1/2 md:rounded-[24px]">
      <div className="relative flex h-6 shrink-0 items-center justify-center">
        <span className="h-1 w-10 rounded-full bg-fb-divider" aria-hidden />
      </div>
      <div className="flex items-center gap-3 px-4">
        <Avatar src={friend.avatarUrl} name={friend.name} size={48} decorative className={cn(friend.free && 'ring-[3px] ring-[#31A24C]')} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[18px] font-bold leading-6 text-fb-text">{friend.name}</p>
          <p className="truncate text-[13px] text-fb-text-2">
            {friend.place ?? 'Nearby'}{friend.walkMin != null && <> · <Footprints size={12} className="inline align-[-1px]" aria-hidden /> {friend.walkMin}m</>}
          </p>
        </div>
        {friend.free && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#E6F4EA] px-2 py-0.5 text-[12px] font-semibold text-[#1E7B34]"><span className="size-1.5 rounded-full bg-[#31A24C]" aria-hidden />free-ish</span>}
        <button type="button" aria-label="Close" onClick={onClose} className="flex size-8 shrink-0 items-center justify-center rounded-full text-fb-text-2 hover:bg-fb-hover"><X size={18} aria-hidden /></button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-3">
        <ul className="space-y-2" data-testid="friend-chat-thread" aria-live="polite">
          {recent.map((m) => {
            const me = m.fromId === viewerId;
            return (
              <li key={m.id} className={cn('flex animate-pop-in items-end gap-2', me && 'flex-row-reverse')}>
                {!me && <Avatar src={friend.avatarUrl} name={friend.name} size={24} decorative />}
                <p className={cn('max-w-[78%] rounded-[18px] px-3 py-1.5 text-[15px] font-semibold leading-5', me ? 'bg-fb-blue text-white' : 'bg-fb-input text-fb-text')}>{m.text}</p>
              </li>
            );
          })}
          {invite && (
            <li className="flex animate-pop-in justify-end">
              <p className="rounded-[18px] border border-fb-blue/30 bg-fb-blue-tint px-3 py-1.5 text-[14px] font-semibold text-fb-blue">👋 Invite sent · {invite}</p>
            </li>
          )}
        </ul>
        {mine.length > 0 && !replied && !theyAsked && (
          <p className="mt-1 text-right text-[12px] text-fb-text-2" data-testid="friend-chat-sent">Sent · {name}’s reply shows up here and over their head</p>
        )}

        {showPicks && (
          <div className="mt-2">
            <p className="flex items-center gap-1 text-[12px] font-semibold text-[#6B4BFF]"><Sparkles size={12} aria-hidden />Muse suggests · you send</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {picks.map((t, i) => (
                <button key={t} type="button" data-testid={`friend-chat-pick-${i}`} disabled={!threadId || sending} onClick={() => void send(t)}
                  style={{ animationDelay: `${i * 70}ms` }}
                  className={cn('oh-press animate-pop-in rounded-full px-3.5 py-2 text-[14px] font-semibold disabled:opacity-50',
                    i === 0 ? 'border-2 border-fb-blue bg-fb-surface text-fb-blue' : 'bg-fb-input text-fb-text hover:bg-fb-hover')}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 space-y-2 border-t border-fb-divider-soft px-4 pb-4 pt-2.5">
        {onWalk && (replied || (incoming && mine.length > 0)) && (
          <button type="button" data-testid="friend-chat-walk" onClick={onWalk} disabled={walking}
            className={cn('oh-press flex h-11 w-full animate-pop-in items-center justify-center gap-2 rounded-[14px] text-[16px] font-semibold text-white',
              walking ? 'bg-[#31A24C]' : 'bg-fb-blue hover:bg-fb-blue-hover')}>
            <Footprints size={17} aria-hidden />{walking ? 'On your way' : 'Walk there'}{friend.walkMin != null && ` · ${friend.walkMin}m`}
          </button>
        )}
        <div className="grid grid-cols-2 gap-2">
          {!incoming && (
            <button type="button" data-testid="friend-chat-hang" onClick={() => void hang()} disabled={inviting || !!invite}
              className="flex h-9 items-center justify-center gap-1 rounded-[10px] bg-fb-secondary-btn text-[13px] font-semibold text-fb-text hover:brightness-95 disabled:opacity-50">
              <Hand size={14} aria-hidden />{invite ? 'Invited' : inviting ? 'Inviting…' : 'Invite'}
            </button>
          )}
          {friend.handle && (
            <Link href={`/profile/${encodeURIComponent(friend.handle)}`} className="flex h-9 items-center justify-center gap-1 rounded-[10px] bg-fb-secondary-btn text-[13px] font-semibold text-fb-text hover:brightness-95">
              <UserRound size={14} aria-hidden />Profile
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
