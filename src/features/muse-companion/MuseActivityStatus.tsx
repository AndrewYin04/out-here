
'use client';

import { useMuseActivity, useMuseSnapshot } from './controller';
import { MuseOrb } from './MuseOrb';
import { cn } from '@/features/ui';

/** One short acknowledgement beside the result it belongs to. Full outcomes stay in the surface. */
export function MuseActivityStatus({ owner, className, fallback }: { owner: string; className?: string; fallback?: string }) {
  const activity = useMuseActivity();
  const snap = useMuseSnapshot();
  if (!activity || activity.owner !== owner || snap.open || activity.outcome === 'cancelled') return fallback ? <p role="status" className={cn('py-2 text-[13px] leading-5 text-fb-text-2', className)}>{fallback}</p> : null;
  const text = activity.message || activity.pending;
  if (!text) return null;
  return (
    <div data-muse-activity-owner={owner} data-muse-activity-target={activity.target}
      data-testid="muse-activity-status" role="status" aria-live="polite" aria-atomic="true"
      className={cn('flex max-w-full items-center gap-2 py-2 text-[13px] leading-5 text-fb-text-2', className)}>
      <MuseOrb state={snap.state} size={26} />
      <p className="min-w-0"><span className="font-semibold text-fb-blue">Muse</span> <span>{text}</span></p>
    </div>
  );
}
