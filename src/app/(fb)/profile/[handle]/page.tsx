import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CoverHeaderSkeleton, SplitBodySkeleton } from '@/features/fb/shell';
import { getDemoPerson } from '@/features/fb/shell/server';

type Props = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  return { title: getDemoPerson(handle)?.name ?? 'Profile' };
}

export default async function ProfilePage({ params }: Props) {
  const { handle } = await params;
  const person = getDemoPerson(handle);
  if (!person) notFound();
  return (
    <div>
      <h1 className="sr-only">{person.name}</h1>
      <CoverHeaderSkeleton label={`${person.name}'s profile`} />
      <SplitBodySkeleton />
    </div>
  );
}
