'use client';
// Quest details over the map: a bottom sheet below 768 px, a left side panel on desktop.
// Non-modal, so the map, its attribution and the other Out Here controls stay usable.
import { Footprints, X } from 'lucide-react';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { ApiFetchError, apiPost, useApi, useViewer, type QuestDetail } from '@/features/data';
import { useLetsGo } from '@/features/outhere';
import { requestSelfie } from '@/features/memories';
import { Button, IconButton, Skeleton, bump, celebrateJoin, useToast } from '@/features/ui';
import type { PostView } from '@/shared/api';
import { MapAttribution } from './MapAttribution';
import { PlanCard } from './event/PlanCard';

export type QuestPanelProps = {
  questId: string;
  walkMinutes: number | undefined;
  viewerId: string;
  now: Date;
  onClose: () => void;
  /** Called after a join or leave so the map and walking times refetch. */
  onChanged: () => void;
  /** Muse filter on: why this plan was kept ("✨ Muse" and the reason), shown at the top. */
  museReason?: { label: string; text: string } | null;
};

export function QuestPanel({ questId, walkMinutes, viewerId, now, onClose, onChanged, museReason = null }: QuestPanelProps) {
  const { data, error, loading, refetch } = useApi<QuestDetail>(`/api/quests/${questId}`, [`quest:${questId}`]);
  const toast = useToast();
  const letsGo = useLetsGo();
  const { viewer } = useViewer();
  /** Join/leave shown at once (optimistic); cleared when the server answers. */
  const [pending, setPending] = useState<'join' | 'leave' | null>(null);
  const busy = pending !== null;
  const seatsRef = useRef<HTMLSpanElement>(null);
  const prevSeats = useRef<number | null>(null);
  const prevMembers = useRef<Set<string> | null>(null);
  /** People who joined while this panel was open: their row slides in. */
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const shown = data && data.quest.id === questId ? data : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Live: bump the seat count when someone joins or leaves, and say who just joined.
  useEffect(() => {
    if (!shown) return;
    if (prevSeats.current !== null && prevSeats.current !== shown.seatsLeft) bump(seatsRef.current, '', 1.2);
    prevSeats.current = shown.seatsLeft;
    const ids = new Set(shown.members.map((m) => m.id));
    const before = prevMembers.current;
    prevMembers.current = ids;
    if (!before) return;
    const joined = shown.members.filter((m) => !before.has(m.id));
    if (joined.length === 0) return;
    setFresh(new Set(joined.map((m) => m.id)));
    const others = joined.filter((m) => m.id !== viewerId);
    if (others.length > 0) toast.show(`${others.map((m) => m.name.split(' ')[0]).join(' and ')} just joined`);
    // toast is stable for the provider's lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, viewerId]);

  // Optimistic: the button, the seat count and the celebration happen on tap; the server
  // confirms in the background (a full quest puts it back and says so).
  async function act(kind: 'join' | 'leave', e?: MouseEvent<HTMLButtonElement>) {
    const from = e?.currentTarget ?? null;
    setPending(kind);
    if (kind === 'join') celebrateJoin(from, questId, viewer.avatarUrl, q?.emoji ?? '✨');
    toast.show(kind === 'join' ? "You're in. See you there." : 'You left this plan.');
    try {
      await apiPost(`/api/quests/${questId}/${kind}`, {});
    } catch (e) {
      if (e instanceof ApiFetchError && e.status === 409) toast.show('Someone just took the last spot.');
      else toast.show(kind === 'join' ? "Couldn't join. Try again." : "Couldn't leave. Try again.");
    } finally {
      await refetch();
      setPending(null);
      onChanged();
    }
  }

  const q = shown?.quest;
  const serverMember = shown?.viewerIsMember ?? false;
  const isMember = pending === 'join' ? true : pending === 'leave' ? false : serverMember;
  const seatsLeft = shown ? Math.max(0, shown.seatsLeft + (isMember === serverMember ? 0 : isMember ? -1 : 1)) : 0;
  const isHost = q?.hostId === viewerId;
  // Photo posts on the plan are its moments.
  const posts = useApi<{ posts: PostView[] }>(q ? `/api/quests/${questId}/posts` : null, [`quest:${questId}`]);

  // The one action follows where you are: Join, then Let's go (a done plan has nothing to go to).
  const primary = !q ? null : !isMember ? (
    <Button variant="primary" block disabled={busy || seatsLeft === 0} onClick={(e) => void act('join', e)}>
      {seatsLeft === 0 ? 'Full' : 'Join'}
    </Button>
  ) : q.status !== 'done' ? (
    <Button variant="primary" block icon={<Footprints size={20} />} data-testid="quest-lets-go" onClick={() => { onClose(); letsGo(questId); }}>
      Let&rsquo;s go
    </Button>
  ) : (
    <Button variant="secondary" block onClick={() => requestSelfie(questId)}>Add a moment</Button>
  );

  return (
    <section
      aria-label={q ? q.title : 'Plan details'}
      data-testid="quest-sheet"
      className="absolute inset-x-0 bottom-0 z-20 flex max-h-[68%] animate-sheet-up flex-col rounded-t-[24px] bg-fb-surface shadow-popover md:bottom-auto md:left-4 md:right-auto md:top-4 md:max-h-[calc(100%-32px)] md:w-[400px] md:animate-panel-in md:rounded-[24px]"
    >
      {/* On phones the attribution rides on top of the sheet so it is never covered. */}
      <MapAttribution className="absolute bottom-full right-0 mb-1 md:hidden" />
      {error && !shown && (
        <div className="flex items-center justify-between gap-2 p-4">
          <p className="text-fb-body text-fb-text-2">This plan isn&apos;t available anymore.</p>
          <IconButton label="Close" size="md" onClick={onClose}><X size={20} aria-hidden /></IconButton>
        </div>
      )}
      {loading && !shown && !error && (
        <div className="space-y-3 p-4">
          <Skeleton className="aspect-[16/9] w-full rounded-[22px]" />
          <Skeleton className="h-5" width="60%" />
          <div className="grid grid-cols-4 gap-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-[14px]" />)}</div>
        </div>
      )}
      {q && shown && (
        <PlanCard
          d={shown}
          viewerId={viewerId}
          now={now}
          walkMinutes={walkMinutes ?? null}
          seatsLeft={seatsLeft}
          seatsRef={seatsRef}
          variant="sheet"
          primary={primary}
          below={isMember && (
            isHost ? (
              <p className="mt-2 text-center text-[13px] font-semibold text-fb-text-2">You&apos;re hosting this plan</p>
            ) : (
              <button type="button" data-testid="quest-leave" disabled={busy} onClick={() => void act('leave')}
                className="mx-auto mt-2 block text-[13px] font-semibold text-fb-text-2 hover:underline disabled:opacity-50">
                Leave this plan
              </button>
            )
          )}
          posts={posts.data?.posts ?? null}
          onAddMoment={isMember ? () => requestSelfie(questId) : undefined}
          museReason={museReason}
          onClose={onClose}
          onReported={() => { onChanged(); onClose(); }}
          fresh={fresh}
        />
      )}
    </section>
  );
}
