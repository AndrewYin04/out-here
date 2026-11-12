import Link from 'next/link';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';

type Size = 'sm' | 'md' | 'lg';
const SIZES: Record<Size, string> = { sm: 'h-8 w-8', md: 'h-9 w-9', lg: 'h-10 w-10' };

type Common = {
  /** Required: icon-only controls need an accessible name. */
  label: string;
  size?: Size;
  /** grey = round grey fill (top bar); plain = transparent until hover. */
  tone?: 'grey' | 'plain';
  active?: boolean;
  badge?: ReactNode;
  children: ReactNode;
};

function classes({ size = 'lg', tone = 'grey', active = false }: Pick<Common, 'size' | 'tone' | 'active'>) {
  return cn(
    'relative inline-flex shrink-0 items-center justify-center rounded-full transition-colors',
    SIZES[size],
    active
      ? 'bg-fb-blue-tint text-fb-blue'
      : cn('text-fb-text', tone === 'grey' ? 'bg-fb-secondary-btn hover:bg-fb-secondary-btn-hover' : 'hover:bg-fb-hover'),
  );
}

export type IconButtonProps = Common & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>;

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size, tone, active, badge, children, className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(classes({ size, tone, active }), className)}
      {...rest}
    >
      {children}
      {badge}
    </button>
  );
});

export type IconLinkProps = Common & { href: string; className?: string; current?: boolean };

/** IconButton look for a control that navigates. */
export function IconLink({ label, size, tone, active, badge, children, className, href, current }: IconLinkProps) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      aria-current={current ? 'page' : undefined}
      className={cn(classes({ size, tone, active }), className)}
    >
      {children}
      {badge}
    </Link>
  );
}
