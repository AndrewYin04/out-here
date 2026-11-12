import type { Metadata } from 'next';
import { MemoryJourney } from '@/features/memories';

export const metadata: Metadata = { title: 'Memory' };

export default async function Page({ params }: { params: Promise<{ crewId: string }> }) {
  const { crewId } = await params;
  return <MemoryJourney crewId={decodeURIComponent(crewId)} />;
}
