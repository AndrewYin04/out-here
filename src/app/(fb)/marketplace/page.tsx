import type { Metadata } from 'next';
import { MarketplaceForYou } from '@/features/fb/marketplace';

export const metadata: Metadata = { title: 'Marketplace' };

export default function MarketplacePage() {
  return <MarketplaceForYou />;
}
