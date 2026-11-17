import type { Metadata } from 'next';
import { LeftNav, PageHeader } from '@/features/fb/shell';

export const metadata: Metadata = { title: 'Menu' };

// Mobile Menu tab: the left nav's destinations, shortcuts and the brand footer.
export default function MenuPage() {
  return (
    <div className="pb-4">
      <PageHeader title="Menu" />
      <LeftNav className="pt-0" />
    </div>
  );
}
