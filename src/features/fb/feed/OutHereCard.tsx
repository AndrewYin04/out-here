'use client';

import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { useMemo } from 'react';
import type { Quest } from '@/shared/types';
import { BRAND } from '@/config/brand';
import { ROUTES } from '@/features/fb/shell';
import { PERSONAS, useFriendAvailability, useQuests } from '@/features/data';
import { AvatarStack, Card, LinkButton, Skeleton, SkeletonGroup } from '@/features/ui';
import { DEMO_AREA_LABEL, DEMO_CENTER, MAX_WALK_MINUTES, formatDemoTime, minutesUntil } from '@/shared/demo';
import { walkingMinutes } from '@/shared/geo';
import { firstName } from './format';

type NearbyPlan = { quest: Quest; seatsLeft: number; walk: number };

/** Open plans a person near the demo center could still walk to and join. */
function nearbyPlans(quests: Quest[]): NearbyPlan[] {
  return quests
    .filter((q) => q.status === 'open' && minutesUntil(q.endsAt) > 0)
    .map((q) => ({ quest: q, seatsLeft: Math.max(0, q.capacity - q.memberIds.length), walk: walkingMinutes(DEMO_CENTER, q.approxLocation) }))
    .filter((p) => p.seatsLeft > 0 && p.walk <= MAX_WALK_MINUTES)
    .sort((a, b) => a.quest.startsAt.localeCompare(b.quest.startsAt));
}

const CAST = new Set(PERSONAS.map((p) => p.id));

/** "free till 6:00 PM" when the window is open now, else "free 5:15 PM–6:00 PM". */
function windowLabel(startsAt: string, endsAt: string): string {
  return minutesUntil(startsAt) > 0
    ? `free ${formatDemoTime(startsAt)}–${formatDemoTime(endsAt)}`
    : `free till ${formatDemoTime(endsAt)}`;
}

function startsLabel(iso: string): string {
  const m = minutesUntil(iso);
  if (m <= 0) return 'happening now';
  if (m < 60) return `starts in ${m} min`;
  return `starts ${formatDemoTime(iso)}`;
}

/** Home feed card for Out Here, filled from live data: friends who are free and open seats nearby. */
export function OutHereCard() {
  const avail = useFriendAvailability();
  const quests = useQuests(DEMO_CENTER);

  const free = useMemo(() => {
    const seen = new Set<string>();
    // The demo cast (people you actually know) first, then whoever is free soonest.
    const items = [...(avail.data?.items ?? [])].sort((a, b) =>
      Number(CAST.has(b.userId)) - Number(CAST.has(a.userId)) || a.startsAt.localeCompare(b.startsAt));
    return items.filter((a) => {
      if (seen.has(a.userId) || minutesUntil(a.endsAt) <= 0) return false;
      seen.add(a.userId);
      return true;
    });
  }, [avail.data]);
  const plans = useMemo(() => nearbyPlans(quests.data?.quests ?? []), [quests.data]);
  // Feature the soonest plan that is almost full: that is the one worth tapping now.
  const featured = useMemo(() => {
    const soon = plans.filter((p) => minutesUntil(p.quest.startsAt) <= 120);
    const pool = soon.length ? soon : plans;
    return [...pool].sort((a, b) => a.seatsLeft - b.seatsLeft || a.quest.startsAt.localeCompare(b.quest.startsAt))[0] ?? null;
  }, [plans]);

  const loading = (!avail.data && !avail.error) || (!quests.data && !quests.error);
  const lead = free[0];
  const freeLine = lead
    ? `${firstName(lead.friend.name)} is ${windowLabel(lead.startsAt, lead.endsAt)}`
    : 'No friends have said they are free yet';
  const more = free.length - 1;
  const plansLine = [
    more > 0 ? `${more} more ${more === 1 ? 'friend' : 'friends'} free today` : null,
    plans.length === 1 ? '1 plan near you' : `${plans.length} plans near you`,
  ].filter(Boolean).join(' · ');

  return (
    <Card as="section" flushOnMobile className="px-4 py-3" aria-labelledby="home-outhere" data-testid="home-outhere">
      <div className="flex items-center gap-3">
        <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fb-blue text-white">
          <MapPin size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="home-outhere" className="text-[15px] font-semibold">{BRAND.appName}</h2>
          <p className="text-fb-meta text-fb-text-2">Plans near {DEMO_AREA_LABEL} you can join right now</p>
        </div>
      </div>

      {loading ? (
        <SkeletonGroup label={BRAND.appName} className="mt-3 flex flex-col gap-2">
          <Skeleton width="70%" />
          <Skeleton width="55%" />
        </SkeletonGroup>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <Link href={ROUTES.outHere} className="flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-fb-hover" data-testid="home-outhere-free">
            {free.length > 0 && <AvatarStack people={free.map((a) => ({ name: a.friend.name, src: a.friend.avatarUrl }))} size={28} max={4} />}
            <span className="min-w-0 text-[15px]">
              <span className="font-semibold">{freeLine}</span>
              <span className="text-fb-text-2"> · {plansLine}</span>
            </span>
          </Link>
          {featured && (
            <Link
              href={`${ROUTES.outHere}?quest=${encodeURIComponent(featured.quest.id)}`}
              className="flex items-center gap-3 rounded-lg bg-fb-input px-3 py-2 hover:bg-fb-hover"
              data-testid="home-outhere-plan"
            >
              <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fb-surface text-[20px]">{featured.quest.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">{featured.quest.title}</span>
                <span className="block truncate text-fb-meta text-fb-text-2">
                  {featured.quest.venueName} · {featured.walk} min walk · {startsLabel(featured.quest.startsAt)}
                </span>
              </span>
              <span className="shrink-0 rounded-full bg-fb-red px-2 py-0.5 text-[12px] font-semibold text-white" data-testid="home-outhere-seats">
                {featured.seatsLeft} {featured.seatsLeft === 1 ? 'seat' : 'seats'} left
              </span>
            </Link>
          )}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <LinkButton href={ROUTES.outHere} size="sm" className="flex-1" data-testid="home-outhere-free-button">I&apos;m free</LinkButton>
        <LinkButton href={ROUTES.outHere} size="sm" variant="secondary" className="flex-1">Open map</LinkButton>
      </div>
    </Card>
  );
}
