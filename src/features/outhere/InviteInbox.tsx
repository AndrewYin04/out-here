'use client';

import { Footprints, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, apiPost, useChannel, useQuest, useViewer, type InviteView } from '@/features/data';
import { Avatar, Button, IconButton, celebrateJoin } from '@/features/ui';
import { useLetsGo } from './lets-go';
import { errorText } from './plan-api';
import { SeatsBadge } from './SuggestionCard';

/** Invites older than this are left to Notifications and Messenger. */
const RECENT_MS = 3 * 60 * 60_000;

/** Quest ids with an invite card on screen right now (UpNext stays quiet for those plans). */
export const pendingInviteQuests = new Set<string>();

type Shown = InviteView & { result?: string; error?: string; busy?: boolean };

/**
 * Incoming Out Here invites for the active persona, as cards in the top corner. Listens on
 * user:<id> for {type:"invite"}, refetches /api/invites, and shows pending ones with Accept
 * (joins the quest, with the inviter when both seats fit) and Decline.
 */
export function InviteInbox() {
  const { viewer } = useViewer();
  const [items, setItems] = useState<Shown[]>([]);
  const dismissed = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ incoming: InviteView[] }>('/api/invites', { headers: { 'x-outhere-fresh': '1' } });
      const cutoff = Date.now() - RECENT_MS;
      setItems((prev) => {
        const kept = new Map(prev.filter((p) => p.result).map((p) => [p.id, p]));
        const pending = data.incoming.filter((i) => i.status === 'pending' && Date.parse(i.createdAt) > cutoff && !dismissed.current.has(i.id));
        for (const p of pending) if (!kept.has(p.id)) kept.set(p.id, p);
        pendingInviteQuests.clear();
        for (const p of pending) if (p.quest?.id) pendingInviteQuests.add(p.quest.id);
        return [...kept.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3);
      });
    } catch {
      // keep what is shown
    }
  }, []);

  useEffect(() => {
    setItems([]);
    dismissed.current = new Set();
    void load();
  }, [viewer.id, load]);

  useChannel([`user:${viewer.id}`], (_c, payload) => {
    const type = (payload as { type?: string } | null)?.type;
    if (type === 'invite' || type === 'notification') void load();
  });

  const patch = (id: string, p: Partial<Shown>) => setItems((all) => all.map((i) => (i.id === id ? { ...i, ...p } : i)));
  const dismiss = (id: string) => {
    dismissed.current.add(id);
    setItems((all) => all.filter((i) => i.id !== id));
  };

  const respond = async (inv: Shown, status: 'accepted' | 'declined', from: HTMLElement | null = null) => {
    if (inv.busy) return;
    patch(inv.id, { busy: true, error: undefined });
    try {
      const out = await apiPost<{ quest?: InviteView['quest']; joinedAlone?: boolean }>(
        `/api/invites/${inv.id}/respond`, { status });
      if (status === 'accepted' && out.quest) celebrateJoin(from, out.quest.id, viewer.avatarUrl);
      const who = inv.from?.name.split(' ')[0] ?? 'your friend';
      const result = status === 'declined'
        ? 'Declined.'
        : out.quest
          ? out.joinedAlone ? `You're in. ${who} didn't fit, only one seat was left.` : `You're in with ${who}.`
          : `Accepted. ${who} will see it.`;
      patch(inv.id, { busy: false, result, status, quest: out.quest ?? inv.quest });
      if (status === 'declined') setTimeout(() => dismiss(inv.id), 1500);
    } catch (e) {
      patch(inv.id, { busy: false, error: errorText(e, "Couldn't answer. Try again.") });
    }
  };

  if (items.length === 0) return null;
  return (
    <div data-testid="invite-inbox" className="pointer-events-none fixed inset-x-2 bottom-[76px] z-[60] flex flex-col items-stretch gap-2 md:inset-x-auto md:bottom-4 md:right-4 md:w-[380px]">
      {items.map((inv) => (
        <InviteCard key={inv.id} inv={inv} onRespond={respond} onDismiss={dismiss} />
      ))}
    </div>
  );
}

