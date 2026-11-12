import type { Metadata } from 'next';
import { BRAND } from '@/config/brand';
import { Skeleton, SkeletonGroup } from '@/features/ui';
import { ImFreeButton, PlanSheet } from '@/features/outhere';
import { DEMO_AREA_LABEL } from '@/shared/demo';

export const metadata: Metadata = { title: 'Map' };

// Loading layout for the map surface: full-bleed map area, Friends/Explore toggle and the
// "I'm free" composer sheet. The map builder replaces this page's content.
export default function OutHerePage() {
  return (
    <div className="relative h-[calc(100dvh-112px)] overflow-hidden bg-[#E9EEF2] md:h-[calc(100dvh-56px)]">
      <h1 className="sr-only">
        {BRAND.appName} map, {DEMO_AREA_LABEL}
      </h1>
      <SkeletonGroup label="map" className="absolute inset-0">
        {/* street grid hint */}
        <div aria-hidden className="absolute inset-0 opacity-60 [background-image:linear-gradient(#fff_2px,transparent_2px),linear-gradient(90deg,#fff_2px,transparent_2px)] [background-size:120px_120px]" />
        {[
          ['22%', '30%'],
          ['48%', '44%'],
          ['63%', '26%'],
          ['36%', '62%'],
          ['70%', '58%'],
        ].map(([left, top]) => (
          <span key={left + top} className="absolute rounded-full bg-white p-1 shadow-card" style={{ left, top }}>
            <Skeleton shape="circle" width={36} height={36} />
          </span>
        ))}
        <div className="absolute left-1/2 top-3 flex -translate-x-1/2 gap-1 rounded-pill bg-fb-surface p-1 shadow-card">
          <Skeleton className="h-8 rounded-pill" width={84} />
          <Skeleton className="h-8 rounded-pill" width={84} />
        </div>
        <div className="absolute inset-x-0 bottom-0 rounded-t-sheet bg-fb-surface p-4 shadow-popover md:inset-x-auto md:bottom-4 md:left-4 md:w-[400px] md:rounded-card">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-fb-divider md:hidden" />
          <Skeleton width="45%" className="h-4" />
          <Skeleton className="mt-3 h-11 w-full rounded-pill" />
          <div className="mt-3 flex gap-2">
            <Skeleton className="h-8 rounded-pill" width={80} />
            <Skeleton className="h-8 rounded-pill" width={96} />
            <Skeleton className="h-8 rounded-pill" width={72} />
          </div>
        </div>
      </SkeletonGroup>
      {/* M2b outhere builder: until the map builder's page lands, mount the loop UI here. */}
      <div className="absolute inset-x-0 bottom-6 z-20 flex justify-center">
        <ImFreeButton />
      </div>
      <PlanSheet />
    </div>
  );
}
