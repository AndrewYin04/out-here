import type { Metadata } from 'next';
import { Card, Divider, Skeleton, SkeletonGroup } from '@/features/ui';

export const metadata: Metadata = { title: 'Messenger' };

// Loading layout for Messenger: chat list (360 px) and conversation pane on desktop,
// chat list only on mobile.
export default function MessagesPage() {
  return (
    <div className="grid h-[calc(100dvh-112px)] md:h-[calc(100dvh-56px)] md:grid-cols-[360px_minmax(0,1fr)]">
      <Card as="section" className="flex flex-col overflow-hidden rounded-none shadow-none md:border-r md:border-fb-divider-soft" aria-labelledby="chats-title">
        <div className="px-4 pb-2 pt-3">
          <h1 id="chats-title" className="text-fb-title font-bold">Chats</h1>
          <Skeleton className="mt-3 h-9 w-full rounded-pill" />
        </div>
        <SkeletonGroup label="chats" className="flex-1 overflow-hidden px-2">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-card px-2 py-2">
              <Skeleton shape="circle" width={56} height={56} />
              <div className="flex-1 space-y-2">
                <Skeleton width={`${55 - (i % 3) * 10}%`} />
                <Skeleton width="75%" className="h-2.5" />
              </div>
            </div>
          ))}
        </SkeletonGroup>
      </Card>
      <section className="hidden flex-col bg-fb-surface md:flex" aria-label="Conversation">
        <div className="flex h-16 items-center gap-3 px-4">
          <Skeleton shape="circle" width={40} height={40} />
          <Skeleton width={140} />
        </div>
        <Divider soft />
        <SkeletonGroup label="messages" className="flex flex-1 flex-col justify-end gap-2 p-4">
          {[180, 260, 140, 220, 120].map((w, i) => (
            <Skeleton key={i} className={i % 2 ? 'h-9 self-end rounded-[18px] bg-fb-blue-tint' : 'h-9 rounded-[18px]'} width={w} />
          ))}
        </SkeletonGroup>
        <div className="flex items-center gap-2 p-3">
          <Skeleton className="h-9 flex-1 rounded-pill" />
        </div>
      </section>
    </div>
  );
}
