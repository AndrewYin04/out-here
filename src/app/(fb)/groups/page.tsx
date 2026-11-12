import type { Metadata } from 'next';
import { CardGridSkeleton, ComposerSkeleton, FeedSkeleton, PageHeader, SECTIONS, sectionRow } from '@/features/fb/shell';

export const metadata: Metadata = { title: 'Groups' };

// Rendered per request: the content and the section sidebar both follow ?tab=, and the
// sidebar's useSearchParams must not hit a static prerender (see SectionNav.tsx).
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ tab?: string | string[] }> };

// The section sidebar (or the chip row on phones) sets ?tab=; each tab gets its own loading shape.
export default async function GroupsPage({ searchParams }: Props) {
  const { tab } = await searchParams;
  const row = sectionRow(SECTIONS.groups, Array.isArray(tab) ? tab[0] : tab);
  if (row.id === 'feed') {
    return (
      <div className="mx-auto flex max-w-[680px] flex-col gap-2 pb-4 md:gap-4">
        <PageHeader title="Recent activity" />
        <ComposerSkeleton />
        <FeedSkeleton count={3} />
      </div>
    );
  }
  return (
    <div className="pb-4">
      <PageHeader title={row.id === 'yours' ? 'All groups you’ve joined' : 'Suggested for you'} />
      <CardGridSkeleton label={row.label.toLowerCase()} count={9} media="wide" className="xl:grid-cols-3 2xl:grid-cols-4" />
    </div>
  );
}
