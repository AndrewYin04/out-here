import type { Metadata } from 'next';
import { PageHeader } from '@/features/fb/shell';
import { EmptyState, LinkButton } from '@/features/ui';

export const metadata: Metadata = { title: 'Search' };

type Props = { searchParams: Promise<{ q?: string | string[] }> };

// Search results are not built yet (tracker #29). Say so instead of showing a loader forever.
export default async function SearchPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const query = (Array.isArray(q) ? q[0] : q)?.trim() ?? '';
  return (
    <div className="pb-4">
      <PageHeader title="Search" subtitle={query ? `“${query}”` : undefined} />
      <EmptyState
        title="Search isn’t available in this demo"
        body="Find people in Friends, and plans on the Out Here map."
        action={<LinkButton href="/friends">Go to Friends</LinkButton>}
      />
    </div>
  );
}
