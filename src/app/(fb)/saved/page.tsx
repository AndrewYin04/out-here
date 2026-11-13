import type { Metadata } from 'next';
import { PageHeader } from '@/features/fb/shell';
import { EmptyState } from '@/features/ui';

export const metadata: Metadata = { title: 'Saved' };

export default function SavedPage() {
  return (
    <div className="pb-4">
      <PageHeader title="Saved" />
      <EmptyState title="Nothing saved yet" />
    </div>
  );
}
