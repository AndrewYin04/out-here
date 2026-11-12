'use client';

import Link from 'next/link';
import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from './cn';

export type TabItem = { id: string; label: ReactNode; href?: string; count?: number };

export type TabsProps = {
  items: TabItem[];
  value: string;
  /** For button tabs. Link tabs (items with href) navigate instead. */
  onChange?: (id: string) => void;
  label: string;
  className?: string;
};

const tabClass = (active: boolean) =>
  cn(
    'relative inline-flex h-[60px] shrink-0 items-center gap-1.5 rounded-btn px-4 text-[15px] font-semibold transition-colors',
    active ? 'text-fb-blue' : 'text-fb-text-2 hover:bg-fb-hover',
  );

function Underline({ active }: { active: boolean }) {
  return active ? <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] rounded-t bg-fb-blue" /> : null;
}

function Count({ n }: { n?: number }) {
  return n ? <span className="text-fb-meta font-normal text-fb-text-2">{n}</span> : null;
}

/**
 * Horizontal tab row (profile, group, notifications). Active tab: blue text with a 3 px
 * underline. Scrolls sideways on narrow screens. Arrow keys move between button tabs.
 */
export function Tabs({ items, value, onChange, label, className }: TabsProps) {
  const list = useRef<HTMLDivElement>(null);
  const linkMode = items.every((i) => i.href);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (linkMode || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
    const at = items.findIndex((i) => i.id === value);
    const next = e.key === 'ArrowRight' ? (at + 1) % items.length : (at - 1 + items.length) % items.length;
    onChange?.(items[next].id);
    list.current?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
  };

  if (linkMode) {
    return (
      <nav aria-label={label} className={cn('flex overflow-x-auto', className)}>
        {items.map((i) => (
          <Link key={i.id} href={i.href!} aria-current={i.id === value ? 'page' : undefined} className={tabClass(i.id === value)}>
            {i.label}
            <Count n={i.count} />
            <Underline active={i.id === value} />
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <div ref={list} role="tablist" aria-label={label} onKeyDown={onKeyDown} className={cn('flex overflow-x-auto', className)}>
      {items.map((i) => (
        <button
          key={i.id}
          type="button"
          role="tab"
          aria-selected={i.id === value}
          tabIndex={i.id === value ? 0 : -1}
          onClick={() => onChange?.(i.id)}
          className={tabClass(i.id === value)}
        >
          {i.label}
          <Count n={i.count} />
          <Underline active={i.id === value} />
        </button>
      ))}
    </div>
  );
}
