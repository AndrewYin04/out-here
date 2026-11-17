'use client';
// The next plan stays on the map with a leave-time reminder and a way to start the 3D walk.
import { Camera, ChevronDown, ChevronUp, Footprints, MapPin } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApi, useViewer } from '@/features/data';
import { requestSelfie } from '@/features/memories';
import { Avatar, cn, useToast } from '@/features/ui';
import { formatDemoTime, type YourPlan, type YourPlansResponse } from '@/shared';

/** Plans starting within this many minutes (or already happening) show as Up next. */
const UP_NEXT_WINDOW_MIN = 120;
/** "Time to go" this many minutes before leave-by (and after it, until the start). */
const LEAVE_HEADS_UP_MIN = 2;

const first = (name: string) => name.split(' ')[0] ?? name;
const names = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

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
  const [open, setOpen] = useState(true);
  const q = plan.quest;
  const starts = Date.parse(q.startsAt);
  const leaveBy = starts - plan.walkMinutes * 60_000;
  const phase: Phase = now >= starts ? 'live' : now >= leaveBy - LEAVE_HEADS_UP_MIN * 60_000 ? 'go' : 'later';
  // Most recent joiners first: the friend you made this plan with leads ("with Maya, Nina and Kai").
  const others = plan.members.filter((m) => m.id !== viewer.id).reverse();
  const withWho = others.length > 0 ? `with ${names(others.slice(0, 3).map((m) => first(m.name)))}${others.length > 3 ? ` +${others.length - 3}` : ''}` : 'just you so far';
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

  // Arriving: the 3D view opens the selfie dialog itself. If it was closed, this reopens it
  // (one photo prompt, not two); without the 3D view, See plan is the way in.
  const takePhoto = () => { if (!requestSelfie(q.id)) onSee(q.id); };

  const when = phase === 'live' ? 'Happening now' : minsToStart < 60 ? `Starts in ${minsToStart} min` : `Starts ${formatDemoTime(q.startsAt)}`;
  const leave = arrived ? `You’re here 🎉 ${others.length > 0 ? `Say hi to ${names(others.slice(0, 2).map((m) => first(m.name)))}` : ''}`
    : walking ? `On your way · ${plan.walkMinutes} min walk`
      : phase === 'later' ? `Leave by ${formatDemoTime(new Date(leaveBy).toISOString())}${minsToLeave > 0 ? ` (in ${minsToLeave} min)` : ''} · ${plan.walkMinutes} min walk`
        : phase === 'go' ? `Time to go · ${plan.walkMinutes} min walk` : `${plan.walkMinutes} min walk away`;

  return (
    <section aria-label="Up next" data-testid="up-next" data-phase={arrived ? 'arrived' : phase}
      className={cn('rounded-card bg-fb-surface shadow-popover animate-drop-in', className)}>
      <div className="flex items-center gap-3 p-2.5 pr-2">
        <span aria-hidden className={cn('flex size-11 shrink-0 items-center justify-center rounded-full text-[24px]',
          phase === 'go' && !arrived ? 'bg-fb-blue-tint ring-2 ring-fb-blue' : 'bg-[#E7F3E8]')}>{q.emoji}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wide text-fb-blue">Up next</p>
          <p className="truncate text-[15px] font-bold leading-5 text-fb-text" data-testid="up-next-title">{q.title} <span className="font-normal text-fb-text-2">{withWho}</span></p>
          <p className={cn('truncate text-[13px] leading-[18px]', phase === 'go' && !arrived && !walking ? 'font-semibold text-fb-blue' : 'text-fb-text-2')} data-testid="up-next-when">
            {when} · {leave}
          </p>
        </div>
        <button type="button" aria-label={open ? 'Collapse' : 'Expand'} aria-expanded={open} onClick={() => setOpen((v) => !v)}
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-fb-text-2 hover:bg-fb-hover">
          {open ? <ChevronUp size={18} aria-hidden /> : <ChevronDown size={18} aria-hidden />}
        </button>
      </div>

      {open && (
        <div className="px-2.5 pb-2.5">
          {others.length > 0 && (
            <div className="mb-2 flex items-center gap-2 text-[13px] text-fb-text-2">
              <span className="flex -space-x-2">{plan.members.slice(0, 5).map((m) => <Avatar key={m.id} src={m.avatarUrl} name={m.name} size={24} decorative className="ring-2 ring-white" />)}</span>
              <span className="inline-flex min-w-0 items-center gap-1 truncate"><MapPin size={13} aria-hidden />{q.venueName}</span>
            </div>
          )}
          {!arrived ? (
            <div className="flex gap-2">
              <button type="button" data-testid="up-next-go" disabled={walking} onClick={() => onGo(q.id)}
                className={cn('oh-press inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-btn text-[15px] font-semibold disabled:opacity-60',
                  phase === 'later' ? 'bg-fb-blue-tint text-fb-blue' : 'bg-fb-blue text-white hover:bg-fb-blue-hover')}>
                <Footprints size={18} aria-hidden />{walking ? 'Walking there…' : 'Let’s go'}
              </button>
              <button type="button" onClick={() => onSee(q.id)}
                className="oh-press h-10 rounded-btn bg-fb-secondary-btn px-3 text-[14px] font-semibold text-fb-text">
                See plan
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button type="button" data-testid="up-next-photo-btn" onClick={takePhoto}
                className="oh-press inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-btn bg-fb-blue text-[15px] font-semibold text-white hover:bg-fb-blue-hover">
                <Camera size={18} aria-hidden />Take a photo together
              </button>
              <button type="button" onClick={() => onSee(q.id)}
                className="oh-press h-10 rounded-btn bg-fb-secondary-btn px-3 text-[14px] font-semibold text-fb-text">
                See plan
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
