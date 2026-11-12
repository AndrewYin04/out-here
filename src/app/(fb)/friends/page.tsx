import type { Metadata } from 'next';
import { CardGridSkeleton, ListSkeleton, PageHeader, SECTIONS, sectionRow } from '@/features/fb/shell';

export const metadata: Metadata = { title: 'Friends' };

// Rendered per request: the content and the section sidebar both follow ?tab=, and the
// sidebar's useSearchParams must not hit a static prerender (see SectionNav.tsx).
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ tab?: string | string[] }> };

const GRID = 'md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5';

// The section sidebar (or the chip row on phones) sets ?tab=; each tab gets its own loading shape.
export default async function FriendsPage({ searchParams }: Props) {
  const { tab } = await searchParams;
  const row = sectionRow(SECTIONS.friends, Array.isArray(tab) ? tab[0] : tab);
  return (
    <div className="pb-4">
      {row.id === 'home' ? (
        <>
          <PageHeader title="Friend requests" />
          <CardGridSkeleton label="friend requests" count={4} className={GRID} />
          <h2 className="px-4 pb-3 pt-6 text-[20px] font-bold md:px-0">People you may know</h2>
          <CardGridSkeleton label="friend suggestions" count={10} className={GRID} />
        </>
      ) : row.id === 'all' || row.id === 'birthdays' ? (
        <>
          <PageHeader title={row.label} />
          <ListSkeleton label={row.label.toLowerCase()} rows={8} avatar={60} />
        </>
      ) : (
        <>
          <PageHeader title={row.label} />
          <CardGridSkeleton label={row.label.toLowerCase()} count={10} className={GRID} />
        </>
      )}
    </div>
  );
}
