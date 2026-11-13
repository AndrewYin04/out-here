import type { Metadata } from 'next';
import { ListingPage } from '@/features/fb/marketplace';

export const metadata: Metadata = { title: 'Marketplace' };

type Props = { params: Promise<{ id: string }> };

export default async function Page({ params }: Props) {
  const { id } = await params;
  return <ListingPage id={id} />;
}
