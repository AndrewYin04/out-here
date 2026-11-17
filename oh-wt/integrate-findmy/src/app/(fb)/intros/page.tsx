import type { Metadata } from 'next';
import { IntrosPage } from '@/features/intros';

export const metadata: Metadata = { title: 'Intros' };

export default function Page() {
  return <IntrosPage />;
}
