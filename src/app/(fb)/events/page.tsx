import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/features/fb/shell';
import { YourPlans } from '@/features/memories';
import { EmptyState, LinkButton } from '@/features/ui';
import { DEMO_AREA_LABEL } from '@/shared/demo';

export const metadata: Metadata = { title: 'Events' };

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const going = (await searchParams).tab === 'going';
  return (
    <div className="pb-4">
      <PageHeader title="Events" subtitle={going ? 'Your upcoming and past Out Here hangouts' : `Events near ${DEMO_AREA_LABEL}`} />
      <nav aria-label="Events views" className="mb-4 flex gap-2 px-4">
        <Link href="/events" aria-current={!going ? 'page' : undefined}
          className={`rounded-btn px-3 py-2 text-sm font-semibold ${going ? 'text-fb-text-2' : 'bg-fb-blue-tint text-fb-blue'}`}>Discover</Link>
        <Link href="/events?tab=going" aria-current={going ? 'page' : undefined}
          className={`rounded-btn px-3 py-2 text-sm font-semibold ${going ? 'bg-fb-blue-tint text-fb-blue' : 'text-fb-text-2'}`}>Going</Link>
      </nav>
      {going ? <div className="mx-auto max-w-[680px] px-4"><YourPlans /></div> : (
        // Discover has no list of its own yet: events live as pins on the Out Here map.
        <EmptyState
          title="Events are on the map"
          body={`Shows, runs and hangouts near ${DEMO_AREA_LABEL} show up as pins in Out Here.`}
          action={<LinkButton href="/out-here">Open the map</LinkButton>}
        />
      )}
    </div>
  );
}
