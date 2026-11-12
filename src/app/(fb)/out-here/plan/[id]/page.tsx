import type { Metadata } from 'next';
import { PlanPage } from '@/features/map';

export const metadata: Metadata = { title: 'Plan · Out Here' };

type Props = { params: Promise<{ id: string }> };

export default async function Page({ params }: Props) {
  const { id } = await params;
  return <PlanPage id={id} />;
}
