import type { Metadata } from 'next';
import { SideQuestPage } from '@/features/daily';

export const metadata: Metadata = { title: 'Side Quest' };

export default function Page() {
  return <SideQuestPage />;
}
