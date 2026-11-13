import type { Metadata } from 'next';
import { ChipRowSkeleton, ListSkeleton, PageHeader } from '@/features/fb/shell';

export const metadata: Metadata = { title: 'Search' };

type Props = { searchParams: Promise<{ q?: string | string[] }> };

export default async function SearchPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const query = (Array.isArray(q) ? q[0] : q)?.trim() ?? '';
  return (
    <div className="pb-4">
      <PageHeader title="Search results" subtitle={query ? `for “${query}”` : 'People, groups, events and plans'} />
      <ChipRowSkeleton count={5} />
      <ListSkeleton label="search results" rows={6} avatar={60} />
    </div>
  );
}
