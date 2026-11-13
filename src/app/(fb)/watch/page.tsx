import type { Metadata } from 'next';
import { WatchPage } from '@/features/fb/watch';

export const metadata: Metadata = { title: 'Video' };

export default function Page() {
  return <WatchPage />;
}
