'use client';

import { ArrowLeft } from 'lucide-react';
import { cn, IconLink } from '@/features/ui';

/** Memories sits beside Friends on the Out Here map, so Back returns to the Friends map. */
export const MEMORIES_BACK_HREF = '/out-here?mode=friends';

export function BackButton({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex rounded-full bg-fb-surface shadow-card', className)} data-testid="memories-back">
      <IconLink href={MEMORIES_BACK_HREF} label="Back to Friends map">
        <ArrowLeft size={20} aria-hidden />
      </IconLink>
    </span>
  );
}
