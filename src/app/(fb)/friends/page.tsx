import type { Metadata } from 'next';
import { CardGridSkeleton, ChipRowSkeleton, PageHeader } from '@/features/fb/shell';

export const metadata: Metadata = { title: 'Friends' };

export default function FriendsPage() {
  return (
    <div className="pb-4">
      <PageHeader title="Friends" subtitle="Friend requests" />
      <ChipRowSkeleton count={4} />
      <CardGridSkeleton label="friend requests" count={3} />
      <h2 className="px-4 pb-3 pt-6 text-[20px] font-bold md:px-0">People you may know</h2>
      <CardGridSkeleton label="friend suggestions" count={6} />
    </div>
  );
}
