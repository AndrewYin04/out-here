import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProfileView, type ProfileTab } from '@/features/fb/profile';
import { getDemoPerson } from '@/features/fb/shell/server';

type Props = {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ tab?: string | string[]; show?: string | string[] }>;
};

const TABS: readonly string[] = ['posts', 'about', 'friends', 'photos'] satisfies ProfileTab[];
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  return { title: getDemoPerson(handle)?.name ?? 'Profile' };
}

// The name comes from the static seed so unknown handles 404 on the server; everything the
// viewer may or may not see (fields, posts, friends) is fetched per persona on the client.
export default async function ProfilePage({ params, searchParams }: Props) {
  const { handle } = await params;
  const sp = await searchParams;
  const person = getDemoPerson(handle);
  if (!person) notFound();
  const t = first(sp.tab) ?? 'posts';
  const tab = (TABS.includes(t) ? t : 'posts') as ProfileTab;
  return <ProfileView key={handle} handle={handle} tab={tab} showMutual={first(sp.show) === 'mutual'} />;
}
