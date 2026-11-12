import type { Metadata } from 'next';
import { PostPage } from '@/features/fb/groups';

export const metadata: Metadata = { title: 'Post' };

type Props = { params: Promise<{ id: string }> };

export default async function Page({ params }: Props) {
  const { id } = await params;
  return <div className="md:pt-2"><PostPage id={id} /></div>;
}
