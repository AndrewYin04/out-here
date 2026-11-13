'use client';

import Link from 'next/link';
import { ChevronLeft, MapPin, MessageCircle } from 'lucide-react';
import type { ListingResponse } from '@/shared/api';
import { useApi } from '@/features/data';
import { Avatar, Card, EmptyState, LinkButton, Skeleton, SkeletonGroup } from '@/features/ui';
import { startsLabel, timeAgo } from '@/features/fb/notifications';
import { DEMO_AREA_LABEL } from '@/shared/demo';

const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' });

/** /marketplace/<id>: photo, price, seller and description, plus the seller's linked Out Here plan. */
export function ListingPage({ id }: { id: string }) {
  const { data, loading, error } = useApi<ListingResponse>(`/api/listings/${encodeURIComponent(id)}`);
  if (error && !data) {
    return (
      <Card className="mx-2 md:mx-0">
        <EmptyState title="This listing isn't available" body="It may have sold or been removed." action={<LinkButton href="/marketplace" variant="secondary">Back to Marketplace</LinkButton>} />
      </Card>
    );
  }
  if (loading || !data) {
    return (
      <SkeletonGroup label="listing" className="grid gap-3 md:grid-cols-[3fr_2fr]">
        <Skeleton shape="block" className="aspect-square w-full" />
        <div className="space-y-2 p-3"><Skeleton width="70%" /><Skeleton width="30%" /><Skeleton width="90%" /></div>
      </SkeletonGroup>
    );
  }
  const { listing: l, seller, plan } = data;
  return (
    <div className="space-y-3 pb-4" data-testid="listing-page">
      <Link href="/marketplace" className="inline-flex items-center gap-1 px-4 pt-3 text-fb-meta font-semibold text-fb-text-2 hover:underline md:px-0 md:pt-2">
        <ChevronLeft size={16} aria-hidden /> Marketplace
      </Link>
      <div className="grid gap-3 md:grid-cols-[3fr_2fr]">
        <div className="overflow-hidden bg-black md:rounded-card">
          {l.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={l.imageUrl} alt={l.title} className="mx-auto max-h-[640px] w-full object-contain" />
          )}
        </div>
        <Card flushOnMobile className="space-y-3 p-4">
          <div>
            <h1 className="text-[24px] font-bold leading-7 text-fb-text">{l.title}</h1>
            <p className="mt-1 text-[20px] font-semibold text-fb-text" data-testid="listing-price">{l.priceUsd === 0 ? 'Free' : `$${l.priceUsd}`}</p>
            <p className="mt-1 text-fb-meta text-fb-text-2">Listed {timeAgo(l.createdAt)} ago in {DEMO_AREA_LABEL}, CA</p>
          </div>

          {plan && (
            <Link
              href={`/out-here?quest=${encodeURIComponent(plan.questId)}`}
              className="flex items-center gap-3 rounded-card border border-fb-divider p-3 hover:bg-fb-hover"
              data-testid="listing-plan"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-fb-blue-tint text-[22px]" aria-hidden>{plan.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-fb-meta font-semibold text-fb-text">{plan.title} · today {clock(plan.startsAt)}</span>
                <span className="flex items-center gap-1 text-[13px] text-fb-text-2"><MapPin size={12} aria-hidden />{plan.venueName} · {startsLabel(plan.startsAt, plan.endsAt)}</span>
                <span className="block text-[13px] text-fb-text-2">{plan.seatsLeft} {plan.seatsLeft === 1 ? 'spot' : 'spots'} left · on Out Here</span>
              </span>
              <span className="shrink-0 text-fb-meta font-semibold text-fb-link">See plan</span>
            </Link>
          )}

          <section>
            <h2 className="text-[17px] font-semibold text-fb-text">Details</h2>
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 text-fb-meta">
              <dt className="text-fb-text-2">Condition</dt><dd className="capitalize text-fb-text">{l.condition}</dd>
              <dt className="text-fb-text-2">Category</dt><dd className="text-fb-text">{l.category}</dd>
            </dl>
            <p className="mt-2 whitespace-pre-line text-fb-body text-fb-text" data-testid="listing-description">{l.description}</p>
          </section>

          {seller && (
            <section className="border-t border-fb-divider-soft pt-3">
              <h2 className="text-[17px] font-semibold text-fb-text">Seller information</h2>
              <Link href={`/profile/${seller.handle}`} className="mt-2 flex items-center gap-2 hover:underline" data-testid="listing-seller">
                <Avatar src={seller.avatarUrl} name={seller.name} size={40} decorative />
                <span className="font-semibold text-fb-text">{seller.name}</span>
              </Link>
            </section>
          )}
          {seller && (
            <LinkButton href={`/messages?to=${encodeURIComponent(seller.id)}`} variant="primary" block icon={<MessageCircle size={16} aria-hidden />}>
              Message
            </LinkButton>
          )}
        </Card>
      </div>
    </div>
  );
}
