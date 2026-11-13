import type { Metadata } from 'next';
import { PageHeader } from '@/features/fb/shell';
import { MarketplaceGrid } from '@/features/fb/marketplace';
import { DEMO_AREA_LABEL } from '@/shared/demo';

export const metadata: Metadata = { title: 'Marketplace' };

export default function MarketplacePage() {
  return (
    <div className="pb-4">
      <PageHeader title="Marketplace" subtitle={`Today's picks near ${DEMO_AREA_LABEL}`} />
      <MarketplaceGrid />
    </div>
  );
}
