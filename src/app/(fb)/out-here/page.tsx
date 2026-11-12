import type { Metadata } from 'next';
import { OutHereView } from '@/features/map';

export const metadata: Metadata = { title: 'Out Here' };

export default function OutHerePage() {
  return <OutHereView />;
}
