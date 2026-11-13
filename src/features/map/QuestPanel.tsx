'use client';
// Quest details over the map: a bottom sheet below 768 px, a left side panel on desktop.
// Non-modal, so the map, its attribution and the other Out Here controls stay usable.
import { ChevronRight, Clock, Footprints, MapPin, Users, Wallet, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ApiFetchError, apiPost, useApi, type QuestDetail } from '@/features/data';
import { Avatar, Button, IconButton, Skeleton, useToast } from '@/features/ui';
import type { PersonCard } from '@/shared/api';
import { formatDemoTime } from '@/shared';
import { friendsGoingLine, priceLabel, startsLabel, walkLabel } from './format';
import { MapAttribution } from './MapAttribution';
import { Bubble, Poster, ReportButton, StatLine, VisibilityChip } from './event/parts';

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

function friendsFirst(members: PersonCard[], hostId: string | undefined, viewerId: string): PersonCard[] {
  const rank = (p: PersonCard) => (p.id === viewerId ? 0 : p.isFriend ? 1 : p.id === hostId ? 2 : 3);
  return [...members].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

export function QuestPanel({ questId, walkMinutes, viewerId, now, onClose, onChanged, museReason = null }: QuestPanelProps) {
  const { data, error, loading, refetch } = useApi<QuestDetail>(`/api/quests/${questId}`, [`quest:${questId}`]);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const seatsRef = useRef<HTMLSpanElement>(null);
  const prevSeats = useRef<number | null>(null);
  const shown = data && data.quest.id === questId ? data : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Pulse the live seat count when another person joins or leaves.
  useEffect(() => {
    if (!shown) return;
    if (prevSeats.current !== null && prevSeats.current !== shown.seatsLeft) {
      seatsRef.current?.animate?.([{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 500, iterations: 2 });
    }
    prevSeats.current = shown.seatsLeft;
  }, [shown]);

  async function act(kind: 'join' | 'leave') {
    setBusy(true);
    try {
      await apiPost(`/api/quests/${questId}/${kind}`, {});
      toast.show(kind === 'join' ? "You're in. See you there." : 'You left this plan.');
    } catch (e) {
      if (e instanceof ApiFetchError && e.status === 409) toast.show('Someone just took the last spot.');
      else toast.show(kind === 'join' ? "Couldn't join. Try again." : "Couldn't leave. Try again.");
    } finally {
      setBusy(false);
      await refetch();
      onChanged();
    }
  }

  const q = shown?.quest;
  const isMember = shown?.viewerIsMember ?? false;
  const isHost = q?.hostId === viewerId;
  const people = shown ? friendsFirst(shown.members, q?.hostId, viewerId) : [];
  const friendLine = friendsGoingLine(people.filter((p) => p.isFriend && p.id !== viewerId).map((p) => p.name));
  const walk = walkLabel(walkMinutes);

  return (
    <section
      aria-label={q ? q.title : 'Plan details'}
      data-testid="quest-sheet"
      className="absolute inset-x-0 bottom-0 z-20 flex max-h-[58%] flex-col rounded-t-sheet bg-fb-surface shadow-popover md:bottom-auto md:left-4 md:right-auto md:top-4 md:max-h-[calc(100%-32px)] md:w-[380px] md:rounded-card"
    >
      {/* On phones the attribution rides on top of the sheet so it is never covered. */}
      <MapAttribution className="absolute bottom-full right-0 mb-1 md:hidden" />
      <div className="flex justify-center pt-2 md:hidden" aria-hidden>
        <span className="h-1 w-10 rounded-full bg-fb-divider" />
      </div>
      <div className="flex items-start gap-3 px-4 pb-2 pt-2 md:pt-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-fb-input text-[30px]" aria-hidden>
          {q?.emoji ?? ''}
        </span>
        <div className="min-w-0 flex-1">
          {q ? (
            <>
              <h2 className="text-[20px] font-bold leading-6">{q.title}</h2>
              <p className="mt-0.5 flex items-center gap-1 text-fb-meta text-fb-text-2">
                <MapPin size={14} aria-hidden /> {q.venueName}
              </p>
              <VisibilityChip quest={q} groupName={shown?.group?.name} className="mt-1" />
            </>
          ) : (
            <>
              <Skeleton className="h-5" width="70%" />
              <Skeleton className="mt-2 h-3" width="40%" />
            </>
          )}
        </div>
        <IconButton label="Close" size="md" onClick={onClose}>
          <X size={20} aria-hidden />
        </IconButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
        {error && !shown && <p className="py-4 text-fb-body text-fb-text-2">This plan isn&apos;t available anymore.</p>}
        {loading && !shown && !error && (
          <div className="space-y-2 py-2">
            <Skeleton className="h-4" width="60%" />
            <Skeleton className="h-4" width="50%" />
            <Skeleton className="h-4" width="55%" />
          </div>
        )}
        {q && shown && (
          <>
            {(q.posterUrl || q.bubbleText) && (
              <div className="mb-3 flex items-start gap-3">
                <Poster quest={q} className="h-24 w-20 shrink-0 rounded-card" />
                <Bubble text={q.bubbleText} className="mt-1" />
              </div>
            )}
            {shown.isLive && (
              <StatLine memberCount={shown.memberCount} seatsLeft={shown.seatsLeft} isLive hereCount={shown.hereCount} className="mb-2" />
            )}
            {museReason && (
              <p data-testid="quest-muse-reason" className="mb-2 rounded-card bg-fb-blue-tint px-3 py-2 text-fb-meta text-fb-text">
                <span className="font-semibold text-fb-blue">{museReason.label}</span>
                <span className="text-fb-text-2"> · </span>
                {museReason.text}
              </p>
            )}
            <ul className="space-y-2 py-1 text-fb-body">
              <li className="flex items-center gap-2">
                <Clock size={18} className="text-fb-text-2" aria-hidden />
                <span data-testid="quest-starts">{startsLabel(q, now)}</span>
                <span className="text-fb-text-2">· {formatDemoTime(q.startsAt)}</span>
              </li>
              {walk && (
                <li className="flex items-center gap-2">
                  <Footprints size={18} className="text-fb-text-2" aria-hidden />
                  <span data-testid="quest-walk">{walk}</span>
                </li>
              )}
              <li className="flex items-center gap-2">
                <Wallet size={18} className="text-fb-text-2" aria-hidden />
                <span>{priceLabel(q.priceMax)}</span>
              </li>
              <li className="flex items-center gap-2">
                <Users size={18} className="text-fb-text-2" aria-hidden />
                <span ref={seatsRef} data-testid="quest-seats" className={shown.seatsLeft > 0 ? 'font-semibold text-fb-blue' : 'font-semibold text-fb-text-2'}>
                  {shown.seatsLeft > 0 ? `${shown.seatsLeft} ${shown.seatsLeft === 1 ? 'spot' : 'spots'} left` : 'Full'}
                </span>
                <span className="text-fb-text-2">· {q.capacity} max</span>
              </li>
            </ul>

            {q.description && <p className="mt-3 text-fb-body">{q.description}</p>}

            <div className="mt-4">
              <h3 className="text-[17px] font-bold">
                Going <span className="font-normal text-fb-text-2">· {shown.memberCount ?? people.length}</span>
              </h3>
              {shown.canSeeGuests === false && (
                <p className="text-fb-meta text-fb-text-2" data-testid="quest-guests-hidden">{people.length > 0 ? 'Only your friends are shown. ' : ''}Other guests show to the host&apos;s friends and people who join.</p>
              )}
              {friendLine && <p className="text-fb-meta text-fb-text-2" data-testid="quest-friends-going">{friendLine}</p>}
              <ul className="mt-2 space-y-2" data-testid="quest-going">
                {people.map((p) => (
                  <li key={p.id} className="flex items-center gap-2">
                    <Avatar src={p.avatarUrl} name={p.name} size={36} decorative />
                    <span className="min-w-0 flex-1 truncate text-fb-body font-semibold">{p.id === viewerId ? `${p.name} (you)` : p.name}</span>
                    {p.id === q.hostId && <span className="text-fb-meta text-fb-text-2">Host</span>}
                    {p.id !== q.hostId && p.isFriend && <span className="text-fb-meta text-fb-text-2">Friend</span>}
                  </li>
                ))}
              </ul>
            </div>

            {!isMember && (
              <p className="mt-3 text-fb-meta text-fb-text-2">Pin shows the area. The exact spot is shared after you join.</p>
            )}
            <Link
              href={`/out-here/plan/${q.id}`}
              data-testid="quest-open-page"
              className="mt-3 flex items-center justify-between rounded-btn bg-fb-input px-3 py-2 text-fb-body font-semibold text-fb-text hover:bg-fb-secondary-btn"
            >
              <span>Open plan page{shown.postCount ? ` · ${shown.postCount} ${shown.postCount === 1 ? 'post' : 'posts'}` : ''}</span>
              <ChevronRight size={18} aria-hidden />
            </Link>
          </>
        )}
      </div>

      {q && shown && (
        <div className="shrink-0 border-t border-fb-divider-soft px-4 pb-3 pt-3">
          {isMember ? (
            isHost ? (
              <p className="text-center text-fb-body font-semibold text-fb-text-2">You&apos;re hosting this plan</p>
            ) : (
              <Button variant="secondary" block disabled={busy} onClick={() => act('leave')}>Leave</Button>
            )
          ) : (
            <Button variant="primary" block disabled={busy || shown.seatsLeft === 0} onClick={() => act('join')}>
              {shown.seatsLeft === 0 ? 'Full' : 'Join'}
            </Button>
          )}
          {!isMember && <ReportButton questId={questId} onReported={() => { onChanged(); onClose(); }} className="mx-auto mt-2" />}
        </div>
      )}
    </section>
  );
}
