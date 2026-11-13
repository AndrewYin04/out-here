'use client';

import Link from 'next/link';
import { CalendarDays, Camera, Clock, Footprints, MapPin, Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import { apiFetch, apiPost, currentPersona, useApi, useViewer } from '@/features/data';
import { AvatarStack, Button, Card, EmptyState, Skeleton } from '@/features/ui';
import { formatDemoTime, type CompleteQuestResponse, type MyRating, type YourPlan, type YourPlansResponse } from '@/shared';
import { MemoryCapture } from './MemoryCapture';
import { MemoryThumb } from './MemoryThumb';
import { RateHangoutDialog } from './RateHangout';

type RateTarget = { questId: string; crewId: string | null };

const dateLabel = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric',
});

export function YourPlans() {
  const { viewer } = useViewer();
  return <PlansList key={viewer.id} viewerId={viewer.id} />;
}

function PlansList({ viewerId }: { viewerId: string }) {
  const { data, error, loading, refetch } = useApi<YourPlansResponse>(
    '/api/quests/mine', [`user:${viewerId}`], (res) => res.plans.map(({ quest }) => `quest:${quest.id}`),
  );
  const [time, setTime] = useState(Date.now);
  const [captureQuest, setCaptureQuest] = useState<string | null>(null);
  const [rateTarget, setRateTarget] = useState<RateTarget | null>(null);
  const [ratings, setRatings] = useState<Map<string, MyRating>>(new Map());
  const [ratingsVersion, setRatingsVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    apiFetch<{ ratings: MyRating[] }>('/api/me/ratings', { headers: { 'x-outhere-fresh': '1' } })
      .then((r) => { if (alive) setRatings(new Map(r.ratings.map((x) => [x.questId, x]))); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [viewerId, ratingsVersion]);
  useEffect(() => {
    const timer = setInterval(() => setTime(Date.now()), 15_000);
    const refresh = () => { setTime(Date.now()); void refetch(); };
    window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [refetch]);

  if (error && !data) return (
    <Card padded><p role="alert">Couldn’t load your plans.</p><Button variant="secondary" onClick={refetch}>Try again</Button></Card>
  );
  if (loading && !data) return <Card padded aria-busy="true"><Skeleton className="h-24 w-full" /></Card>;
  if (!data?.plans.length) return (
    <Card>
      <EmptyState icon={<CalendarDays size={36} />} title="No plans yet" body="Hangouts you join on Out Here show up here."
        action={<Link href="/out-here" className="font-semibold text-fb-blue hover:underline">Explore the map</Link>} />
    </Card>
  );

  const past = ({ quest }: YourPlan) => quest.status === 'done' || new Date(quest.endsAt).getTime() <= time;
  const upcoming = data.plans.filter((plan) => !past(plan));
  const finished = data.plans.filter(past).reverse();
  const rate = { ratings, onRate: setRateTarget };
  return (
    <div className="space-y-6">
      <RateHangoutDialog questId={rateTarget?.questId ?? null} crewId={rateTarget?.crewId ?? null}
        onClose={() => setRateTarget(null)} onSaved={() => setRatingsVersion((n) => n + 1)} />
      {upcoming.length > 0 && <section aria-label="Upcoming plans" className="space-y-3">
        <h2 className="text-[17px] font-bold">Upcoming</h2>
        {upcoming.map((plan) => <PlanCard key={plan.quest.id} {...{ plan, time, viewerId, refetch, captureQuest, setCaptureQuest }} {...rate} finished={false} />)}
      </section>}
      {finished.length > 0 && <section aria-label="Past plans" className="space-y-3">
        <h2 className="text-[17px] font-bold">Past hangouts</h2>
        {finished.map((plan) => <PlanCard key={plan.quest.id} {...{ plan, time, viewerId, refetch, captureQuest, setCaptureQuest }} {...rate} finished />)}
      </section>}
    </div>
  );
}

function PlanCard({ plan, time, viewerId, refetch, finished, captureQuest, setCaptureQuest, ratings, onRate }: {
  plan: YourPlan; time: number; viewerId: string; refetch: () => Promise<void>; finished: boolean;
  captureQuest: string | null; setCaptureQuest: (id: string | null) => void;
  ratings: Map<string, MyRating>; onRate: (target: RateTarget) => void;
}) {
  const rating = ratings.get(plan.quest.id) ?? null;
  const { quest, members, walkMinutes } = plan;
  const showCapture = captureQuest === quest.id;
  const [completedCrew, setCompletedCrew] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const crewId = completedCrew ?? plan.crewId;
  const starts = new Date(quest.startsAt);
  const started = starts.getTime() <= time;
  const departure = new Date(starts.getTime() - walkMinutes * 60_000);
  const going = members.filter((p) => p.id !== viewerId);

  async function change(action: 'leave' | 'complete') {
    setBusy(true);
    setError(null);
    try {
      const result = await apiPost<CompleteQuestResponse>(`/api/quests/${quest.id}/${action}`, {});
      if (action === 'complete') {
        setCompletedCrew(result.crew.id);
        // Right after "We're done": only the questionnaire, which has its own photo step. The
        // card's own photo form stays closed, so there is one uploader on screen.
        onRate({ questId: quest.id, crewId: result.crew.id });
      }
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t update this plan.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card as="article" padded className="border border-fb-divider-soft" aria-label={quest.title}>
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-fb-blue-tint text-2xl">{quest.emoji}</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[17px] font-bold">{quest.title}</h3>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-fb-text-2"><MapPin size={15} aria-hidden />{quest.venueName}</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-fb-text-2">
            <Clock size={15} aria-hidden />{dateLabel.format(starts)} · {formatDemoTime(quest.startsAt)}–{formatDemoTime(quest.endsAt)}
          </p>
        </div>
        {going.length > 0 && <AvatarStack people={going.map((p) => ({ name: p.name, src: p.avatarUrl }))} size={28} max={3} />}
      </div>
      {going.length > 0 && <p className="mt-3 text-sm text-fb-text-2">
        {finished ? 'Went with' : 'Going with'} {going.slice(0, 3).map((p) => p.name.split(' ')[0]).join(', ')}
        {going.length > 3 ? ` +${going.length - 3}` : ''}
      </p>}
      {!finished && <p className="mt-2 text-sm font-semibold text-fb-text">
        {started ? 'Happening now' : departure.getTime() > time ? `Leave by ${formatDemoTime(departure.toISOString())}` : 'Time to leave'}
        {' · ~'}{walkMinutes} min walk from your demo location
      </p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!finished && <>
          <a href={`https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', destination: `${quest.location.lat},${quest.location.lng}`, travelmode: 'walking' })}`}
            target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1.5 rounded-btn bg-fb-blue px-3 text-sm font-semibold text-white">
            <Footprints size={16} aria-hidden />Walk there
          </a>
          <Link href={`/out-here?quest=${quest.id}`} className="rounded-btn px-3 py-2 text-sm font-semibold text-fb-blue hover:bg-fb-blue-tint">View on map</Link>
          {quest.hostId !== viewerId && <Button variant="secondary" disabled={busy} onClick={() => change('leave')}>Leave</Button>}
          {started && <Button variant="secondary" disabled={busy} onClick={() => change('complete')}>We’re done</Button>}
        </>}
        {finished && <>
          <Button variant="tint" icon={<Camera size={16} />} onClick={() => setCaptureQuest(showCapture ? null : quest.id)} aria-expanded={showCapture}>
            {showCapture ? 'Close photo form' : 'Add a photo'}
          </Button>
          <Button variant="secondary" icon={<Star size={16} />} onClick={() => onRate({ questId: quest.id, crewId })}>
            {rating ? `Edit rating (${rating.score.toFixed(1)})` : 'Rate it'}
          </Button>
          {crewId && <Link href={`/memories#crew-${crewId}`} className="px-2 text-sm font-semibold text-fb-blue hover:underline">Open crew album</Link>}
        </>}
      </div>
      {finished && rating && (
        <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="plan-rating">
          <p className="flex items-center gap-1.5 text-sm text-fb-text">
            <Star size={15} aria-hidden className="text-[#F7B928]" fill="currentColor" />
            You rated it <strong className="font-semibold">{rating.score.toFixed(1)}</strong>
          </p>
          {(rating.photos ?? []).length > 0 && (
            <ul className="flex gap-1" aria-label="Photos from your rating">
              {(rating.photos ?? []).slice(0, 4).map((m) => (
                <MemoryThumb key={m.id} memory={m} handle={currentPersona()} className="size-10 overflow-hidden rounded-btn bg-fb-bg" />
              ))}
            </ul>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-sm text-fb-red" role="alert">{error}</p>}
      {finished && showCapture && <MemoryCapture questId={quest.id} crewId={crewId} onSaved={setCompletedCrew} />}
    </Card>
  );
}