function InviteCard({ inv, onRespond, onDismiss }: {
  inv: Shown; onRespond: (i: Shown, s: 'accepted' | 'declined', from?: HTMLElement | null) => void; onDismiss: (id: string) => void;
}) {
  const from = inv.from?.name.split(' ')[0] ?? 'A friend';
  const letsGo = useLetsGo();
  // Live seats: the quest channel updates this card when someone else takes a seat.
  const live = useQuest(inv.quest?.id ?? null);
  const q = live.data?.quest ?? inv.quest;
  const seats = live.data ? live.data.seatsLeft : q ? Math.max(q.capacity - q.memberIds.length, 0) : null;
  const inviterIn = !!(q && inv.fromId && q.memberIds.includes(inv.fromId));
  // Join-with-a-friend is the default: when only one seat is left for the two of you, say so.
  const alone = seats !== null && seats < 2 && !inviterIn && !inv.result;
  return (
    <section
      data-testid="invite-card"
      aria-label={`Invite from ${from}`}
      className="pointer-events-auto animate-drop-in rounded-card bg-fb-surface p-3 shadow-popover"
    >
      <div className="flex items-start gap-2.5">
        <span aria-hidden className="mt-0.5 size-9 shrink-0 rounded-full bg-fb-blue shadow-[inset_0_-6px_10px_rgba(0,60,180,.45)]" />
        <p className="min-w-0 flex-1 rounded-[18px] rounded-tl-md bg-fb-bg px-3 py-2 text-[15px] leading-5 text-fb-text">
          <span className="font-semibold">{inv.from?.name ?? from} wants to get {inv.suggestionTitle.replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, '').toLowerCase()} with you</span>
          {q ? <> — {q.venueName}{seats !== null ? `, ${seats} spot${seats === 1 ? '' : 's'} left` : ''}. Say yes and you&apos;re both in.</> : '.'}
          {inv.message && <span className="mt-1 block text-[13px] text-fb-text-2">“{inv.message}”</span>}
        </p>
        <IconButton label="Dismiss" size="sm" onClick={() => onDismiss(inv.id)}>
          <X size={16} aria-hidden />
        </IconButton>
      </div>
      <div className="mt-2.5 flex items-center gap-2 pl-11">
        <Avatar src={inv.from?.avatarUrl} name={inv.from?.name ?? from} size={28} />
        <span className="min-w-0 flex-1 truncate text-[13px] text-fb-text-2">{inv.from?.name ?? from}{seats !== null && <> · <SeatsBadge seats={seats} /></>}</span>
      </div>
      {alone && seats! > 0 && (
        <p data-testid="invite-one-seat" className="mt-2 text-[13px] text-fb-text-2">
          Only 1 seat is left, so there isn&apos;t room for you and {from}.
        </p>
      )}
      {inv.error && <p role="alert" className="mt-2 text-[13px] text-fb-red">{inv.error}</p>}
      {inv.result ? (
        <>
          <p data-testid="invite-result" className="mt-2 animate-step-in text-[13px] font-semibold text-fb-text">{inv.result}</p>
          {/* Never a dead end: once you're in, the next step is getting there (docs/UX_PLAN.md). */}
          {inv.status === 'accepted' && q && (
            <div className="mt-2 flex gap-2">
              <Button block icon={<Footprints size={18} />} data-testid="invite-lets-go" onClick={() => { onDismiss(inv.id); letsGo(q.id); }}>
                Let&rsquo;s go
              </Button>
              <Button variant="secondary" onClick={() => onDismiss(inv.id)}>Later</Button>
            </div>
          )}
        </>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button block disabled={inv.busy || seats === 0} onClick={(e) => onRespond(inv, 'accepted', e.currentTarget)}>
            {seats === 0 ? 'Full' : alone ? `Join without ${from}` : "I'm in"}
          </Button>
          <Button block variant="secondary" disabled={inv.busy} onClick={() => onRespond(inv, 'declined')}>Not now</Button>
        </div>
      )}
    </section>
  );
}
