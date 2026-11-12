import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

type Common = { selected?: boolean; icon?: ReactNode; className?: string; children: ReactNode };

function chipClass(selected: boolean) {
  return cn(
    'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-pill px-3 text-[15px] font-semibold transition-colors',
    selected ? 'bg-fb-blue-tint text-fb-blue' : 'bg-fb-secondary-btn text-fb-text hover:bg-fb-secondary-btn-hover',
  );
}

export type ChipProps = Common & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>;

/** Toggle pill (filters such as "All" / "Unread"). */
export function Chip({ selected = false, icon, className, children, type = 'button', ...rest }: ChipProps) {
  return (
    <button type={type} aria-pressed={selected} className={cn(chipClass(selected), className)} {...rest}>
      {icon}
      {children}
    </button>
  );
}

export function ChipLink({ selected = false, icon, className, children, href }: Common & { href: string }) {
  return (
    <Link href={href} aria-current={selected ? 'page' : undefined} className={cn(chipClass(selected), className)}>
      {icon}
      {children}
    </Link>
  );
}
