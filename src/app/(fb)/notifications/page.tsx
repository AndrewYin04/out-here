import type { Metadata } from 'next';
import { ChipRowSkeleton, ListSkeleton, PageHeader } from '@/features/fb/shell';

export const metadata: Metadata = { title: 'Notifications' };

export default function NotificationsPage() {
  return (
    <div className="pb-4">
      <PageHeader title="Notifications" />
      <ChipRowSkeleton count={2} />
      <h2 className="px-4 pb-2 text-fb-rail font-semibold md:px-0">New</h2>
      <ListSkeleton label="new notifications" rows={3} />
      <h2 className="px-4 pb-2 pt-4 text-fb-rail font-semibold md:px-0">Earlier</h2>
      <ListSkeleton label="earlier notifications" rows={5} />
    </div>
  );
}
