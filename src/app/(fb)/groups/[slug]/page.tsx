import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CoverHeaderSkeleton, SplitBodySkeleton } from '@/features/fb/shell';
import { getDemoGroup } from '@/features/fb/shell/server';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { title: getDemoGroup(slug)?.name ?? 'Group' };
}

export default async function GroupPage({ params }: Props) {
  const { slug } = await params;
  const group = getDemoGroup(slug);
  if (!group) notFound();
  return (
    <div>
      <h1 className="sr-only">{group.name}</h1>
      <CoverHeaderSkeleton round={false} label={group.name} />
      <SplitBodySkeleton />
    </div>
  );
}
