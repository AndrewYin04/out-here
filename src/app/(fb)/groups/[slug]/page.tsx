import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { GroupPage, type GroupTab } from '@/features/fb/groups';
import { getDemoGroup } from '@/features/fb/shell/server';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string | string[] }> };

const TABS: GroupTab[] = ['discussion', 'members', 'hangouts'];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { title: getDemoGroup(slug)?.name ?? 'Group' };
}

export default async function Page({ params, searchParams }: Props) {
  const { slug } = await params;
  if (!getDemoGroup(slug)) notFound();
  const raw = (await searchParams).tab;
  const tab = (Array.isArray(raw) ? raw[0] : raw) as GroupTab | undefined;
  return <GroupPage slug={slug} initialTab={tab && TABS.includes(tab) ? tab : 'discussion'} />;
}
