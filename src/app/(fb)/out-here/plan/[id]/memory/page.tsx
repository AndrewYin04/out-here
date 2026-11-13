import type { Metadata } from 'next';
import { MemoryPage } from '@/features/memories';

export const metadata: Metadata = { title: 'Memory · Out Here' };

type Props = { params: Promise<{ id: string }> };

export default async function Page({ params }: Props) {
  const { id } = await params;
  return <MemoryPage id={id} />;
}
