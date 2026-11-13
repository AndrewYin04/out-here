'use client';
// Pickup requests for the seller's listings on the map, with Accept, so a seller with a live pop-up
// answers without hunting for the pin. listing:<id> messages refresh the listings it reads.
import { useState } from 'react';
import { ApiFetchError, apiPost } from '@/features/data';
import { Avatar, Button, cn, useToast } from '@/features/ui';
import type { MapListing } from '@/shared/api';
import { cleanTitle, countdown, money } from './useMarket';

export function SellerRequests({ className, viewerId, listings, now, onChanged }: {
  className?: string; viewerId: string; listings: MapListing[]; now: Date; onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const mine = listings.filter((m) => m.listing.sellerId === viewerId);
  const requests = mine.flatMap((m) => m.requests.filter((r) => r.status === 'requested' || r.status === 'accepted').map((r) => ({ m, r })));

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await fn();
      toast.show(done);
    } catch (e) {
      toast.show(e instanceof ApiFetchError ? e.message : 'That did not go through. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (requests.length === 0) return null;
  return (
    <ul data-testid="sale-requests" className={cn('flex w-full max-w-[420px] flex-col gap-2', className)}>
      {requests.map(({ m, r }) => {
        const first = r.buyer.name.split(' ')[0];
        const title = cleanTitle(m.listing.title);
        return (
          <li key={r.id} data-testid="sale-request" data-status={r.status} className="rounded-card bg-fb-surface p-3 shadow-popover">
            <div className="flex items-center gap-2">
              <Avatar src={r.buyer.avatarUrl} name={r.buyer.name} size={36} />
              <p className="min-w-0 flex-1 text-[15px] leading-5 text-fb-text">
                {r.status === 'accepted'
                  ? <>Held for <strong className="font-semibold">{first}</strong> · {title} · {r.expiresAt ? `${countdown(r.expiresAt, now)} left` : 'held'}</>
                  : <><strong className="font-semibold">{first}</strong> wants to pick up {title} · {money(r.offerUsd)} · in {r.etaMin} min</>}
              </p>
            </div>
            {r.status === 'requested' && (
              <div className="mt-2 flex gap-2">
                <Button data-testid="sale-accept" className="flex-1" disabled={busy}
                  onClick={() => void run(async () => { await apiPost(`/api/listing-holds/${r.id}/respond`, { accept: true }); onChanged(); }, `Held for ${first}.`)}>
                  Accept
                </Button>
                <Button variant="secondary" disabled={busy}
                  onClick={() => void run(async () => { await apiPost(`/api/listing-holds/${r.id}/respond`, { accept: false }); onChanged(); }, 'Declined.')}>
                  Decline
                </Button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
