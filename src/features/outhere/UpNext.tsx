'use client';
// The next plan stays on the map with a leave-time reminder and a way to start the 3D walk.
import { Footprints, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApi, useViewer } from '@/features/data';
import { requestSelfie } from '@/features/memories';
import { Avatar, CategoryIcon, cn, useToast } from '@/features/ui';

import { formatDemoTime, type YourPlan, type YourPlansResponse } from '@/shared';
import { pendingInviteQuests } from './InviteInbox';

const first = (name: string) => name.split(' ')[0] ?? name;

/** Plans starting within this many minutes (or already happening) show as Up next. */
const UP_NEXT_WINDOW_MIN = 120;
/** "Time to go" this many minutes before leave-by (and after it, until the start). */
const LEAVE_HEADS_UP_MIN = 2;



/** Re-render every 15 s so the countdown moves. */
function useClock(ms = 15_000): number {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setT(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return t;
}

/** The viewer's next plan: the soonest one not over yet, starting within the window. */
export function useUpNext(): YourPlan | null {
  const { viewer } = useViewer();
  const now = useClock();
  const api = useApi<YourPlansResponse>('/api/quests/mine', [`user:${viewer.id}`], (d) => d.plans.map((p) => `quest:${p.quest.id}`));
  return useMemo(() => {
    const soon = (api.data?.plans ?? []).filter((p) => {
      const starts = Date.parse(p.quest.startsAt);
      return p.quest.status !== 'done' && Date.parse(p.quest.endsAt) > now && starts - now <= UP_NEXT_WINDOW_MIN * 60_000;
    });
    return soon.sort((a, b) => a.quest.startsAt.localeCompare(b.quest.startsAt))[0] ?? null;
  }, [api.data, now]);
}

/** Plans (id@startsAt) whose Up next card was closed in this tab. A different plan, or a demo reseed
 *  (new start times), shows the card again. */
const DISMISS_KEY = 'oh:upnext-dismissed';

function readDismissed(): string[] {
  try { return JSON.parse(window.sessionStorage.getItem(DISMISS_KEY) ?? '[]') as string[]; } catch { return []; }
}

/** Whether the Up next card for `questId` (id@startsAt) was closed, and a function that closes it. */
export function useUpNextDismissed(questId: string | null | undefined): [boolean, () => void] {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => { setIds(readDismissed()); }, []);
  const dismiss = () => {
    if (!questId) return;
    const next = [...new Set([...readDismissed(), questId])];
    try { window.sessionStorage.setItem(DISMISS_KEY, JSON.stringify(next)); } catch { /* private mode: in-memory only */ }
    setIds(next);
  };
  return [!!questId && ids.includes(questId), dismiss];
}

type Phase = 'later' | 'go' | 'live';

export function UpNextCard({ plan, arrived, walking, onGo, onSee, onDismiss, className }: {
  plan: YourPlan;
  /** You got there in the 3D view. */
  arrived: boolean;
  /** The walk there is running. */
  walking: boolean;
  onGo: (questId: string) => void;
  onSee: (questId: string) => void;
  /** Close the card: the X button, or a swipe up on a phone. */
  onDismiss?: () => void;
  className?: string;
}) {
  const touchY = useRef<number | null>(null);
  const { viewer } = useViewer();
  const toast = useToast();
  const now = useClock();
  const q = plan.quest;
  const starts = Date.parse(q.startsAt);
  const leaveBy = starts - plan.walkMinutes * 60_000;
  const phase: Phase = now >= starts ? 'live' : now >= leaveBy - LEAVE_HEADS_UP_MIN * 60_000 ? 'go' : 'later';
  // Most recent joiners first: the friend you made this plan with leads ("with Maya, Nina and Kai").
  const others = plan.members.filter((m) => m.id !== viewer.id).reverse();
  const minsToStart = Math.max(0, Math.round((starts - now) / 60_000));

  // The reminder: once per plan, when it's time to go.
  const reminded = useRef<string | null>(null);
  useEffect(() => {
    if (phase !== 'go' || arrived || reminded.current === q.id) return;
    // One voice at a time: while Maya's invite card is up for this plan, it owns the moment.
    if (pendingInviteQuests.has(q.id)) { reminded.current = q.id; return; }
    reminded.current = q.id;
    toast.show(`Time to go: leave now for ${q.title} (${plan.walkMinutes} min walk)`);
    // toast is stable for the provider's lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, arrived, q.id]);

  const withShort = others.length === 0 ? 'just you' : `with ${first(others[0]!.name)}${others.length > 1 ? ` +${others.length - 1}` : ''}`;
  const when = phase === 'live' ? 'Happening now' : minsToStart < 60 ? `Starts in ${minsToStart} min` : `Starts ${formatDemoTime(q.startsAt)}`;
  // One short line that fits on a phone: when it starts, then when to leave. Who's going is in the
  // faces below; the walk time is on Let's go and the plan card.
  const leave = arrived ? 'You’re here'
    : walking ? 'On your way'
      : phase === 'later' ? `Leave by ${formatDemoTime(new Date(leaveBy).toISOString())}`
        : phase === 'go' ? 'Time to go' : `${plan.walkMinutes} min walk`;


  // One row: what, when, one button. Tapping the row opens the plan; details live there.
  return (
    <section aria-label="Up next" data-testid="up-next" data-phase={arrived ? 'arrived' : phase}
      onTouchStart={(e) => { touchY.current = e.touches[0]?.clientY ?? null; }}
      onTouchEnd={(e) => {
        const start = touchY.current;
        touchY.current = null;
        const end = e.changedTouches[0]?.clientY;
        // A swipe up of 40 px or more closes it, like a phone notification.
        if (onDismiss && start != null && end != null && start - end >= 40) onDismiss();
      }}
      className={cn('relative rounded-card bg-fb-surface shadow-popover animate-drop-in', className)}>
      {/* On the card's top-right corner, not in the row: on a phone the floating Ask Muse button
          covers the row's right end, so an X there would open Muse instead. */}
      {onDismiss && (
        <button type="button" data-testid="up-next-close" aria-label="Close Up next" onClick={onDismiss}
          className="absolute -right-2 -top-2 z-10 flex size-7 items-center justify-center rounded-full bg-fb-surface text-fb-text-2 shadow-popover hover:bg-fb-hover">
          <X size={16} aria-hidden />
        </button>
      )}
      <div className="flex items-center gap-3 p-2.5 pr-2">
        <CategoryIcon category={q.category} size={44} className={cn(phase === 'go' && !arrived && 'ring-2 ring-fb-blue')} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wide text-fb-blue">Up next</p>
          <p className="truncate text-[15px] font-bold leading-5 text-fb-text" data-testid="up-next-title">{q.title}</p>
          <p className={cn('truncate text-[13px] leading-[18px]', phase === 'go' && !arrived && !walking ? 'font-semibold text-fb-blue' : 'text-fb-text-2')} data-testid="up-next-when">
            {when} · {leave}
          </p>
        </div>
        <button type="button" data-testid="up-next-see" onClick={() => onSee(q.id)}
          className="shrink-0 text-[13px] font-semibold text-fb-blue hover:underline">
          See plan
        </button>
        {!arrived && (
          <button type="button" data-testid="up-next-go" disabled={walking} onClick={() => onGo(q.id)}
            className="oh-press inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-fb-blue px-4 text-[14px] font-semibold text-white hover:bg-fb-blue-hover disabled:opacity-60">
            <Footprints size={16} aria-hidden />{walking ? 'Walking…' : 'Let’s go'}
          </button>
        )}
      </div>
    </section>
  );
}
