import type { Metadata } from 'next';
import { FriendsView, type FriendsTab } from '@/features/fb/friends';
import { SECTIONS, sectionRow } from '@/features/fb/shell';

export const metadata: Metadata = { title: 'Friends' };

// Rendered per request: the content and the section sidebar both follow ?tab=, and the
// sidebar's useSearchParams must not hit a static prerender (see SectionNav.tsx).
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ tab?: string | string[] }> };

const TABS: readonly string[] = ['home', 'requests', 'suggestions', 'all', 'birthdays', 'lists'] satisfies FriendsTab[];

export default async function FriendsPage({ searchParams }: Props) {
  const { tab } = await searchParams;
  const row = sectionRow(SECTIONS.friends, Array.isArray(tab) ? tab[0] : tab);
  const id = TABS.includes(row.id) ? (row.id as FriendsTab) : 'home';
  return <FriendsView key={id} tab={id} />;
}
