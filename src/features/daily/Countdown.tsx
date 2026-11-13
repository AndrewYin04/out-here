'use client';

import { formatCountdown, remainingMs } from '@/shared';
import { cn } from '@/features/ui';

/**
 * Time left until `until`, from the server-corrected clock. Never negative; stops at zero. The
 * digits update every second without animation; a screen reader hears one calm update a minute.
 */
export function Countdown({ now, until, className, label = 'Time left' }: { now: Date; until: string; className?: string; label?: string }) {
  const ms = remainingMs(now, until);
  const minutes = Math.ceil(ms / 60_000);
  return (
    <div className={cn('text-center', className)}>
      <div role="timer" aria-live="off" aria-label={`${label}: ${formatCountdown(ms)}`} data-testid="countdown" data-ms={ms}
        className="font-bold tabular-nums leading-none tracking-tight">
        {formatCountdown(ms)}
      </div>
      <span className="sr-only" role="status" aria-live="polite">{ms > 0 ? `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} left` : 'Time is up'}</span>
    </div>
  );
}
