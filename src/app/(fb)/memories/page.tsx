import type { Metadata } from 'next';
import { MemoriesPage } from '@/features/memories';

export const metadata: Metadata = { title: 'Memories' };

export default function Page() {
  return <MemoriesPage />;
}
