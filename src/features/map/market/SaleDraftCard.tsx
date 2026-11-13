'use client';
// The seller's pop-up sale ("Campus Thrift Pop-Up"). Prefilled, its items wait as a draft until the
// seller taps Go live, which puts every item on the map for pickup at once (POST /api/listings/drafts).
// Once live, pickup requests for the seller's items show here with Accept, so the seller answers
// without hunting for the pin; listing:<id> messages refresh it.
import { Store } from 'lucide-react';
import { useState } from 'react';
import { ApiFetchError, apiPost, useApi } from '@/features/data';
import { Avatar, Button, cn, useToast } from '@/features/ui';
import type { MapListing } from '@/shared/api';
import { cleanTitle, countdown, money } from './useMarket';

type SaleDraft = { label: string; items: { id: string; title: string; priceUsd: number; imageUrl: string | null }[] };

export function SaleDraftCard({ className, viewerId, listings, now, onLive, onChanged }: {
  className?: string; viewerId: string; listings: MapListing[]; now: Date; onLive: () => void; onChanged: () => void;
}) {
  const api = useApi<{ sales: SaleDraft[] }>('/api/listings/drafts');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const sale = api.data?.sales[0];
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

  if (sale) {
    return (
      <div data-testid="sale-draft" className={cn('w-full max-w-[420px] rounded-card bg-fb-surface p-3 shadow-popover', className)}>
        <div className="flex items-start gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-card bg-fb-blue-tint text-fb-blue" aria-hidden>
            <Store size={24} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold leading-5 text-fb-text">{sale.label}</p>
            <p className="text-[13px] leading-4 text-fb-text-2">Draft · {sale.items.length} items ready for pickup</p>
            <p className="mt-1 line-clamp-2 text-[13px] leading-4 text-fb-text">
              {sale.items.map((i) => `${cleanTitle(i.title)} ${money(i.priceUsd)}`).join(' · ')}
            </p>
          </div>
        </div>
        <Button data-testid="sale-go-live" block className="mt-2" disabled={busy}
          onClick={() => void run(async () => {
            await apiPost('/api/listings/drafts', { label: sale.label });
            await api.refetch();
            onLive();
          }, `${sale.label} is live on the map.`)}>
          {busy ? 'Going live…' : 'Go live'}
        </Button>
      </div>
    );
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
