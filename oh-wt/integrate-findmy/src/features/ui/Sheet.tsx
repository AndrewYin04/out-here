'use client';

import { X } from 'lucide-react';
import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from './cn';
import { IconButton } from './IconButton';
import { useModalBehavior, useMounted } from './useOverlay';

export type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Visually hide the title row (the title is still read by screen readers). */
  hideHeader?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  /** Side of the desktop panel. */
  side?: 'right' | 'left';
  className?: string;
};

/**
 * Bottom sheet below 768 px (rounded top, drag handle, up to 85% of the screen tall);
 * a full-height side panel under the 56 px top bar on desktop.
 */
export function Sheet({ open, onClose, title, hideHeader = false, children, footer, side = 'right', className }: SheetProps) {
  const mounted = useMounted();
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModalBehavior(open, onClose, panel);
  if (!mounted || !open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 md:top-14">
      <div className="absolute inset-0 bg-fb-scrim md:bg-black/10" aria-hidden onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-sheet bg-fb-surface shadow-popover',
          'md:inset-x-auto md:bottom-0 md:top-0 md:max-h-none md:w-[400px] md:rounded-none',
          side === 'right' ? 'md:right-0' : 'md:left-0',
          className,
        )}
      >
        <div className="flex justify-center pt-2 md:hidden" aria-hidden>
          <span className="h-1 w-10 rounded-full bg-fb-divider" />
        </div>
        <div className={cn('flex shrink-0 items-center justify-between gap-2 px-4 py-2', hideHeader && 'sr-only')}>
          <h2 id={titleId} className="truncate text-[20px] font-bold">{title}</h2>
          <IconButton label="Close" size="md" onClick={onClose}>
            <X size={20} aria-hidden />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
        {footer && <div className="shrink-0 border-t border-fb-divider-soft p-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
