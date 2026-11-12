import type { Metadata } from 'next';
import { CardGridSkeleton, ChipRowSkeleton, FeedSkeleton, PageHeader } from '@/features/fb/shell';

export const metadata: Metadata = { title: 'Groups' };

export default function GroupsPage() {
  return (
    <div className="pb-4">
      <PageHeader title="Groups" subtitle="Your groups and suggestions" />
      <ChipRowSkeleton count={3} />
      <CardGridSkeleton label="your groups" count={3} media="wide" />
      <h2 className="px-4 pb-3 pt-6 text-[20px] font-bold md:px-0">Recent activity</h2>
      <FeedSkeleton count={2} />
    </div>
  );
}
