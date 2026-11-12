import type { Metadata } from 'next';
import { BRAND } from '@/config/brand';
import { Skeleton, SkeletonGroup } from '@/features/ui';
import { ImFreeButton, PlanSheet } from '@/features/outhere';
import { DEMO_AREA_LABEL } from '@/shared/demo';

export const metadata: Metadata = { title: 'Map' };

// Loading layout for the map surface: full-bleed map area, Friends/Explore toggle and the
// "I'm free" pill. The map builder replaces this page's content.
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
      </SkeletonGroup>
      {/* M2b outhere builder: until the map builder's page lands, mount the loop UI here. */}
      <div className="absolute inset-x-0 bottom-6 z-20 flex justify-center">
        <ImFreeButton />
      </div>
      <PlanSheet />
    </div>
  );
}
