'use client';
// The next plan stays on the map with a leave-time reminder and a way to start the 3D walk.
import { Footprints } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApi, useViewer } from '@/features/data';
import { cn, useToast } from '@/features/ui';
import { formatDemoTime, type YourPlan, type YourPlansResponse } from '@/shared';

/** Plans starting within this many minutes (or already happening) show as Up next. */
const UP_NEXT_WINDOW_MIN = 120;
/** "Time to go" this many minutes before leave-by (and after it, until the start). */
const LEAVE_HEADS_UP_MIN = 2;

const first = (name: string) => name.split(' ')[0] ?? name;

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

type Phase = 'later' | 'go' | 'live';

export function UpNextCard({ plan, arrived, walking, onGo, onSee, className }: {
  plan: YourPlan;
  /** You got there in the 3D view. */
  arrived: boolean;
  /** The walk there is running. */
  walking: boolean;
  onGo: (questId: string) => void;
  onSee: (questId: string) => void;
  className?: string;
}) {
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
  const minsToLeave = Math.round((leaveBy - now) / 60_000);

  // The reminder: once per plan, when it's time to go.
  const reminded = useRef<string | null>(null);
  useEffect(() => {
    if (phase !== 'go' || arrived || reminded.current === q.id) return;
    reminded.current = q.id;
    toast.show(`Time to go: leave now for ${q.emoji} ${q.title} (${plan.walkMinutes} min walk)`);
    // toast is stable for the provider's lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, arrived, q.id]);

  const withShort = others.length === 0 ? 'just you' : `with ${first(others[0]!.name)}${others.length > 1 ? ` +${others.length - 1}` : ''}`;
  const when = phase === 'live' ? 'Happening now' : minsToStart < 60 ? `Starts in ${minsToStart} min` : `Starts ${formatDemoTime(q.startsAt)}`;
  const leave = arrived ? 'You’re here'
    : walking ? 'On your way'
      : phase === 'go' ? 'Time to go'
        : phase === 'later' && minsToLeave > 0 ? `leave in ${minsToLeave} min` : `${plan.walkMinutes} min walk`;

  // One row: what, when, one button. Tapping the row opens the plan; details live there.
  return (
    <section aria-label="Up next" data-testid="up-next" data-phase={arrived ? 'arrived' : phase}
      className={cn('flex items-center gap-2 rounded-full bg-fb-surface p-1.5 shadow-popover animate-drop-in', className)}>
      <button type="button" onClick={() => onSee(q.id)} aria-label={`See plan: ${q.title}`}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-full text-left hover:bg-fb-hover">
        <span aria-hidden className={cn('flex size-10 shrink-0 items-center justify-center rounded-full text-[22px]',
          phase === 'go' && !arrived ? 'bg-fb-blue-tint ring-2 ring-fb-blue' : 'bg-[#E7F3E8]')}>{q.emoji}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-bold leading-5 text-fb-text" data-testid="up-next-title">{q.title} <span className="font-normal text-fb-text-2">· {withShort}</span></span>
          <span className={cn('block truncate text-[12.5px] leading-4', phase === 'go' && !arrived && !walking ? 'font-semibold text-fb-blue' : 'text-fb-text-2')} data-testid="up-next-when">
            {when} · {leave}
          </span>
        </span>
      </button>
      {!arrived && (
        <button type="button" data-testid="up-next-go" disabled={walking} onClick={() => onGo(q.id)}
          className="oh-press inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-fb-blue px-4 text-[14px] font-semibold text-white hover:bg-fb-blue-hover disabled:opacity-60">
          <Footprints size={16} aria-hidden />{walking ? 'Walking…' : 'Let’s go'}
        </button>
      )}
    </section>
  );
}
