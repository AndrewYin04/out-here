'use client';

import { MapPin } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiPost, ApiFetchError, useApi, useViewer } from '@/features/data';
import { Button, Card, EmptyState, LinkButton, Skeleton, SkeletonGroup, cn, useToast } from '@/features/ui';
import { startsLabel } from '@/features/fb/notifications';
import type { Quest } from '@/shared';

/** Re-renders every 30 s so "Starts in N min" stays true. */
function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

function SeatsBadge({ seats }: { seats: number }) {
  return (
    <span
      key={seats}
      data-testid="seats-badge"
      className={cn(
        'inline-flex h-6 items-center rounded-full px-2 text-fb-meta font-semibold animate-toast-in',
        seats > 0 ? 'bg-[#E7F3E8] text-fb-green' : 'bg-fb-secondary-btn text-fb-text-2',
      )}
    >
      {seats > 0 ? `${seats} left` : 'Full'}
    </span>
  );
}

function HangoutRow({ quest, now, onChanged }: { quest: Quest; now: number; onChanged: () => void }) {
  const { viewer } = useViewer();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const seats = Math.max(0, quest.capacity - quest.memberIds.length);
  const joined = quest.memberIds.includes(viewer.id);
  const isHost = quest.hostId === viewer.id;

  const act = async (kind: 'join' | 'leave') => {
    setBusy(true);
    try {
      await apiPost(`/api/quests/${quest.id}/${kind}`, { userId: viewer.id });
      toast.show(kind === 'join' ? `You joined ${quest.title}` : `You left ${quest.title}`);
    } catch (e) {
      const full = e instanceof ApiFetchError && e.status === 409;
      toast.show(full ? 'That hangout just filled up' : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
      onChanged();
    }
  };

  return (
    <Card as="article" className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center md:p-4" data-testid="hangout" data-quest-id={quest.id}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-fb-input text-3xl">{quest.emoji}</span>
        <div className="min-w-0">
          <p className="text-fb-meta font-semibold text-fb-text">{startsLabel(quest.startsAt, quest.endsAt, now)}</p>
          <h3 className="truncate text-[17px] font-semibold leading-[22px] text-fb-text">
            <Link href={`/out-here/plan/${quest.id}`} className="hover:underline" data-testid="hangout-plan-link">{quest.title}</Link>
          </h3>
          <p className="flex items-center gap-1 truncate text-[15px] text-fb-text-2">
            <MapPin size={14} aria-hidden className="shrink-0" />
            <span className="truncate">{quest.venueName}</span>
            {quest.priceMax > 0 && <span className="shrink-0">· up to ${quest.priceMax}</span>}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <SeatsBadge seats={seats} />
            <span className="text-fb-meta text-fb-text-2">{quest.memberIds.length} going</span>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        {joined && !isHost ? (
          <Button variant="secondary" onClick={() => act('leave')} disabled={busy}>Leave</Button>
        ) : joined ? (
          <Button variant="secondary" disabled>Hosting</Button>
        ) : (
          <Button onClick={() => act('join')} disabled={busy || seats === 0}>{seats === 0 ? 'Full' : 'Join'}</Button>
        )}
        <LinkButton href={`/out-here?quest=${quest.id}`} variant="secondary">Open in Out Here</LinkButton>
      </div>
    </Card>
  );
}

/** The group's Out Here quests; seats update live over quest:<id>. */
export function Hangouts({ slug }: { slug: string }) {
  const now = useNow();
  const { data, error, refetch } = useApi<{ quests: Quest[] }>(
    `/api/groups/${slug}/hangouts`, [], (d) => d.quests.map((q) => `quest:${q.id}`));
  if (error) return <Card><EmptyState title="Couldn’t load hangouts" /></Card>;
  if (!data) {
    return (
      <SkeletonGroup label="hangouts" className="flex flex-col gap-3">
        {[0, 1].map((i) => <Skeleton key={i} shape="block" height={96} className="rounded-card" />)}
      </SkeletonGroup>
    );
  }
  return (
    <section aria-label="Hangouts" className="flex flex-col gap-3" data-testid="hangouts">
      <Card padded>
        <h2 className="text-[17px] font-semibold text-fb-text">Hangouts</h2>
        <p className="text-[15px] text-fb-text-2">Plans from this group on Out Here that you can join right now.</p>
      </Card>
      {data.quests.length === 0 ? (
        <Card><EmptyState icon={<MapPin size={40} />} title="No hangouts right now" body="When members start a plan on Out Here, it shows up here." /></Card>
      ) : (
        data.quests.map((q) => <HangoutRow key={q.id} quest={q} now={now} onChanged={() => void refetch()} />)
      )}
    </section>
  );
}
