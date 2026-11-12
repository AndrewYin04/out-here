import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export type CardProps = HTMLAttributes<HTMLElement> & {
  as?: 'div' | 'section' | 'article' | 'aside';
  padded?: boolean;
  /** Mobile feed style: no radius or shadow below 768 px. */
  flushOnMobile?: boolean;
};

export function Card({ as: Tag = 'div', padded = false, flushOnMobile = false, className, ...rest }: CardProps) {
  return (
    <Tag
      className={cn(
        'bg-fb-surface',
        flushOnMobile ? 'md:rounded-card md:shadow-card' : 'rounded-card shadow-card',
        padded && 'p-3 md:px-4',
        className,
      )}
      {...rest}
    />
  );
}

export function CardHeader({ title, action, className }: { title: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-2 px-4 pb-2 pt-3', className)}>
      <h2 className="text-fb-rail font-semibold text-fb-text">{title}</h2>
      {action}
    </div>
  );
}
