'use client';

import { X } from 'lucide-react';
import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from './cn';
import { IconButton } from './IconButton';
import { useModalBehavior, useMounted } from './useOverlay';

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Width of the dialog on desktop. */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const WIDTHS = { sm: 'md:max-w-[400px]', md: 'md:max-w-[500px]', lg: 'md:max-w-[700px]' };

/** In-app dialog (the app never uses window.alert/confirm/prompt). Centered card with a title row. */
export function Modal({ open, onClose, title, children, footer, size = 'md', className }: ModalProps) {
  const mounted = useMounted();
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModalBehavior(open, onClose, panel);
  if (!mounted || !open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-center">
      <div className="absolute inset-0 bg-white/80" aria-hidden onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-sheet bg-fb-surface shadow-popover md:rounded-card',
          WIDTHS[size],
          className,
        )}
      >
        <div className="relative flex h-[60px] shrink-0 items-center justify-center border-b border-fb-divider-soft px-14">
          <h2 id={titleId} className="truncate text-[20px] font-bold">{title}</h2>
          <IconButton label="Close" size="md" onClick={onClose} className="absolute right-3 top-3">
            <X size={20} aria-hidden />
          </IconButton>
        </div>
        <div className="overflow-y-auto p-4">{children}</div>
        {footer && <div className="shrink-0 border-t border-fb-divider-soft p-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
