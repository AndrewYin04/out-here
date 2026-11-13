import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MuseTrailLab } from '@/features/world/muse-trail/MuseTrailLab';

export const metadata: Metadata = { title: 'Muse trail lab' };

// Development test harness for the Muse energy trail. Not available in production builds.
export default function Page() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <MuseTrailLab />;
}
