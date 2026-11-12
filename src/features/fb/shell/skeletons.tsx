// Loading layouts for each surface's main column. Surface builders replace them with real
// content; until then every route shows the shape of what will load there.
import type { ReactNode } from 'react';
import { Card, Divider, Skeleton, SkeletonGroup, cn } from '@/features/ui';

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 px-4 pb-3 pt-4 md:px-0 md:pt-2">
      <div className="min-w-0">
        <h1 className="text-fb-title font-bold text-fb-text">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-fb-text-2">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PostSkeleton({ withMedia = false }: { withMedia?: boolean }) {
  return (
    <Card flushOnMobile className="overflow-hidden">
      <div className="flex items-center gap-2 px-4 pb-2 pt-3">
        <Skeleton shape="circle" width={40} height={40} />
        <div className="flex-1 space-y-2">
          <Skeleton width="35%" />
          <Skeleton width="20%" className="h-2.5" />
        </div>
      </div>
      <div className="space-y-2 px-4 pb-3">
        <Skeleton width="92%" />
        <Skeleton width="70%" />
      </div>
      {withMedia && <Skeleton shape="block" className="aspect-[16/9] w-full rounded-none" />}
      <div className="px-4">
        <div className="flex h-10 items-center justify-between">
          <Skeleton width={64} />
          <Skeleton width={110} />
        </div>
        <Divider soft />
        <div className="grid h-11 grid-cols-3 items-center gap-2">
          <Skeleton width="60%" className="mx-auto" />
          <Skeleton width="60%" className="mx-auto" />
          <Skeleton width="60%" className="mx-auto" />
        </div>
      </div>
    </Card>
  );
}

export function FeedSkeleton({ count = 3 }: { count?: number }) {
  return (
    <SkeletonGroup label="posts" className="flex flex-col gap-2 md:gap-4">
      {Array.from({ length: count }, (_, i) => (
        <PostSkeleton key={i} withMedia={i % 2 === 0} />
      ))}
    </SkeletonGroup>
  );
}

export function StoriesSkeleton() {
  return (
    <SkeletonGroup label="stories" className="flex gap-2 overflow-hidden px-4 py-3 md:px-0 md:py-0">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="relative h-[170px] w-[96px] shrink-0 overflow-hidden rounded-[12px] bg-fb-surface shadow-card md:h-[200px] md:w-[112px]">
          <Skeleton shape="block" className="h-full w-full rounded-none" />
          <Skeleton shape="circle" width={36} height={36} className="absolute left-3 top-3 ring-4 ring-fb-surface" />
          <Skeleton width="60%" className="absolute bottom-3 left-3 bg-fb-divider" />
        </div>
      ))}
    </SkeletonGroup>
  );
}

export function ComposerSkeleton() {
  return (
    <Card flushOnMobile className="px-4 py-3">
      <SkeletonGroup label="composer">
        <div className="flex items-center gap-2">
          <Skeleton shape="circle" width={40} height={40} />
          <Skeleton className="h-10 flex-1 rounded-pill" />
        </div>
        <Divider soft className="my-3 hidden md:block" />
        <div className="hidden grid-cols-3 gap-2 md:grid">
          <Skeleton width="70%" className="mx-auto" />
          <Skeleton width="70%" className="mx-auto" />
          <Skeleton width="70%" className="mx-auto" />
        </div>
      </SkeletonGroup>
    </Card>
  );
}

/** Rows like a notification list or a search result list. */
export function ListSkeleton({ rows = 6, avatar = 56, label }: { rows?: number; avatar?: number; label: string }) {
  return (
    <Card flushOnMobile className="p-2">
      <SkeletonGroup label={label}>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-card px-2 py-2">
            <Skeleton shape="circle" width={avatar} height={avatar} />
            <div className="flex-1 space-y-2">
              <Skeleton width={`${70 - (i % 3) * 12}%`} />
              <Skeleton width="25%" className="h-2.5" />
            </div>
          </div>
        ))}
      </SkeletonGroup>
    </Card>
  );
}

/** Person cards (Friends) or item cards (Events, Marketplace, Groups). */
export function CardGridSkeleton({
  count = 6,
  label,
  media = 'square',
  withButton = true,
  className,
}: {
  count?: number;
  label: string;
  media?: 'square' | 'wide';
  withButton?: boolean;
  className?: string;
}) {
  return (
    <SkeletonGroup label={label} className={cn('grid grid-cols-2 gap-2 px-2 md:grid-cols-3 md:px-0', className)}>
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} className="overflow-hidden">
          <Skeleton shape="block" className={cn('w-full rounded-none', media === 'square' ? 'aspect-square' : 'aspect-[16/9]')} />
          <div className="space-y-2 p-3">
            <Skeleton width="75%" />
            <Skeleton width="45%" className="h-2.5" />
            {withButton && <Skeleton shape="block" className="mt-3 h-9 w-full rounded-btn" />}
          </div>
        </Card>
      ))}
    </SkeletonGroup>
  );
}

export function ChipRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div aria-hidden className="flex gap-2 overflow-hidden px-4 pb-3 md:px-0">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-9 rounded-pill" width={72 + (i % 2) * 24} />
      ))}
    </div>
  );
}

/** Cover, avatar and name block for profile and group pages. */
export function CoverHeaderSkeleton({ round = true, label }: { round?: boolean; label: string }) {
  return (
    <SkeletonGroup label={label} className="bg-fb-surface shadow-card">
      <div className="mx-auto max-w-[1250px]">
        <Skeleton shape="block" className="h-[140px] w-full rounded-none md:h-[400px] md:rounded-b-card" />
        <div className="flex flex-col gap-4 px-4 pb-4 md:flex-row md:items-end md:px-8">
          {/* profile pages have a round avatar over the cover; group pages do not */}
          {round && (
            <Skeleton
              shape="circle"
              className="-mt-12 h-[120px] w-[120px] ring-4 ring-fb-surface md:-mt-20 md:h-[168px] md:w-[168px]"
            />
          )}
          <div className="flex-1 space-y-3 pt-2">
            <Skeleton className="h-6" width="40%" />
            <Skeleton width="20%" />
            <div className="flex -space-x-2">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} shape="circle" width={32} height={32} className="ring-2 ring-fb-surface" />
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton shape="block" className="h-9 w-32 rounded-btn" />
            <Skeleton shape="block" className="h-9 w-28 rounded-btn" />
          </div>
        </div>
        <Divider className="mx-4 w-auto md:mx-8" />
        <div className="flex gap-6 overflow-hidden px-4 py-5 md:px-8">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} width={64} />
          ))}
        </div>
      </div>
    </SkeletonGroup>
  );
}

/** Two-column body under a cover header: an About/Intro card left, posts right. */
export function SplitBodySkeleton() {
  return (
    <div className="mx-auto grid max-w-[940px] gap-4 py-4 md:grid-cols-[360px_minmax(0,1fr)] md:px-4">
      <Card flushOnMobile className="space-y-3 p-4">
        <Skeleton className="h-4" width="30%" />
        <Skeleton width="90%" />
        <Skeleton width="80%" />
        <Skeleton width="60%" />
        <Skeleton shape="block" className="mt-2 h-9 w-full rounded-btn" />
      </Card>
      <div className="flex flex-col gap-2 md:gap-4">
        <ComposerSkeleton />
        <FeedSkeleton count={2} />
      </div>
    </div>
  );
}
