import type { Metadata } from 'next';
import { CardGridSkeleton, ChipRowSkeleton, PageHeader } from '@/features/fb/shell';
import { DEMO_AREA_LABEL } from '@/shared/demo';

export const metadata: Metadata = { title: 'Marketplace' };

export default function MarketplacePage() {
  return (
    <div className="pb-4">
      <PageHeader title="Marketplace" subtitle={`Today's picks near ${DEMO_AREA_LABEL}`} />
      <ChipRowSkeleton count={5} />
      <CardGridSkeleton label="listings" count={9} withButton={false} />
    </div>
  );
}
