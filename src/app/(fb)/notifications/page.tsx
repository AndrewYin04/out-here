import type { Metadata } from 'next';
import { NotificationsPage } from '@/features/fb/notifications';

export const metadata: Metadata = { title: 'Notifications' };

export default function Page() {
  return (
    <div className="pb-4 md:pt-2">
      <NotificationsPage />
    </div>
  );
}
