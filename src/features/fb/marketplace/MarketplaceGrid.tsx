'use client';

import Link from 'next/link';
import type { Listing } from '@/shared';
import { useApi } from '@/features/data';
import { Card, EmptyState } from '@/features/ui';
import { CardGridSkeleton } from '@/features/fb/shell';
import { DEMO_AREA_LABEL } from '@/shared/demo';

/** /marketplace: today's picks, newest first, each tile opening its item page. */
export function MarketplaceGrid() {
  const { data, loading } = useApi<{ listings: Listing[] }>('/api/listings');
  if (loading && !data) return <CardGridSkeleton label="listings" count={9} withButton={false} />;
  const listings = data?.listings ?? [];
  if (!listings.length) return <Card><EmptyState title="Nothing for sale nearby yet" /></Card>;
  return (
    <ul className="grid grid-cols-2 gap-2 px-2 md:grid-cols-3 md:px-0" data-testid="listing-grid">
      {listings.map((l) => (
        <li key={l.id}>
          <Link href={`/marketplace/${encodeURIComponent(l.id)}`} className="block rounded-card hover:bg-fb-hover" data-testid="listing-tile">
            <div className="aspect-square overflow-hidden rounded-card bg-fb-skeleton">
              {l.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={l.imageUrl} alt="" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="px-1 pb-2 pt-1.5">
              <p className="text-[17px] font-semibold text-fb-text">{l.priceUsd === 0 ? 'Free' : `$${l.priceUsd}`}</p>
              <p className="line-clamp-2 text-fb-meta text-fb-text">{l.title}</p>
              <p className="text-[13px] text-fb-text-2">{DEMO_AREA_LABEL}, CA</p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
