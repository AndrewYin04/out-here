import type { Metadata } from 'next';
import { CardGridSkeleton, ChipRowSkeleton, PageHeader } from '@/features/fb/shell';
import { DEMO_AREA_LABEL } from '@/shared/demo';

export const metadata: Metadata = { title: 'Events' };

export default function EventsPage() {
  return (
    <div className="pb-4">
      <PageHeader title="Events" subtitle={`Discover events near ${DEMO_AREA_LABEL}`} />
      <ChipRowSkeleton count={4} />
      <CardGridSkeleton label="events" count={6} media="wide" />
    </div>
  );
}
