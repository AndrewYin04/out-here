'use client';

import { MapPin } from 'lucide-react';
import { currentPersona, useApi, useViewer } from '@/features/data';
import { ROUTES } from '@/features/fb/shell';
import { Card, LinkButton } from '@/features/ui';
import type { FriendAvailabilityResponse } from '@/shared/api';
import { DEMO_CENTER, now } from '@/shared/demo';
import { walkingMinutes } from '@/shared/geo';

const TZ = 'America/Los_Angeles';
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ });

function updatedAgo(iso: string): string {
  const mins = Math.max(0, Math.round((now().getTime() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return 'Updated just now';
  if (mins < 60) return `Updated ${mins} min ago`;
  const h = Math.round(mins / 60);
  return `Updated ${h} hr${h === 1 ? '' : 's'} ago`;
}

/**
 * Out Here card on a friend's profile: their active "I'm free" signal, how far it is, and a
 * "Want to hang?" link into the Out Here tab. The availability API only returns signals the
 * viewer may see (friends-only, canSee on the server), so the card is absent otherwise.
 */
export function OutHereCard({ friendId, handle, firstName, className }: {
  friendId: string; handle: string; firstName: string; className?: string;
}) {
  // useViewer starts as the default persona on every mount and catches up in an effect, so
  // wait for it to match the tab's persona before fetching (else the route answers 403).
  const { viewer, handle: viewerHandle } = useViewer();
  const ready = viewerHandle === currentPersona();
  const { data } = useApi<FriendAvailabilityResponse>(
    ready ? `/api/friends/${viewer.id}/availability` : null, ready ? [`user:${viewer.id}`] : []);
  const t = now().getTime();
  const item = data?.items.find((a) => a.userId === friendId && new Date(a.endsAt).getTime() > t);
  if (!item) return null;
  const walk = walkingMinutes(DEMO_CENTER, item.location);
  const started = new Date(item.startsAt).getTime() <= t;
  return (
    <Card flushOnMobile className={`p-4 ${className ?? ''}`} data-testid="outhere-card">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[17px] font-semibold text-fb-text">On Out Here</h2>
        <span className="text-fb-meta text-fb-text-2">{updatedAgo(item.createdAt)}</span>
      </div>
      <div className="mt-2 rounded-card bg-fb-input px-3 py-2">
        <p className="text-[15px] text-fb-text">&ldquo;{item.text}&rdquo;</p>
        <p className="mt-1 text-fb-meta font-semibold text-[#24832C]">
          {started ? `Free now till ${clock(item.endsAt)}` : `Free ${clock(item.startsAt)} to ${clock(item.endsAt)}`}
        </p>
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-fb-meta text-fb-text-2">
        <MapPin size={14} aria-hidden />
        {walk <= 60 ? `${walk} min walk from you` : 'Too far to walk'}
      </p>
      <LinkButton href={`${ROUTES.outHere}?with=${encodeURIComponent(handle)}`} block className="mt-3">
        Want to hang with {firstName}?
      </LinkButton>
    </Card>
  );
}
