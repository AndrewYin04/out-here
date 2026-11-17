import type { ReactNode } from 'react';
import { cn } from './cn';

export type SkeletonProps = {
  className?: string;
  /** circle = avatar placeholder, line = text line, block = image or card area. */
  shape?: 'circle' | 'line' | 'block';
  width?: number | string;
  height?: number | string;
};

/** Grey shimmer placeholder. Hidden from assistive tech; wrap groups in <SkeletonGroup>. */
export function Skeleton({ className, shape = 'line', width, height }: SkeletonProps) {
  return (
    <span
      aria-hidden
      className={cn(
        'block animate-shimmer bg-fb-skeleton',
        shape === 'circle' && 'shrink-0 rounded-full',
        shape === 'line' && 'h-3 rounded-full',
        shape === 'block' && 'rounded-card',
        className,
      )}
      style={{ width, height }}
    />
  );
}

/** Announces "Loading <label>" once for a region full of Skeletons. */
export function SkeletonGroup({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">Loading {label}</span>
      {children}
    </div>
  );
}
