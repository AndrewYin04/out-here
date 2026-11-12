import type { Metadata } from 'next';
import { ListSkeleton, PageHeader } from '@/features/fb/shell';

export const metadata: Metadata = { title: 'Saved' };

export default function SavedPage() {
  return (
    <div className="pb-4">
      <PageHeader title="Saved" subtitle="Posts, events and plans you saved" />
      <ListSkeleton label="saved items" rows={5} avatar={80} />
    </div>
  );
}
