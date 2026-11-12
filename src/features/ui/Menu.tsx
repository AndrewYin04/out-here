'use client';

import Link from 'next/link';
import {
  useCallback,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cn } from './cn';
import { useDismiss } from './useOverlay';

export type PopoverTriggerProps = {
  onClick: () => void;
  'aria-expanded': boolean;
  'aria-haspopup': 'menu' | 'dialog';
  'aria-controls': string;
};

export type PopoverProps = {
  /** Render the opener; spread the given props onto a button. */
  trigger: (props: PopoverTriggerProps, open: boolean) => ReactNode;
  /** Panel content; call close() after an action. */
  children: (close: () => void) => ReactNode;
  align?: 'left' | 'right';
  /** 'menu' gives the panel role="menu" and arrow-key navigation. */
  kind?: 'menu' | 'dialog';
  label: string;
  width?: number;
  className?: string;
};

/** Anchored panel under its trigger (account menu, menu grid). Closes on Escape or outside press. */
export function Popover({ trigger, children, align = 'right', kind = 'menu', label, width = 344, className }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, root);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (kind !== 'menu' || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    if (items.length === 0) return;
    e.preventDefault();
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'ArrowDown' ? (at + 1) % items.length : (at - 1 + items.length) % items.length;
    items[next].focus();
  };

  return (
    <div ref={root} className="relative">
      {trigger(
        { onClick: () => setOpen((v) => !v), 'aria-expanded': open, 'aria-haspopup': kind, 'aria-controls': panelId },
        open,
      )}
      {open && (
        <div
          id={panelId}
          role={kind}
          aria-label={label}
          onKeyDown={onKeyDown}
          style={{ width }}
          className={cn(
            'absolute top-[calc(100%+8px)] z-50 max-h-[calc(100vh-72px)] max-w-[calc(100vw-16px)] overflow-y-auto rounded-card bg-fb-surface p-2 shadow-popover',
            align === 'right' ? 'right-0' : 'left-0',
            className,
          )}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}

type ItemCommon = { icon?: ReactNode; children: ReactNode; description?: ReactNode; selected?: boolean; className?: string };

const itemClass = (selected?: boolean) =>
  cn(
    'flex w-full items-center gap-3 rounded-card px-2 py-2 text-left text-[15px] font-medium text-fb-text',
    'hover:bg-fb-hover focus-visible:bg-fb-hover',
    selected && 'bg-fb-blue-tint',
  );

function ItemBody({ icon, children, description }: Omit<ItemCommon, 'className' | 'selected'>) {
  return (
    <>
      {icon && <span className="flex shrink-0 items-center justify-center">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{children}</span>
        {description && <span className="block truncate text-fb-meta font-normal text-fb-text-2">{description}</span>}
      </span>
    </>
  );
}

export function MenuItem({ onSelect, ...props }: ItemCommon & { onSelect: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-current={props.selected || undefined}
      onClick={onSelect}
      className={cn(itemClass(props.selected), props.className)}
    >
      <ItemBody icon={props.icon} description={props.description}>{props.children}</ItemBody>
    </button>
  );
}

export function MenuLink({ href, onNavigate, ...props }: ItemCommon & { href: string; onNavigate?: () => void }) {
  return (
    <Link href={href} role="menuitem" onClick={onNavigate} className={cn(itemClass(props.selected), props.className)}>
      <ItemBody icon={props.icon} description={props.description}>{props.children}</ItemBody>
    </Link>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-2 pb-1 pt-2 text-fb-rail font-semibold text-fb-text">{children}</div>;
}

export function MenuSeparator() {
  return <div role="separator" className="mx-2 my-2 h-px bg-fb-divider" />;
}
