import type { Metadata } from 'next';
import { GroupsIndex, type GroupsTab } from '@/features/fb/groups';
import { SECTIONS, sectionRow } from '@/features/fb/shell';

export const metadata: Metadata = { title: 'Groups' };

// Rendered per request: the content and the section sidebar both follow ?tab=, and the
// sidebar's useSearchParams must not hit a static prerender (see SectionNav.tsx).
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ tab?: string | string[] }> };

export default async function GroupsPage({ searchParams }: Props) {
  const { tab } = await searchParams;
  const row = sectionRow(SECTIONS.groups, Array.isArray(tab) ? tab[0] : tab);
  return <GroupsIndex tab={row.id as GroupsTab} />;
}
